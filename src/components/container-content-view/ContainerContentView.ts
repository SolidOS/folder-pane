import { html } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import '../storage-content-view'
import type { NamedNode } from 'rdflib'
import { customElement, log, utils, WebComponent } from 'solid-ui'
import { Resource, StoragePaneOutliner } from '../../types'
import { getResourcesForContainer, renderSelectedResourceInContentView } from '../../helpers'

@customElement('container-content-view')
export default class ContainerContentView extends WebComponent {
  @property({ attribute: false })
  accessor outliner: StoragePaneOutliner | undefined = undefined

  @property({ attribute: false })
  accessor store: any = null

  @property({ attribute: false })
  accessor subject: NamedNode | undefined = undefined

  @property({ attribute: false })
  accessor resourceLogic: any = null

  @state()
  accessor selectedResource: NamedNode | undefined = undefined

  private renderGeneration = 0

  @query('storage-content-view')
  private accessor contentView: HTMLElement | null = null

  private selectResource (resource: Resource) {
    this.selectedResource = resource.subject
    this.dispatchEvent(new CustomEvent('resource-selected', {
      detail: { resource: resource.subject },
      bubbles: true,
      composed: true,
    }))
  }

  private renderContainerView (selectedResource: NamedNode) {
    if (!this.contentView) return

    const containerView = document.createElement('container-content-view') as HTMLElement & {
      outliner?: StoragePaneOutliner
      store?: any
      subject?: NamedNode
      resourceLogic?: any
    }

    containerView.outliner = this.outliner
    containerView.store = this.store
    containerView.subject = selectedResource
    containerView.resourceLogic = this.resourceLogic

    this.contentView.replaceChildren(containerView)
  }

  private async showResourceInContentView (selectedResource: NamedNode) {
    const renderGeneration = ++this.renderGeneration

    try {
      if (this.contentView) {
        await renderSelectedResourceInContentView({
          store: this.store,
          resourceLogic: this.resourceLogic,
          selectedResource,
          contentView: this.contentView,
          outliner: this.outliner,
          renderContainerView: this.renderContainerView.bind(this),
          isCurrentSelection: (candidate) => renderGeneration === this.renderGeneration && this.selectedResource?.sameTerm(candidate) === true,
        })
      }
    } catch (error) {
      log.error('Unable to render selected resource: ' + error)
    }
  }

  protected updated (changedProperties: PropertyValues<this>) {
    if (changedProperties.has('selectedResource') && this.selectedResource) {
      void this.showResourceInContentView(this.selectedResource)
    }
  }
  private isSelectedResource (resource: Resource) {
    return this.selectedResource?.sameTerm(resource.subject) ?? false
  }

  private renderResourceItem (resource: Resource, depth: number) {
    const selected = this.isSelectedResource(resource)

    return html`
      <li
        class=${selected ? 'obj selected' : 'obj'}
        notSelectable="false"
        aria-selected=${String(selected)}
        about=${resource.subject.toNT()}
        role="option"
        tabindex="0"
        .subject=${resource.subject}
        @click=${() => this.selectResource(resource)}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            this.selectResource(resource)
          }
        }}
      >
        ${utils.label(resource.subject)}
      </li>
    `
  }

  render () {
    return html`
      <div class="container-content-view">
        <div class="container-content-view-main-content">
          ${getResourcesForContainer(this.store, this.subject!, this.resourceLogic).size > 0
            ? html`
                <ul class="folder-content-view-resource-list" role="listbox">
                  ${Array.from(getResourcesForContainer(this.store, this.subject!, this.resourceLogic).values()).map((resource) => this.renderResourceItem(resource, 0))}
                </ul>
              `
            : html`<div class="container-content-view-empty-message">No resources found in this container.</div>`
          }
          <storage-content-view></storage-content-view>
        </div>
      </div>
    `
  }
}
