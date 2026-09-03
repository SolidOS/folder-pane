import { customElement, DEFAULT_STORE, log, storeContext, WebComponent } from 'solid-ui'
import { DEFAULT_STORAGE_CONTEXT, storageContext } from '../storage-provider/context'
import { html } from 'lit'
import { property, query } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import { consume } from '@lit/context'
import { fileExplorerContext, type FileExplorerContext } from 'solid-ui'
import type { DataBrowserContext } from 'pane-registry'
import '../storage-header'
import '../storage-container-pane'
import '../storage-resource-sidebar'
import '../storage-content-view'
import { LiveStore, NamedNode } from 'rdflib'
import { StoragePaneOutliner } from '../../types'
import type { StorageContext } from '../storage-provider/context'
import { renderSelectedResourceInContentView } from '../../helpers'
@customElement('storage-pane-view')
export default class StoragePaneView extends WebComponent {

  @property({ attribute: false })
  accessor browserContext: DataBrowserContext | null = null

  @consume({ context: storeContext, subscribe: true })
  accessor store: LiveStore = DEFAULT_STORE

  @consume({ context: fileExplorerContext, subscribe: true })
  accessor fileExplorerContext: FileExplorerContext = undefined as unknown as FileExplorerContext

  @consume({ context: storageContext, subscribe: true })
  accessor storageContext: StorageContext = DEFAULT_STORAGE_CONTEXT

  @query('storage-content-view')
  private accessor contentView: HTMLElement | null = null

  @query('.storage-pane-status')
  private accessor statusArea: HTMLElement | null = null

  private renderedResourceUri: string | undefined = undefined

  // Keep the storage shell in light DOM: the legacy panes rendered into the
  // content view are styled by global stylesheets, which cannot cross a shadow boundary.
  protected createRenderRoot () {
    return this
  }

  protected updated (_changedProperties: PropertyValues<this>) {
    const selectedResource = this.currentSelectedResource

    if (!selectedResource) {
      return
    }

    if (this.renderedResourceUri !== selectedResource.uri) {
      this.renderedResourceUri = selectedResource.uri
      void this.showResourceInContentView(selectedResource)
    }
  }

  private get currentSelectedResource (): NamedNode | undefined {
    const subject = this.fileExplorerContext?.subjectUri
      ? new NamedNode(this.fileExplorerContext.subjectUri)
      : undefined

    return this.storageContext.selectedResource ?? subject
  }

  private renderContainerPane (selectedResource: NamedNode) {
    if (!this.contentView) return

    const containerPane = document.createElement('storage-container-pane') as HTMLElement & {
      outliner?: StoragePaneOutliner
      subject?: NamedNode
    }

    containerPane.subject = selectedResource
    containerPane.outliner = this.browserContext?.getOutliner(this.browserContext?.dom) as StoragePaneOutliner

    this.contentView.replaceChildren(containerPane)
  }

  private async showResourceInContentView (selectedResource: NamedNode) {
    try {
      if (this.contentView) {
        await renderSelectedResourceInContentView({
          store: this.store,
          selectedResource,
          contentView: this.contentView,
          outliner: this.browserContext?.getOutliner(this.browserContext?.dom) as StoragePaneOutliner,
          renderContainerPane: this.renderContainerPane.bind(this),
        })
      }
    } catch (error) {
      log.error('Unable to render selected resource: ' + error)
    }
  }

  private getStatusArea = () => this.statusArea

  render () {
    return html`
      <storage-header
        .getStatusArea=${this.getStatusArea}
        .browserContext=${this.browserContext}
      ></storage-header>
      <div class="storage-pane-main-content">
        <div class="storage-pane-section">
          <storage-resource-sidebar
            .dom=${this.browserContext?.dom}
          ></storage-resource-sidebar>
          <div class="storage-pane-content-column">
            <!-- the status area here is temporary. it is to hold the status that comes from the panes
            when a new pane is created. we should actually modify the panes themselves to handle this differently -->
            <div class="storage-pane-status"></div>
            <storage-content-view></storage-content-view>
          </div>
        </div>
      </div>
    `
  }
}
