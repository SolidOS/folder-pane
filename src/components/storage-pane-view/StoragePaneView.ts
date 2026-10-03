import { customElement, log, WebComponent } from 'solid-ui'
import { html } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import '../container-content-view'
import '../storage-sidebar'
import '../storage-content-view'
import type { NamedNode } from 'rdflib'
import { StoragePaneOutliner } from '../../types'
import { renderSelectedResourceInContentView } from '../../helpers'


@customElement('storage-pane-view')
export default class StoragePaneView extends WebComponent {
  @property({ attribute: false })
  accessor dom: HTMLDocument | null = null

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

  protected createRenderRoot () {
    return this
  }

  protected updated (changedProperties: PropertyValues<this>) {
    if (changedProperties.has('selectedResource') && this.selectedResource) {
      void this.showResourceInContentView(this.selectedResource)
    }
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

  private handleResourceSelected = (event: CustomEvent<{ resource: NamedNode }>) => {
    if (!event.detail?.resource) return

    this.selectedResource = event.detail.resource
  }

  render () {
    return html`
      <div class="storage-pane-main-content" @resource-selected=${this.handleResourceSelected}>
        <div class="storage-pane-section">
          <storage-sidebar
            .dom=${this.dom}
            .store=${this.store}
            .resourceLogic=${this.resourceLogic}
            .subject=${this.subject}
            @resource-selected=${this.handleResourceSelected}
          ></storage-sidebar>
          <storage-content-view></storage-content-view>
        </div>
      </div>
    `
  }
}
