import { html, nothing } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import { consume } from '@lit/context'
import '../storage-header'
import '../storage-content-view'
import '../storage-creation-area'
import '../storage-provider/StorageProvider'
import type { LiveStore, NamedNode } from 'rdflib'
import type { FileExplorerContext } from 'solid-ui'
import type { StorageContext } from '../storage-provider/context'
import { storageContext, DEFAULT_STORAGE_CONTEXT } from '../storage-provider/context'
import { solidLogicSingleton } from 'solid-logic'
import { customElement, DEFAULT_STORE, fileExplorerContext, log, storeContext, utils, WebComponent } from 'solid-ui'
import { Resource, type ResourceMap, StoragePaneOutliner } from '../../types'
import { getResourcesForContainer, getResourcesFromSearchQuery, loadResourcesForContainer, renderSelectedResourceInContentView } from '../../helpers'
import styles from './StorageContainerPane.styles.css'
import '~icons/lucide/folder'
import '~icons/lucide/file'
import '~icons/lucide/globe'
import '~icons/lucide/lock-keyhole'

/* think i'm going to need to move the web component for the 3 dots to solid-ui 
because i need it here too */
import '~icons/lucide/ellipsis-vertical'

@customElement('storage-container-pane')
export default class StorageContainerPane extends WebComponent {
  static styles = styles

  @property({ attribute: false })
  accessor subject: NamedNode | undefined = undefined

  @property({ attribute: false })
  accessor outliner: StoragePaneOutliner | undefined = undefined

  @consume({ context: storeContext, subscribe: true })
  accessor store: LiveStore = DEFAULT_STORE

  @consume({ context: fileExplorerContext, subscribe: true })
  accessor fileExplorerContext: FileExplorerContext = undefined as unknown as FileExplorerContext

  @consume({ context: storageContext, subscribe: true })
  accessor storageContext: StorageContext = DEFAULT_STORAGE_CONTEXT

  @state()
  accessor resources: ResourceMap = new Map()

  @state()
  accessor resourceVisibility: Map<string, boolean> = new Map()

  private resourceVisibilityLoading = new Set<string>()
  private resourceSyncGeneration = 0

  @state()
  accessor isLoadingResources = false

  @query('storage-content-view')
  private accessor contentView: HTMLElement | null = null

  protected createRenderRoot () {
    return this
  }

  protected firstUpdated () {
    void this.syncResources()
  }

  private get currentSubject (): NamedNode | undefined {
    const subjectUri = this.subject?.uri ?? this.fileExplorerContext?.subjectUri

    return subjectUri ? this.store.sym(subjectUri) : undefined
  }

  private get selectedResource (): NamedNode | undefined {
    return this.storageContext.selectedResource ?? this.currentSubject
  }

  private ensureResourceVisibility (resource: Resource) {
    if (this.resourceVisibility.has(resource.id) || this.resourceVisibilityLoading.has(resource.id)) {
      return
    }

    this.resourceVisibilityLoading.add(resource.id)

    void solidLogicSingleton.resource.fetchMetadata(resource.subject)
      .then((metadata) => {
        this.resourceVisibility = new Map(this.resourceVisibility).set(resource.id, metadata.access.isPublic)
      })
      .catch(() => {
        // Unknown visibility stays unknown; render nothing.
      })
      .finally(() => {
        this.resourceVisibilityLoading.delete(resource.id)
      })
  }

  private syncResources = async () => {
    const subject = this.currentSubject

    if (!this.store || !subject) {
      return
    }

    const syncGeneration = ++this.resourceSyncGeneration
    this.isLoadingResources = true
    this.resources = new Map()

    try {
      const loadedResources = await loadResourcesForContainer(this.store, subject)

      if (syncGeneration !== this.resourceSyncGeneration) {
        return
      }

      this.resources = loadedResources
    } catch (_error) {
      if (syncGeneration !== this.resourceSyncGeneration) {
        return
      }

      this.resources = getResourcesForContainer(this.store, subject)
    }

    if (syncGeneration !== this.resourceSyncGeneration) {
      return
    }

    this.isLoadingResources = false

    for (const resource of this.resources.values()) {
      this.ensureResourceVisibility(resource)
    }
  }

  private get searchQuery () {
    return this.storageContext.searchQuery.trim()
  }

  private get visibleResources () {
    if (this.searchQuery) {
      return Array.from(getResourcesFromSearchQuery(this.store, this.searchQuery).values())
    }

    return Array.from(this.resources.values())
  }

  private selectResource (resource: Resource) {
    this.storageContext.selectResource(resource.subject)
  }

  private renderContainerPane (selectedResource: NamedNode) {
    if (!this.contentView) return

    const provider = document.createElement('storage-provider') as HTMLElement & {
      subject?: NamedNode
    }

    provider.subject = selectedResource

    const containerPane = document.createElement('storage-container-pane') as HTMLElement & {
      outliner?: StoragePaneOutliner
    }

    containerPane.outliner = this.outliner

    provider.appendChild(containerPane)
    this.contentView.replaceChildren(provider)
  }

  private async showResourceInContentView (selectedResource: NamedNode) {
    try {
      if (this.contentView) {
        await renderSelectedResourceInContentView({
          store: this.store,
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

  private renderResourceGridItem (resource: Resource, depth: number) {
    const selected = this.isSelectedResource(resource)
    const { isContainer, getContainerMemberCount } = solidLogicSingleton.resource
    this.ensureResourceVisibility(resource)
    const isPublic = this.resourceVisibility.get(resource.id)

    return html`
      <li
        class=${selected ? 'resource-grid-item selected' : 'resource-grid-item'}
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
        <span class="resource-grid-icon">
          ${isContainer(resource.subject) ? html`<icon-lucide-folder></icon-lucide-folder>` : html`<icon-lucide-file></icon-lucide-file>`}</span>
        </span>
        <span class="resource-grid-label">${utils.label(resource.subject)}</span>
        <div class="resource-grid-item-footer">
          ${isContainer(resource.subject) ? html`<span class="container-member-count">${getContainerMemberCount(resource.subject)} items</span>` : nothing}
          ${isPublic === undefined ? nothing : isPublic ? html`<icon-lucide-globe></icon-lucide-globe>` : html`<icon-lucide-lock-keyhole></icon-lucide-lock-keyhole>`}
        </div>
      </li>
    `
  }

  private renderResourceListItem (resource: Resource, depth: number) {
    const selected = this.isSelectedResource(resource)
    const { isContainer, getContainerMemberCount } = solidLogicSingleton.resource
    this.ensureResourceVisibility(resource)
    const isPublic = this.resourceVisibility.get(resource.id)

    return html`
      <li
        class=${selected ? 'resource-list-item selected' : 'resource-list-item'}
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
        ${isContainer(resource.subject) ? html`<icon-lucide-folder></icon-lucide-folder>` : html`<icon-lucide-file></icon-lucide-file>`}
        <span class="resource-list-label">${utils.label(resource.subject)}</span>
        ${isContainer(resource.subject) ? html`<span class="container-member-count">${getContainerMemberCount(resource.subject)} items</span>` : nothing}
        ${isPublic === undefined ? nothing : isPublic ? html`<icon-lucide-globe></icon-lucide-globe>` : html`<icon-lucide-lock-keyhole></icon-lucide-lock-keyhole>`}
      </li>
    `
  }

  protected willUpdate (changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties)

    if (
      changedProperties.has('store') ||
      changedProperties.has('subject') ||
      changedProperties.has('fileExplorerContext')
    ) {
      void this.syncResources()
    }
  }

  protected updated (changedProperties: PropertyValues<this>) {
    if (!changedProperties.has('storageContext')) {
      return
    }

    const previousStorageContext = changedProperties.get('storageContext') as StorageContext | undefined
    const previousSelectedResourceUri = previousStorageContext?.selectedResource?.uri
    const currentSelectedResourceUri = this.selectedResource?.uri
    const currentSubjectUri = this.currentSubject?.uri

    if (previousSelectedResourceUri !== currentSelectedResourceUri) {
      if (!currentSelectedResourceUri || currentSelectedResourceUri === currentSubjectUri) {
        this.contentView?.replaceChildren()
        return
      }

      if (this.selectedResource) {
        void this.showResourceInContentView(this.selectedResource)
      }
    }
  }

  private renderListView () {
    return html`
      <ul class="resource-list" role="listbox">
        ${this.visibleResources.map((resource) => this.renderResourceListItem(resource, 0))}
      </ul>
    `
  }

  private renderGridView () {
    return html`
      <ul class="resource-grid" role="listbox">
        ${this.visibleResources.map((resource) => this.renderResourceGridItem(resource, 0))}
      </ul>
    `
  }

  private renderResourceListArea (searchQuery: string, visibleResources: Resource[]) {
    if (this.isLoadingResources && !searchQuery) {
      return html`<div class="storage-container-pane-empty-message">Loading resources...</div>`
    }

    if (visibleResources.length > 0) {
      return this.storageContext.view === 'grid' ? this.renderGridView() : this.renderListView()
    }

    return html`<div class="storage-container-pane-empty-message">
      ${searchQuery ? 'No resources match this search.' : 'No resources found in this container.'}
    </div>`
  }

  render () {
    const visibleResources = this.visibleResources
    const searchQuery = this.searchQuery

    return html`
      ${this.renderResourceListArea(searchQuery, visibleResources)}
      <storage-content-view></storage-content-view>
      <storage-creation-area
        .subject=${this.currentSubject}
        .message=${'Drop files or folder here'}
        @resource-created=${this.syncResources}
      ></storage-creation-area>
    `
  }
}
