import { html, nothing } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import { consume } from '@lit/context'
import '../storage-header'
import '../storage-creation-area'
import type { LiveStore, NamedNode } from 'rdflib'
import type { DataBrowserContext } from 'pane-registry'
import { byName } from 'pane-registry'
import type { FileExplorerContext } from 'solid-ui'
import type { StorageContext } from '../storage-provider/context'
import { storageContext, DEFAULT_STORAGE_CONTEXT } from '../storage-provider/context'
import { solidLogicSingleton } from 'solid-logic'
import { customElement, DEFAULT_STORE, fileExplorerContext, storeContext, utils, WebComponent, authContext, DEFAULT_AUTH_CONTEXT, type AuthContext } from 'solid-ui'
import type { PaneDefinition } from 'pane-registry'
import { Resource, type ResourceMap, StoragePaneOutliner } from '../../types'
import { getDraggedResourceUri, getResourcesForContainer, getResourcesFromSearchQuery, handleContainerDragOver, handleContainerDrop, loadResourcesForContainer, setDraggedResource } from '../../helpers'
import { getRelevantPanes, getRelevantPane } from 'solid-ui'
import { buildResourceActionsMenuBindings, loadDiscoveryState, toggleDiscoveryState } from 'solid-ui/components/resource-actions-menu'
import type { ResourceActionMenuItem as ResourcePaneMenuItem } from 'solid-ui/components/resource-actions-menu'
import { DEFAULT_DISCOVER_CLASS } from 'solid-ui'
import { createNewResource } from '../storage-creation-menu/mintPaneInstance'
import StorageCreationArea from '../storage-creation-area/StorageCreationArea'
import styles from './StorageContainerPane.styles.css'
import 'solid-ui/components/file-explorer-header'
import 'solid-ui/components/resource-actions-menu'
import '~icons/lucide/folder'
import '~icons/lucide/file'
import '~icons/lucide/globe'
import '~icons/lucide/lock-keyhole'
import '~icons/lucide/file-box'

@customElement('storage-container-pane')
export default class StorageContainerPane extends WebComponent {
  static styles = styles

  @property({ attribute: false })
  accessor subject: NamedNode | undefined = undefined

  @property({ attribute: false })
  accessor outliner: StoragePaneOutliner | undefined = undefined

  @property({ attribute: false })
  accessor browserContext: DataBrowserContext | null = null

  @consume({ context: storeContext, subscribe: true })
  accessor store: LiveStore = DEFAULT_STORE

  @consume({ context: fileExplorerContext, subscribe: true })
  accessor fileExplorerContext: FileExplorerContext = undefined as unknown as FileExplorerContext

  @consume({ context: storageContext, subscribe: true })
  accessor storageContext: StorageContext = DEFAULT_STORAGE_CONTEXT

  @consume({ context: authContext, subscribe: true })
  accessor auth: AuthContext = DEFAULT_AUTH_CONTEXT

  @state()
  accessor resources: ResourceMap = new Map()

  @state()
  accessor resourceAccess: Map<string, { isPublic: boolean, canDelete: boolean }> = new Map()

  @state()
  accessor resourcePaneIcons: Map<string, string> = new Map()

  @state()
  accessor resourcePaneItems: Map<string, ResourcePaneMenuItem[]> = new Map()

  @state()
  accessor resourceRelevantPanes: Map<string, PaneDefinition[]> = new Map()

  @state()
  accessor resourceDiscovery: Map<string, { discoverClassUri?: string, public: boolean, private: boolean }> = new Map()

  private resourceAccessLoading = new Set<string>()
  private resourcePaneLoading = new Set<string>()
  private resourceDiscoveryLoading = new Set<string>()
  private resourceSyncGeneration = 0

  @state()
  accessor isLoadingResources = false

  @state()
  accessor dropTargetResourceUri: string | undefined = undefined

  @query('storage-creation-area')
  private accessor storageCreationArea: StorageCreationArea | null = null

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

  private ensureResourceAccess (resource: Resource) {
    if (this.resourceAccess.has(resource.id) || this.resourceAccessLoading.has(resource.id)) {
      return
    }

    this.resourceAccessLoading.add(resource.id)

    void solidLogicSingleton.resource.fetchMetadata(resource.subject)
      .then((metadata) => {
        this.resourceAccess = new Map(this.resourceAccess).set(resource.id, {
          isPublic: metadata.access.isPublic,
          canDelete: metadata.access.canDelete,
        })
      })
      .catch(() => {
        // Unknown access stays unknown; hide access-dependent actions and indicators.
      })
      .finally(() => {
        this.resourceAccessLoading.delete(resource.id)
      })
  }

  private syncResources = async (forceReload = false) => {
    const subject = this.currentSubject

    if (!this.store || !subject) {
      return
    }

    const syncGeneration = ++this.resourceSyncGeneration
    this.isLoadingResources = true
    this.resources = new Map()

    try {
      if (forceReload) {
        await this.store.fetcher.load(subject, { force: true, clearPreviousData: true })
      }

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
      this.ensureResourceAccess(resource)
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

  private get folderPane () {
    return this.browserContext?.session.paneRegistry.byName('folder') ?? undefined
  }

  private get canCreateFolder () {
    return !!this.auth.account && !!this.browserContext && !!this.currentSubject && !!this.folderPane
  }

  private handleCreateNewFolder = async () => {
    event?.stopPropagation()

    if (!this.browserContext || !this.currentSubject || !this.folderPane || !this.auth.account) {
      return
    }

    await createNewResource({
      browserContext: this.browserContext,
      container: this.currentSubject,
      pane: this.folderPane,
      statusArea: this,
      storageContext: this.storageContext,
    })
  }

  private onEmptyStateClick = () => {
    if (!this.auth.account) {
      return
    }

    this.storageCreationArea?.openChooser()
  }

  private onEmptyStateKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.onEmptyStateClick()
    }
  }

  private onEmptyStateDragOver = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer!.dropEffect = 'copy'
  }

  private onEmptyStateDrop = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()

    const subject = this.currentSubject

    if (!this.store || !subject || !this.auth.account) {
      return
    }

    const draggedResourceUri = getDraggedResourceUri(event.dataTransfer)
    if (draggedResourceUri) {
      void (async () => {
        await this.storageContext.moveResource(this.store.sym(draggedResourceUri), subject)
        this.dropTargetResourceUri = undefined
        await this.syncResources(true)
      })()
      return
    }

    if (handleContainerDrop(event, this.store, subject, () => { void this.syncResources() })) {
      return
    }
  }

  private getPaneIconSource (pane: PaneDefinition, subject: NamedNode) {
    if (!this.browserContext) {
      return undefined
    }

    const paneIcon = pane.icon as unknown

    return typeof paneIcon === 'function'
      ? (paneIcon as (subject: NamedNode, context: DataBrowserContext) => string)(subject, this.browserContext)
      : paneIcon as string | undefined
  }

  private async ensureResourcePaneItems (resource: Resource) {
    if (!this.browserContext || this.resourcePaneLoading.has(resource.id) || this.resourcePaneItems.has(resource.id)) {
      return
    }

    this.resourcePaneLoading.add(resource.id)

    try {
      const relevantPanes = await getRelevantPanes(resource.subject, this.browserContext)

      if (relevantPanes.length === 0) {
        this.resourcePaneItems = new Map(this.resourcePaneItems).set(resource.id, [])
        this.resourceRelevantPanes = new Map(this.resourceRelevantPanes).set(resource.id, [])
        return
      }

      const selectedPane = getRelevantPane(relevantPanes, resource.subject) ?? relevantPanes[0]
      const selectedPaneIcon = selectedPane ? this.getPaneIconSource(selectedPane, resource.subject) : undefined

      const menuItems = relevantPanes
        .map((pane): ResourcePaneMenuItem | null => {
          const label = pane.label(resource.subject, this.browserContext as unknown as DataBrowserContext)

          if (!label) {
            return null
          }

          const iconSource = this.getPaneIconSource(pane, resource.subject)
          const icon = iconSource ? utils.AJARImage(iconSource, label, label, this.browserContext?.dom ?? document) : undefined

          if (icon) {
            icon.setAttribute('slot', 'left-icon')
          }

          return {
            kind: 'custom',
            label,
            icon,
            action: (event: Event) => {
              event.stopPropagation()
              if (selectedPane && pane.name === selectedPane.name) {
                this.storageContext.selectResource(resource.subject)
                return
              }

              this.openResourcePane(resource, pane)
            },
          }
        })
        .filter((item): item is ResourcePaneMenuItem => item !== null)

      if (selectedPaneIcon) {
        this.resourcePaneIcons = new Map(this.resourcePaneIcons).set(resource.id, selectedPaneIcon)
      }

      this.resourceRelevantPanes = new Map(this.resourceRelevantPanes).set(resource.id, relevantPanes)
      this.resourcePaneItems = new Map(this.resourcePaneItems).set(resource.id, menuItems)

      const discoverClass = this.resolveResourceDiscoverClass(resource, selectedPane, relevantPanes)
      await this.ensureResourceDiscovery(resource, discoverClass)
    } finally {
      this.resourcePaneLoading.delete(resource.id)
    }
  }

  private resolveResourceDiscoverClass (resource: Resource, selectedPane: PaneDefinition | null, relevantPanes: PaneDefinition[]) {
    return (
      (resource.isContainer ? solidLogicSingleton.resource.getContainerMintClass(resource.subject) : undefined) ??
      this.fileExplorerContext.discoverClass ??
      selectedPane?.mintClass ??
      relevantPanes.find((pane) => pane.mintClass)?.mintClass ??
      DEFAULT_DISCOVER_CLASS
    )
  }

  private async ensureResourceDiscovery (resource: Resource, discoverClass?: NamedNode) {
    if (!this.browserContext || this.resourceDiscoveryLoading.has(resource.id)) {
      return
    }

    const currentDiscovery = this.resourceDiscovery.get(resource.id)
    if (currentDiscovery?.discoverClassUri === discoverClass?.uri) {
      return
    }

    this.resourceDiscoveryLoading.add(resource.id)

    try {
      const discoveryState = await loadDiscoveryState(resource.subject)

      this.resourceDiscovery = new Map(this.resourceDiscovery).set(resource.id, {
        discoverClassUri: discoverClass?.uri,
        public: discoveryState.public,
        private: discoveryState.private,
      })
    } finally {
      this.resourceDiscoveryLoading.delete(resource.id)
    }
  }

  private async toggleResourceDiscovery (resource: Resource, visibility: 'public' | 'private') {
    const discovery = this.resourceDiscovery.get(resource.id)
    const resolvedDiscoverClassUri = discovery?.discoverClassUri ?? this.resolveResourceDiscoverClass(resource, null, this.resourceRelevantPanes.get(resource.id) ?? [])?.uri
    if (!resolvedDiscoverClassUri) {
      return
    }

    const discoverClass = this.store.sym(resolvedDiscoverClassUri)

    try {
      const updatedDiscovery = await toggleDiscoveryState(resource.subject, discoverClass, visibility, discovery)

      this.resourceDiscovery = new Map(this.resourceDiscovery).set(resource.id, {
        discoverClassUri: discoverClass.uri,
        public: updatedDiscovery.public,
        private: updatedDiscovery.private,
      })
    } catch (error) {
      console.error('[storage-container-pane.toggleResourceDiscovery] failed', error)
      globalThis.alert(`Error updating ${visibility} discovery`)
    }
  }

  private openResourcePane (resource: Resource, pane: PaneDefinition) {
    this.storageContext.selectResource(resource.subject, pane.name)
  }

  private async deleteResource (resource: Resource) {
    try {
      await this.storageContext.deleteResource(resource.subject)

      const resources = new Map(this.resources)
      resources.delete(resource.id)
      this.resources = resources

      const resourceAccess = new Map(this.resourceAccess)
      resourceAccess.delete(resource.id)
      this.resourceAccess = resourceAccess

      const resourcePaneIcons = new Map(this.resourcePaneIcons)
      resourcePaneIcons.delete(resource.id)
      this.resourcePaneIcons = resourcePaneIcons

      const resourcePaneItems = new Map(this.resourcePaneItems)
      resourcePaneItems.delete(resource.id)
      this.resourcePaneItems = resourcePaneItems

      const resourceRelevantPanes = new Map(this.resourceRelevantPanes)
      resourceRelevantPanes.delete(resource.id)
      this.resourceRelevantPanes = resourceRelevantPanes

      const resourceDiscovery = new Map(this.resourceDiscovery)
      resourceDiscovery.delete(resource.id)
      this.resourceDiscovery = resourceDiscovery
    } catch (error) {
      // need error handling here
    }
  }

  private renderResourceActionsMenu (resource: Resource, placement: 'grid' | 'list') {
    const sharingPane = byName('sharing')
    const canDelete = this.resourceAccess.get(resource.id)?.canDelete ?? false
    const menuItems = [
      ...(this.resourcePaneItems.get(resource.id) ?? [])
    ]

    const discovery = this.resourceDiscovery.get(resource.id)
    const resourceActions = buildResourceActionsMenuBindings({
      subject: resource.subject,
      discoveryState: discovery,
      handleAccessClick: sharingPane
        ? () => {
            this.storageContext.selectResource(resource.subject, sharingPane.name)
          }
        : undefined,
      canDelete,
      handleDeleteClick: () => { void this.deleteResource(resource) },
      handleDiscoverPublicClick: discovery ? () => { void this.toggleResourceDiscovery(resource, 'public') } : undefined,
      handleDiscoverPrivateClick: discovery ? () => { void this.toggleResourceDiscovery(resource, 'private') } : undefined,
    })

    return html`
      <div class="resource-actions-menu resource-actions-menu--${placement}" @click=${(event: MouseEvent) => event.stopPropagation()}>
        <solid-ui-resource-actions-menu
          .menuItems=${menuItems}
          .handleAccessClick=${resourceActions.handleAccessClick}
          .handleDeleteClick=${resourceActions.handleDeleteClick}
          .deleteLabel=${resourceActions.deleteLabel}
          .discoverPublicly=${resourceActions.discoverPublicly}
          .discoverPrivately=${resourceActions.discoverPrivately}
          .handleDiscoverPublicClick=${resourceActions.handleDiscoverPublicClick}
          .handleDiscoverPrivateClick=${resourceActions.handleDiscoverPrivateClick}
        ></solid-ui-resource-actions-menu>
      </div>
    `
  }

  private onContainerDragOver (resource: Resource, event: DragEvent) {
    if (!resource.isContainer) {
      return
    }

    const draggedResourceUri = getDraggedResourceUri(event.dataTransfer)
    if (draggedResourceUri) {
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer!.dropEffect = 'move'
      this.dropTargetResourceUri = resource.id
      return
    }

    handleContainerDragOver(event, this.store, resource.subject)
  }

  private onContainerDrop (resource: Resource, event: DragEvent) {
    if (!resource.isContainer) {
      return
    }

    const draggedResourceUri = getDraggedResourceUri(event.dataTransfer)

    if (draggedResourceUri) {
      event.preventDefault()
      event.stopPropagation()
      void (async () => {
        await this.storageContext.moveResource(this.store.sym(draggedResourceUri), resource.subject)
        this.dropTargetResourceUri = undefined
        await this.syncResources(true)
      })()
      return
    }

    handleContainerDrop(event, this.store, resource.subject, () => { void this.syncResources() })
  }

  private onCurrentContainerDragOver = (event: DragEvent) => {
    if (!this.currentSubject) {
      return
    }

    const draggedResourceUri = getDraggedResourceUri(event.dataTransfer)
    if (draggedResourceUri) {
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer!.dropEffect = 'move'
      return
    }

    handleContainerDragOver(event, this.store, this.currentSubject)
  }

  private onCurrentContainerDrop = (event: DragEvent) => {
    const subject = this.currentSubject

    if (!subject) {
      return
    }

    const draggedResourceUri = getDraggedResourceUri(event.dataTransfer)
    if (draggedResourceUri) {
      event.preventDefault()
      event.stopPropagation()
      void (async () => {
        await this.storageContext.moveResource(this.store.sym(draggedResourceUri), subject)
        this.dropTargetResourceUri = undefined
        await this.syncResources(true)
      })()
      return
    }

    handleContainerDrop(event, this.store, subject, () => { void this.syncResources() })
  }

  private isSelectedResource (resource: Resource) {
    return this.selectedResource?.sameTerm(resource.subject) ?? false
  }

  private renderResourceIcon (resource: Resource) {
    if (resource.isContainer) {
      return html`<icon-lucide-folder></icon-lucide-folder>`
    }

    const paneIconSource = this.resourcePaneIcons.get(resource.id)
    return paneIconSource && this.browserContext
      ? utils.AJARImage(paneIconSource, utils.label(resource.subject), utils.label(resource.subject), this.browserContext.dom ?? document)
      : html`<icon-lucide-file></icon-lucide-file>`
  }

  private renderResourcePaneIcon (resource: Resource) {
    const paneIconSource = this.resourcePaneIcons.get(resource.id)

    if (!paneIconSource || !this.browserContext) {
      return html`<icon-lucide-file></icon-lucide-file>`
    }

    const paneIcon = utils.AJARImage(
      paneIconSource,
      utils.label(resource.subject),
      utils.label(resource.subject),
      this.browserContext.dom ?? document
    )

    paneIcon.classList.add('resource-pane-icon')
    return paneIcon
  }

  private renderResourceGridItem (resource: Resource, depth: number) {
    const selected = this.isSelectedResource(resource)
    void this.ensureResourcePaneItems(resource)
    this.ensureResourceAccess(resource)
    const isPublic = this.resourceAccess.get(resource.id)?.isPublic
    const { isContainer, getContainerVisibleItemCount } = solidLogicSingleton.resource

    if (isContainer(resource.subject)) {
      return html`
        <li
          class=${selected
            ? 'resource-grid-item selected'
            : this.dropTargetResourceUri === resource.id
              ? 'resource-grid-item drop-target'
              : 'resource-grid-item'}
          draggable="true"
          notSelectable="false"
          aria-selected=${String(selected)}
          about=${resource.subject.toNT()}
          role="option"
          tabindex="0"
          .subject=${resource.subject}
          @click=${() => this.selectResource(resource)}
          @dragstart=${(event: DragEvent) => setDraggedResource(event, resource.subject)}
          @dragover=${(event: DragEvent) => this.onContainerDragOver(resource, event)}
          @dragleave=${() => { this.dropTargetResourceUri = undefined }}
          @drop=${(event: DragEvent) => this.onContainerDrop(resource, event)}
          @keydown=${(event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              this.selectResource(resource)
            }
          }}
        >
          <span class="resource-grid-icon resource-grid-icon--container">
            <icon-lucide-folder></icon-lucide-folder>
          </span>
          <span class="resource-grid-label resource-grid-label--container">${utils.label(resource.subject)}</span>
          <div class="resource-grid-item-footer">
            <span class="container-member-count">${getContainerVisibleItemCount(resource.subject)} items</span>
            ${isPublic === undefined ? nothing : isPublic ? html`<icon-lucide-globe></icon-lucide-globe>` : html`<icon-lucide-lock-keyhole></icon-lucide-lock-keyhole>`}
          </div>
          ${this.renderResourceActionsMenu(resource, 'grid')}
        </li>
      `
    }

    return html`
      <li
        class=${selected ? 'resource-grid-item selected' : 'resource-grid-item'}
        draggable="true"
        notSelectable="false"
        aria-selected=${String(selected)}
        about=${resource.subject.toNT()}
        role="option"
        tabindex="0"
        .subject=${resource.subject}
        @click=${() => this.selectResource(resource)}
        @dragstart=${(event: DragEvent) => setDraggedResource(event, resource.subject)}
        @dragover=${(event: DragEvent) => this.onContainerDragOver(resource, event)}
        @drop=${(event: DragEvent) => this.onContainerDrop(resource, event)}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            this.selectResource(resource)
          }
        }}
      >
        <div class="resource-grid-top">
          <span class="resource-grid-icon">
            ${this.renderResourcePaneIcon(resource)}
          </span>
          ${this.renderResourceActionsMenu(resource, 'grid')}
        </div>
        <div class="resource-grid-item-footer">
          <span class="resource-grid-label">${utils.label(resource.subject)}</span>
          ${isContainer(resource.subject) ? html`<span class="container-member-count">${getContainerVisibleItemCount(resource.subject)} items</span>` : nothing}
          ${isPublic === undefined ? nothing : isPublic ? html`<icon-lucide-globe></icon-lucide-globe>` : html`<icon-lucide-lock-keyhole></icon-lucide-lock-keyhole>`}
        </div>
      </li>
    `
  }

  private renderResourceListItem (resource: Resource, depth: number) {
    const selected = this.isSelectedResource(resource)
    void this.ensureResourcePaneItems(resource)
    this.ensureResourceAccess(resource)
    const isPublic = this.resourceAccess.get(resource.id)?.isPublic
    const { isContainer, getContainerVisibleItemCount } = solidLogicSingleton.resource

    return html`
      <li
        class=${selected
          ? 'resource-list-item selected'
          : this.dropTargetResourceUri === resource.id
            ? 'resource-list-item drop-target'
            : 'resource-list-item'}
        draggable="true"
        notSelectable="false"
        aria-selected=${String(selected)}
        about=${resource.subject.toNT()}
        role="option"
        tabindex="0"
        .subject=${resource.subject}
        @click=${() => this.selectResource(resource)}
        @dragstart=${(event: DragEvent) => setDraggedResource(event, resource.subject)}
        @dragover=${(event: DragEvent) => this.onContainerDragOver(resource, event)}
        @dragleave=${() => { this.dropTargetResourceUri = undefined }}
        @drop=${(event: DragEvent) => this.onContainerDrop(resource, event)}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            this.selectResource(resource)
          }
        }}
      >
        <span class="resource-list-main">
          <span class=${isContainer(resource.subject) ? 'resource-list-icon resource-list-icon--container' : 'resource-list-icon'}>
            ${this.renderResourceIcon(resource)}
          </span>
          <span class="resource-list-label">${utils.label(resource.subject)}</span>
          ${isContainer(resource.subject) ? html`<span class="container-member-count">${getContainerVisibleItemCount(resource.subject)} items</span>` : nothing}
          ${isPublic === undefined ? nothing : isPublic ? html`<icon-lucide-globe></icon-lucide-globe>` : html`<icon-lucide-lock-keyhole></icon-lucide-lock-keyhole>`}
        </span>
        ${this.renderResourceActionsMenu(resource, 'list')}
      </li>
    `
  }

  protected willUpdate (changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties)

    const previousStorageContext = changedProperties.get('storageContext') as StorageContext | undefined
    const resourceRevisionChanged = changedProperties.has('storageContext') &&
      previousStorageContext?.resourceRevision !== this.storageContext.resourceRevision

    if (
      changedProperties.has('store') ||
      changedProperties.has('subject') ||
      changedProperties.has('fileExplorerContext') ||
      resourceRevisionChanged
    ) {
      void this.syncResources(resourceRevisionChanged)
    }
  }

  private renderListView () {
    return html`
      <ul class="resource-list" role="listbox">
        <li class="resource-list-header" role="presentation" aria-hidden="true">
          <span>Name</span>
          <span>Action</span>
        </li>
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

  private renderEmptyContainer(){
    return html`
      <div
        class="storage-container-pane-empty-message"
        title="Drop files or folder here or click to choose"
        aria-label="Drop files or folder here or click to choose"
        role="button"
        tabindex="0"
        @click=${this.onEmptyStateClick}
        @keydown=${this.onEmptyStateKeyDown}
        @dragover=${this.onEmptyStateDragOver}
        @drop=${this.onEmptyStateDrop}
      >
        <div class="storage-container-pane-empty-message-icon">
          <icon-lucide-file-box></icon-lucide-file-box>
        </div>
        <h2 class="storage-container-pane-empty-message-title">This folder is empty</h2>
        <p class="storage-container-pane-empty-message-body">Create a folder or drop files or folder here or click to choose.</p>
        <solid-ui-button
          class="storage-container-pane-empty-message-button"
          variant="primary"
          ?disabled=${!this.canCreateFolder}
          @click=${this.handleCreateNewFolder}
        >
          Create New Folder
        </solid-ui-button>
      </div>`
  }
  
  private renderResourceListArea (searchQuery: string, visibleResources: Resource[]) {
    if (this.isLoadingResources && !searchQuery) {
      return html`<div class="storage-container-pane-empty-message">Loading resources...</div>`
    }

    if (visibleResources.length > 0) {
      return html`
        <div
          class="storage-container-pane-resource-drop-zone"
          @dragover=${this.onCurrentContainerDragOver}
          @drop=${this.onCurrentContainerDrop}
        >
          ${this.storageContext.view === 'grid' ? this.renderGridView() : this.renderListView()}
        </div>
      `
    }

    if (searchQuery) {
      return html`<div class="storage-container-pane-empty-message storage-container-pane-empty-message--centered storage-container-pane-empty-message--search">No resources match this search.</div>`
    }

    return this.renderEmptyContainer()
  }

  render () {
    const visibleResources = this.visibleResources
    const searchQuery = this.searchQuery

    return html`
      ${this.renderResourceListArea(searchQuery, visibleResources)}
      <storage-creation-area
        .subject=${this.currentSubject}
        .message=${'Drop files or folder here or click to choose'}
        @resource-created=${this.syncResources}
      ></storage-creation-area>
    `
  }
}
