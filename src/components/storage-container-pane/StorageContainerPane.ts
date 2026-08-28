import { html } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import '../storage-header'
import '../storage-content-view'
import '../storage-creation-area'
import type { NamedNode } from 'rdflib'
import { customElement, log, utils, WebComponent } from 'solid-ui'
import { Resource, StoragePaneOutliner } from '../../types'
import { getResourcesForContainer, renderSelectedResourceInContentView } from '../../helpers'

@customElement('storage-container-pane')
export default class StorageContainerPane extends WebComponent {
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

  @state()
  accessor resources = getResourcesForContainer(this.store, this.subject!, this.resourceLogic)

  @query('storage-content-view')
  private accessor contentView: HTMLElement | null = null

  protected createRenderRoot() {
    return this
  }

  private syncResources () {
    if (!this.store || !this.subject) return

    this.resources = getResourcesForContainer(this.store, this.subject, this.resourceLogic)
  }

  private selectResource (resource: Resource) {
    this.selectedResource = resource.subject
    this.dispatchEvent(new CustomEvent('resource-selected', {
      detail: { resource: resource.subject },
      bubbles: true,
      composed: true,
    }))
  }

  private renderContainerPane (selectedResource: NamedNode) {
    if (!this.contentView) return

    const containerPane = document.createElement('storage-container-pane') as HTMLElement & {
      outliner?: StoragePaneOutliner
      store?: any
      subject?: NamedNode
      resourceLogic?: any
    }

    containerPane.outliner = this.outliner
    containerPane.store = this.store
    containerPane.subject = selectedResource
    containerPane.resourceLogic = this.resourceLogic

    this.contentView.replaceChildren(containerPane)
  }

  private async showResourceInContentView (selectedResource: NamedNode) {
    try {
      if (this.contentView) {
        await renderSelectedResourceInContentView({
          store: this.store,
          resourceLogic: this.resourceLogic,
          selectedResource,
          contentView: this.contentView,
          outliner: this.outliner,
          renderContainerPane: this.renderContainerPane.bind(this),
        })
      }
    } catch (error) {
      log.error('Unable to render selected resource: ' + error)
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

  protected updated (changedProperties: PropertyValues<this>) {
    if (changedProperties.has('selectedResource') && this.selectedResource) {
      void this.showResourceInContentView(this.selectedResource)
    }
  } 

  protected willUpdate (changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties)

    if (
      changedProperties.has('store') ||
      changedProperties.has('subject') ||
      changedProperties.has('resourceLogic')
    ) {
      this.syncResources()
    }
  }

  render () {
    return html`
      <div class="storage-container-pane">
        <div class="storage-container-pane-main-content">
          ${this.resources.size > 0
            ? html`
                <ul class="storage-container-pane-resource-list" role="listbox">
                  ${Array.from(this.resources.values()).map((resource) => this.renderResourceItem(resource, 0))}
                </ul>
              `
            : html`<div class="storage-container-pane-empty-message">No resources found in this container.</div>`
          }
          <storage-content-view></storage-content-view>
          <storage-creation-area
            .store=${this.store}
            .subject=${this.subject}
            @resource-created=${this.syncResources}
          ></storage-creation-area>
        </div>
      </div>
    `
  }
}
