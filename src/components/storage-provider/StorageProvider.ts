import type { PropertyValues } from 'lit'
import { html } from 'lit'
import { provide, consume } from '@lit/context'
import { customElement, property, state } from 'lit/decorators.js'
import { NamedNode } from 'rdflib'
import { WebComponent } from 'solid-ui'
import type { DataBrowserContext } from 'pane-registry'
import { fileExplorerContext, type FileExplorerContext, storeContext, DEFAULT_STORE } from 'solid-ui'
import { solidLogicSingleton } from 'solid-logic'
import type { LiveStore } from 'rdflib'
import { DEFAULT_STORAGE_CONTEXT, storageContext, type StorageContext } from './context'
import { DEFAULT_DISCOVER_CLASS } from 'solid-ui'

@customElement('storage-provider')
export default class StorageProvider extends WebComponent {
  @property({ attribute: false })
  accessor browserContext: DataBrowserContext | null = null

  @property({ attribute: false })
  accessor subject: NamedNode | undefined = undefined

  @consume({ context: storeContext, subscribe: true })
  accessor store: LiveStore = DEFAULT_STORE

  @consume({ context: fileExplorerContext, subscribe: true })
  accessor parentFileExplorerContext: FileExplorerContext = undefined as unknown as FileExplorerContext

  @state()
  accessor selectedResource: NamedNode | undefined = undefined

  @state()
  accessor selectedPaneName: string | undefined = undefined

  @state()
  accessor view: 'grid' | 'list' = 'grid'

  @state()
  accessor searchQuery: string = ''

  @state()
  accessor history: NamedNode[] = []

  @state()
  accessor resourceRevision = 0

  @provide({ context: storageContext })
  accessor storageContext: StorageContext = {
    ...DEFAULT_STORAGE_CONTEXT
  }

  @provide({ context: fileExplorerContext })
  accessor fileExplorerContext: FileExplorerContext = { subjectUri: this.currentSubject?.uri }

  private get currentSubject (): NamedNode | undefined {
    if (this.subject) {
      return this.subject
    }

    const subjectUri = this.parentFileExplorerContext?.subjectUri
    return subjectUri ? this.store.sym(subjectUri) : undefined
  }

  private selectResource = (resource: NamedNode, paneName?: string) => {
    const currentResource = this.selectedResource ?? this.currentSubject
    const selectedPaneName = paneName ?? (this.selectedPaneName === 'resource' || this.selectedPaneName === 'internal'
      ? this.selectedPaneName
      : undefined)

    if (currentResource && !currentResource.sameTerm(resource)) {
      this.history = [...this.history, currentResource]
    }

    this.selectedResource = resource
    this.selectedPaneName = selectedPaneName
    this.searchQuery = ''
    this.refreshStorageContextValue()
  }

  private deleteResource = async (resource: NamedNode) => {
    const isInTrash = resource.dir()?.uri.endsWith('/Trash/') ?? false

    if (isInTrash) {
      await solidLogicSingleton.resource.deleteResourceAndTypeIndexIfExists(resource)
    } else {
      await solidLogicSingleton.resource.moveToTrash(resource)
    }

    const selectedResource = this.selectedResource
    const deletedResourceUri = resource.uri.endsWith('/') ? resource.uri : `${resource.uri}/`
    const selectedResourceWasDeleted = selectedResource?.sameTerm(resource) ||
      selectedResource?.uri.startsWith(deletedResourceUri)

    this.history = this.history.filter((historyResource) =>
      !historyResource.sameTerm(resource) && !historyResource.uri.startsWith(deletedResourceUri)
    )

    if (selectedResourceWasDeleted) {
      this.selectedResource = resource.dir() ?? this.currentSubject
      this.selectedPaneName = undefined
    }

    this.resourceRevision += 1
    this.refreshStorageContextValue()
  }

  private setView = (view: 'grid' | 'list') => {
    this.view = view
    this.refreshStorageContextValue()
  }

  private setSearchQuery = (query: string) => {
    this.searchQuery = query
    this.refreshStorageContextValue()
  }

  goBack = () => {
    if (this.history.length > 0) {
      const previousHistory = [...this.history]
      const previousResource = previousHistory.pop()

      this.history = previousHistory
      this.selectedResource = previousResource
      this.selectedPaneName = undefined
      this.refreshStorageContextValue()
    }
  }

  private refreshStorageContextValue () {
    this.storageContext = {
      selectedResource: this.selectedResource ?? this.currentSubject,
      selectedPaneName: this.selectedPaneName,
      selectResource: this.selectResource,
      deleteResource: this.deleteResource,
      resourceRevision: this.resourceRevision,
      view: this.view,
      setView: this.setView,
      searchQuery: this.searchQuery,
      setSearchQuery: this.setSearchQuery,
      history: this.history
    }
  }

  private refreshFileExplorerContextValue () {
    const currentSubjectDiscoverClass = this.currentSubject ? solidLogicSingleton.resource.getContainerMintClass(this.currentSubject) : undefined

    this.fileExplorerContext = {
      subjectUri: this.currentSubject?.uri,
      onBack: this.goBack,
      deleteResource: this.deleteResource,
      resourceRevision: this.resourceRevision,
      discoverClass: currentSubjectDiscoverClass ?? this.parentFileExplorerContext?.discoverClass ?? DEFAULT_DISCOVER_CLASS
    }
  }

  // Legacy panes rendered below this provider are styled by global stylesheets,
  // which cannot cross a shadow boundary.
  protected createRenderRoot () {
    return this
  }

  protected willUpdate (changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties)

    const subjectChanged = changedProperties.has('subject')
    const parentFileExplorerContextChanged = changedProperties.has('parentFileExplorerContext')
    const selectedResourceChanged = changedProperties.has('selectedResource')
    const selectedPaneNameChanged = changedProperties.has('selectedPaneName')
    const storageContextShouldRefresh = subjectChanged || parentFileExplorerContextChanged || selectedResourceChanged || selectedPaneNameChanged
    const fileExplorerContextShouldRefresh = subjectChanged || parentFileExplorerContextChanged || changedProperties.has('resourceRevision')

    if (subjectChanged) {
      if (this.selectedPaneName !== undefined) {
        this.selectedPaneName = undefined
      }
    }

    if (storageContextShouldRefresh) {
      this.refreshStorageContextValue()
    }

    if (fileExplorerContextShouldRefresh) {
      this.refreshFileExplorerContextValue()
    }
  }

  render () {
    return html`
      <storage-pane-view
        .browserContext=${this.browserContext}
      ></storage-pane-view>
    `
  }
}
