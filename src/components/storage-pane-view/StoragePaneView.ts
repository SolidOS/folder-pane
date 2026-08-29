import { customElement, log, WebComponent } from 'solid-ui'
import { html } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import type { DataBrowserContext } from 'pane-registry'
import '../storage-header'
import '../storage-container-pane'
import '../storage-resource-sidebar'
import '../storage-content-view'
import type { NamedNode } from 'rdflib'
import { StoragePaneOutliner } from '../../types'
import { renderSelectedResourceInContentView } from '../../helpers'


@customElement('storage-pane-view')
export default class StoragePaneView extends WebComponent {
  @property({ attribute: false })
  accessor dom: HTMLDocument | null = null

  @property({ attribute: false })
  accessor browserContext: DataBrowserContext | null = null

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

  @query('storage-content-view')
  private accessor contentView: HTMLElement | null = null

  protected createRenderRoot() {
    // Keep the storage shell in light DOM for now; using a shadow-root host
    // would require every pane rendered inside it to already be a WebComponent
    // with its own shadow styles.
    return this
  }

  protected updated (changedProperties: PropertyValues<this>) {
    if (changedProperties.has('selectedResource') && this.selectedResource) {
      void this.showResourceInContentView(this.selectedResource)
    }
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

  private handleResourceSelected = (event: CustomEvent<{ resource: NamedNode }>) => {
    if (!event.detail?.resource) return

    this.selectedResource = event.detail.resource
  }

  render () {
    return html`
      <storage-header
        .subject=${this.subject}
        .selectedResource=${this.selectedResource}
        .browserContext=${this.browserContext}
      ></storage-header>
      <div class="storage-pane-main-content">
        <div class="storage-pane-section">
          <storage-resource-sidebar
            .dom=${this.dom}
            .store=${this.store}
            .resourceLogic=${this.resourceLogic}
            .subject=${this.subject}
            @resource-selected=${this.handleResourceSelected}
          ></storage-resource-sidebar>
          <storage-content-view></storage-content-view>
        </div>
      </div>
    `
  }
}
