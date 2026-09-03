import type { PropertyValues } from 'lit'
import { html } from 'lit'
import { provide, consume } from '@lit/context'
import { customElement, property, state } from 'lit/decorators.js'
import { NamedNode } from 'rdflib'
import { WebComponent } from 'solid-ui'
import type { DataBrowserContext } from 'pane-registry'
import { fileExplorerContext, type FileExplorerContext, storeContext, DEFAULT_STORE } from 'solid-ui'
import type { LiveStore } from 'rdflib'
import { DEFAULT_STORAGE_CONTEXT, storageContext, type StorageContext } from './context'

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
  accessor view: 'grid' | 'list' = 'grid'

  @state()
  accessor searchQuery: string = ''

  @provide({ context: storageContext })
  accessor storageContext: StorageContext = DEFAULT_STORAGE_CONTEXT

  @provide({ context: fileExplorerContext })
  accessor fileExplorerContext: FileExplorerContext = { subjectUri: this.currentSubject?.uri }

  private get currentSubject (): NamedNode | undefined {
    if (this.subject) {
      return this.subject
    }

    const subjectUri = this.parentFileExplorerContext?.subjectUri
    return subjectUri ? this.store.sym(subjectUri) : undefined
  }

  private selectResource = (resource: NamedNode) => {
    this.selectedResource = resource
    this.searchQuery = ''
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

  private refreshStorageContextValue () {
    this.storageContext = {
      selectedResource: this.selectedResource ?? this.currentSubject,
      selectResource: this.selectResource,
      view: this.view,
      setView: this.setView,
      searchQuery: this.searchQuery,
      setSearchQuery: this.setSearchQuery,

    }
  }

  private refreshFileExplorerContextValue () {
    this.fileExplorerContext = { subjectUri: this.currentSubject?.uri }
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
    const storageContextShouldRefresh = subjectChanged || parentFileExplorerContextChanged || selectedResourceChanged
    const fileExplorerContextShouldRefresh = subjectChanged || parentFileExplorerContextChanged

    if (subjectChanged) {
      this.selectedResource = this.currentSubject
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
