import { customElement, DEFAULT_STORE, log, storeContext, WebComponent } from 'solid-ui'
import { DEFAULT_STORAGE_CONTEXT, storageContext } from '../storage-provider/context'
import { html } from 'lit'
import { property, query } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import { consume } from '@lit/context'
import { fileExplorerContext, getRelevantPane, getRelevantPanes, type FileExplorerContext } from 'solid-ui'
import type { DataBrowserContext, PaneDefinition } from 'pane-registry'
import { byName } from 'pane-registry'
import '../storage-header'
import '../storage-container-pane'
import '../storage-resource-sidebar'
import '../storage-content-view'
import { LiveStore, NamedNode } from 'rdflib'
import { StoragePaneOutliner } from '../../types'
import type { StorageContext } from '../storage-provider/context'
import { containerHasIndexDocument, getContainerIndexThing, renderSelectedResourceInContentView } from '../../helpers'
import { solidLogicSingleton } from 'solid-logic'
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

  @query('.storage-pane-full-view')
  private accessor fullView: HTMLElement | null = null

  @query('.storage-pane-status')
  private accessor statusArea: HTMLElement | null = null

  private renderedSelectionKey: string | undefined = undefined

  // Keep the storage shell in light DOM: the legacy panes rendered into the
  // content view are styled by global stylesheets, which cannot cross a shadow boundary.
  protected createRenderRoot () {
    return this
  }

  protected updated (_changedProperties: PropertyValues<this>) {
    const selectedResource = this.currentSelectedResource
    const selectedPaneName = this.storageContext.selectedPaneName

    if (!selectedResource) {
      return
    }

    this.setOuterNavbarHidden(selectedPaneName === 'resource' || selectedPaneName === 'internal')

    const selectionKey = `${selectedResource.uri}::${selectedPaneName ?? ''}`

    if (this.renderedSelectionKey !== selectionKey) {
      this.renderedSelectionKey = selectionKey

      if (selectedPaneName === 'resource') {
        void this.showResourceInFullView(selectedResource)
      } else if (selectedPaneName === 'internal') {
        void this.showSelectedPaneInFullView(selectedResource, selectedPaneName)
      } else if (selectedPaneName) {
        void this.showSelectedPaneInContentView(selectedResource, selectedPaneName)
      } else {
        void this.showResourceInContentView(selectedResource)
      }
    }
  }

  private setOuterNavbarHidden (hidden: boolean) {
    const navbar = document.querySelector<HTMLElement>('solid-panes-navbar')

    if (!navbar) {
      return
    }

    navbar.classList.toggle('navbar--hidden', hidden)
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
      browserContext?: DataBrowserContext | null
      subject?: NamedNode
    }

    containerPane.subject = selectedResource
    containerPane.browserContext = this.browserContext
    containerPane.outliner = this.browserContext?.getOutliner(this.browserContext?.dom) as StoragePaneOutliner

    this.contentView.replaceChildren(containerPane)
  }

  private renderContainerPaneInFullView (selectedResource: NamedNode) {
    if (!this.fullView) return

    const containerPane = document.createElement('storage-container-pane') as HTMLElement & {
      outliner?: StoragePaneOutliner
      browserContext?: DataBrowserContext | null
      subject?: NamedNode
    }

    containerPane.subject = selectedResource
    containerPane.browserContext = this.browserContext
    containerPane.outliner = this.browserContext?.getOutliner(this.browserContext?.dom) as StoragePaneOutliner

    this.fullView.replaceChildren(containerPane)
  }

  private renderAccessDeniedScreen (targetView: HTMLElement) {
    const message = document.createElement('div')
    message.className = 'storage-pane-access-denied-message storage-container-pane-empty-message'

    const body = document.createElement('p')
    body.className = 'storage-pane-access-denied-message-body storage-container-pane-empty-message-body'
    body.textContent = 'You do not have access to the contents of this container.'

    message.appendChild(body)
    targetView.replaceChildren(message)
  }

  private isAccessDeniedError (error: unknown) {
    const status = typeof error === 'object' && error !== null
      ? (error as { status?: number, response?: { status?: number } }).status ?? (error as { response?: { status?: number } }).response?.status
      : undefined

    return status === 401 || status === 403
  }

  private async showResourceInFullView (selectedResource: NamedNode) {
    try {
      if (!this.fullView) {
        return
      }

      const outliner = this.browserContext?.getOutliner(this.browserContext?.dom) as StoragePaneOutliner | undefined

      try {
        await this.store.fetcher.load(selectedResource)
      } catch (_error) {
        if (this.isAccessDeniedError(_error)) {
          this.renderAccessDeniedScreen(this.fullView)
        }
        return
      }

      const isContainer = solidLogicSingleton.resource.isContainer(selectedResource)

      if (isContainer) {
        if (containerHasIndexDocument(this.store, selectedResource)) {
          const indexThing = getContainerIndexThing(this.store, selectedResource)
          this.fullView.replaceChildren()
          outliner?.GotoSubject(indexThing, true, undefined, false, undefined, this.fullView)
          return
        }

        this.renderContainerPaneInFullView(selectedResource)
        return
      }

      this.fullView.replaceChildren()
      outliner?.GotoSubject(selectedResource, true, undefined, false, undefined, this.fullView)
    } catch (error) {
      log.error('Unable to render selected resource in full view: ' + error)
    }
  }

  private async showSelectedPaneInContentView (selectedResource: NamedNode, selectedPaneName: string) {
    try {
      if (!this.contentView || !this.browserContext) {
        return
      }

      const relevantPanes = await getRelevantPanes(selectedResource, this.browserContext)
      const requestedPane = byName(selectedPaneName)
      const selectedPane = requestedPane ?? getRelevantPane(relevantPanes, selectedResource)

      if (!selectedPane) {
        await this.showResourceInFullView(selectedResource)
        return
      }

      const paneElement = selectedPane.render(selectedResource, this.browserContext)
      const provider = document.createElement('file-explorer-provider') as HTMLElement & {
        context?: DataBrowserContext | null
        subjectUri?: string
        relevantPanes?: PaneDefinition[]
        pane?: PaneDefinition
        paneRenderOptions?: Record<string, unknown>
        showHeader?: boolean
        openPane?: (subject: NamedNode, paneName: string) => void
        onBack?: () => void
        handleAccessClick?: () => void
      }

      provider.context = this.browserContext
      provider.subjectUri = selectedResource.uri
      provider.relevantPanes = relevantPanes
      provider.pane = selectedPane
      provider.paneRenderOptions = {}
      provider.onBack = () => {
        const parentSubjectUri = this.fileExplorerContext?.subjectUri
        if (parentSubjectUri) {
          this.storageContext.selectResource(this.store.sym(parentSubjectUri))
        }
      }
      provider.handleAccessClick = () => {
        this.storageContext.selectResource(selectedResource, 'sharing')
      }
      provider.openPane = (paneSubject: NamedNode, paneName: string) => {
        this.storageContext.selectResource(paneSubject, paneName)
      }

      paneElement.classList.add('paneDiv')
      this.contentView.replaceChildren(provider)
      provider.appendChild(paneElement)
    } catch (error) {
      log.error('Unable to render selected pane: ' + error)
    }
  }

  private async showSelectedPaneInFullView (selectedResource: NamedNode, selectedPaneName: string) {
    try {
      if (!this.fullView || !this.browserContext) {
        return
      }

      const relevantPanes = await getRelevantPanes(selectedResource, this.browserContext)
      const requestedPane = byName(selectedPaneName)
      const selectedPane = requestedPane ?? getRelevantPane(relevantPanes, selectedResource)

      if (!selectedPane) {
        await this.showResourceInFullView(selectedResource)
        return
      }

      const paneElement = selectedPane.render(selectedResource, this.browserContext)
      const provider = document.createElement('file-explorer-provider') as HTMLElement & {
        context?: DataBrowserContext | null
        subjectUri?: string
        relevantPanes?: PaneDefinition[]
        pane?: PaneDefinition
        paneRenderOptions?: Record<string, unknown>
        showHeader?: boolean
        openPane?: (subject: NamedNode, paneName: string) => void
        onBack?: () => void
        handleAccessClick?: () => void
      }

      provider.context = this.browserContext
      provider.subjectUri = selectedResource.uri
      provider.relevantPanes = relevantPanes
      provider.pane = selectedPane
      provider.paneRenderOptions = {}
      provider.showHeader = true
      provider.onBack = () => {
        const parentSubjectUri = this.fileExplorerContext?.subjectUri
        if (parentSubjectUri) {
          this.storageContext.selectResource(this.store.sym(parentSubjectUri))
        }
      }
      provider.handleAccessClick = () => {
        this.storageContext.selectResource(selectedResource, 'sharing')
      }
      provider.openPane = (paneSubject: NamedNode, paneName: string) => {
        this.storageContext.selectResource(paneSubject, paneName)
      }

      paneElement.classList.add('paneDiv')
      this.fullView.replaceChildren(provider)
      provider.appendChild(paneElement)
    } catch (error) {
      log.error('Unable to render selected pane in full view: ' + error)
    }
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
          renderAccessDeniedView: () => this.renderAccessDeniedScreen(this.contentView as HTMLElement),
        })
      }
    } catch (error) {
      log.error('Unable to render selected resource: ' + error)
    }
  }

  private getStatusArea = () => this.statusArea

  render () {
    const fullScreenMode = (this.storageContext.selectedPaneName === 'resource' || this.storageContext.selectedPaneName === 'internal') && this.browserContext

    if (fullScreenMode) {
      return html`
        <div class="storage-pane-full-view"></div>
      `
    }

    return html`
      <storage-header
        .getStatusArea=${this.getStatusArea}
        .browserContext=${this.browserContext}
      ></storage-header>
      <div class="storage-pane-main-content">
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
    `
  }
}
