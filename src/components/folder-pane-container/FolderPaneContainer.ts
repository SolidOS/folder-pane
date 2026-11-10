import { html, nothing } from 'lit'
import { property } from 'lit/decorators.js'
import { state } from 'lit/decorators.js'
import { ref } from 'lit/directives/ref.js'
import { repeat } from 'lit/directives/repeat.js'
import type { DataBrowserContext } from 'pane-registry'
import type { NamedNode } from 'rdflib'
import type { ResourceMetadata } from 'solid-logic'
import { authn, authSession } from 'solid-logic'
import { customElement, preparePaneMenuItems, utils, WebComponent, widgets } from 'solid-ui'
import type { PaneMenuPane } from 'solid-ui'
import type { Resource } from '../../types'
import { resourceAccessCache } from '../../accessCache'
import { loadResourcePaneMenuItems } from '../../resourceActionItems'
import {
  getContainerMemberCountLabel,
  getResourceAccessState,
  getResourcesForContainer,
  readStoredWacAllow,
  type FolderPaneResourceLogic
} from '../../helpers'
import { createRequestQueue } from '../../requestQueue'
import * as debug from '../../debug'
import 'solid-ui/components/resource-actions-menu'
import '~icons/lucide/file'
import '~icons/lucide/file-box'
import '~icons/lucide/folder'
import '~icons/lucide/globe'
import '~icons/lucide/lock-keyhole'
import styles from './FolderPaneContainer.styles.css'

type ResourceActionMenuItem = {
  key?: string
  label: string
  icon?: string
  action: (event: Event) => void
}

type ResourceAccess = {
  state: 'public' | 'private' | 'unknown' | 'error'
  canManageAccess: boolean
}

@customElement('folder-pane-container')
export default class FolderPaneContainer extends WebComponent {
  static styles = styles

  @property({ attribute: false })
  accessor subject: NamedNode | undefined = undefined

  @property({ attribute: false })
  accessor resourceLogic: FolderPaneResourceLogic | null = null

  @property({ attribute: false })
  accessor browserContext: DataBrowserContext | undefined = undefined

  @property()
  accessor view: 'grid' | 'list' = 'grid'

  @property()
  accessor searchQuery = ''

  @property({ type: Boolean, attribute: 'can-upload' })
  accessor canUpload = false

  @property({ type: Boolean, attribute: 'upload-busy' })
  accessor uploadBusy = false

  @state()
  private accessor resourceActionMenuItems = new Map<string, ResourceActionMenuItem[]>()

  @state()
  private accessor resources: Resource[] = []
  @state()
  private accessor optimisticResources: Resource[] = []

  @state()
  private accessor resourceAccess = new Map<string, ResourceAccess>()

  @state()
  private accessor memberLoad = new Map<string, 'loading' | 'loaded' | 'parse-error' | 'error'>()

  @state()
  private accessor loading = true
  @state()
  private accessor loadError: string | undefined = undefined
  @state()
  private accessor dragActive = false

  private resourceActionMenuLoads = new Map<string, 'loading' | 'loaded' | 'error'>()
  private resourceGeneration = 0
  private authGeneration = 0
  private updateWorkScheduled = false
  private fileDragDepth = 0
  private draggableItems = new WeakSet<Element>()
  // Two at a time: each request may also need a CORS preflight, and pod hosts
  // such as solidcommunity.net rate-limit bursts.
  private detailsQueue = createRequestQueue({ concurrency: 2 })
  private detailsObserver: IntersectionObserver | undefined
  private authListenersAttached = false

  private selectResource (resource: Resource) {
    this.dispatchEvent(new CustomEvent('resource-selected', {
      detail: { resource: resource.subject },
      bubbles: true,
      composed: true,
    }))
  }

  private makeResourceDraggable (element: Element | undefined, resource: Resource) {
    if (!element || this.draggableItems.has(element)) return
    widgets.makeDraggable(element, resource.subject)
    this.draggableItems.add(element)
  }

  private hasDraggedFiles (event: DragEvent) {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files')
  }

  private handleFileDragEnter = (event: DragEvent) => {
    if (!this.canUpload || !this.hasDraggedFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    this.fileDragDepth++
    this.dragActive = true
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  private handleFileDragLeave = (event: DragEvent) => {
    if (this.fileDragDepth === 0) return
    event.preventDefault()
    event.stopPropagation()
    this.fileDragDepth = Math.max(0, this.fileDragDepth - 1)
    this.dragActive = this.fileDragDepth > 0
  }

  private handleFileDragOver = (event: DragEvent) => {
    if (!this.canUpload || !this.hasDraggedFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  private handleFileDrop = (event: DragEvent) => {
    const dataTransfer = event.dataTransfer
    const files = Array.from(event.dataTransfer?.files ?? [])
    const hasDirectory = Array.from(dataTransfer?.items ?? []).some(item => {
      const entry = (item as DataTransferItem & {
        webkitGetAsEntry?: () => { isDirectory?: boolean } | null
      }).webkitGetAsEntry?.()
      return entry?.isDirectory === true
    })
    if (!files.length && !hasDirectory) return
    event.preventDefault()
    event.stopPropagation()
    this.fileDragDepth = 0
    this.dragActive = false
    if (hasDirectory) {
      this.dispatchEvent(new CustomEvent('folder-pane-upload-rejected', {
        detail: { message: 'Folder drops are not supported. Select files instead.' },
        bubbles: true,
        composed: true
      }))
      return
    }
    if (this.uploadBusy) {
      this.dispatchEvent(new CustomEvent('folder-pane-upload-rejected', {
        detail: { message: 'Please wait for the current upload or creation to finish.' },
        bubbles: true,
        composed: true
      }))
      return
    }
    if (!this.canUpload) return
    this.dispatchEvent(new CustomEvent('folder-pane-upload-files', {
      detail: { files },
      bubbles: true,
      composed: true
    }))
  }

  private handleResourceKeyDown (event: KeyboardEvent, resource: Resource) {
    if (event.target !== event.currentTarget) return

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.selectResource(resource)
    }
  }

  private getVisibleMemberCount (resource: Resource) {
    if (!resource.isContainer || !this.resourceLogic) return 0
    const resourceLogic = this.resourceLogic
    return resourceLogic.getContainerMembers(resource.subject)
      .filter(member => !resourceLogic.isHiddenFile(member))
      .length
  }

  private getResourcesFromStore () {
    const resources = this.subject
      ? [...getResourcesForContainer(this.subject, this.resourceLogic).values()]
      : []

    const optimistic = this.optimisticResources.filter(resource =>
      !resources.some(confirmed => confirmed.id === resource.id))
    const combined = [...resources, ...optimistic]
    return combined
  }

  addOptimisticResource (subject: NamedNode) {
    if (!this.resourceLogic || this.optimisticResources.some(resource => resource.id === subject.value)) return
    const next: Resource = {
      id: subject.value,
      subject,
      parentId: this.subject?.value ?? null,
      isContainer: subject.uri.endsWith('/') || this.resourceLogic.isContainer(subject)
    }
    this.optimisticResources = [...this.optimisticResources, next]
    void this.loadResources()
  }

  private get visibleResources () {
    const query = this.searchQuery.trim().toLowerCase()
    if (!query) return this.resources
    return this.resources.filter(resource => utils.label(resource.subject).toLowerCase().includes(query))
  }

  private async loadResources () {
    const generation = ++this.resourceGeneration
    this.resetResourceDetails()
    this.resourceActionMenuItems = new Map()
    this.resourceActionMenuLoads = new Map()
    const resources = this.getResourcesFromStore()
    this.resources = resources
    this.loading = false
    this.loadError = undefined

    if (generation !== this.resourceGeneration) return
  }

  private loadResourceDetails (resource: Resource) {
    const authGeneration = this.authGeneration
    const viewer = this.viewer
    if (resource.isContainer) {
      void this.loadContainerDetails(resource, this.resourceGeneration, authGeneration, viewer)
    } else {
      void this.loadResourceAccess(resource, this.resourceGeneration, authGeneration, viewer)
    }
  }

  /**
   * A container's member count needs a GET, and that response already carries
   * WAC-Allow; reuse it instead of sending a HEAD (and its CORS preflight).
   */
  private isCurrentAccessRequest (generation: number, authGeneration: number, viewer: string | undefined) {
    return generation === this.resourceGeneration &&
      authGeneration === this.authGeneration &&
      viewer === this.viewer
  }

  private async loadContainerDetails (
    resource: Resource,
    generation = this.resourceGeneration,
    authGeneration = this.authGeneration,
    viewer = this.viewer
  ) {
    if (!this.browserContext) return
    if (!this.isCurrentAccessRequest(generation, authGeneration, viewer)) return
    const needsAccess = !this.resourceAccess.has(resource.id)
    if (needsAccess) {
      this.resourceAccess = new Map(this.resourceAccess).set(resource.id, { state: 'unknown', canManageAccess: false })
    }
    await this.loadMemberCount(resource, generation, authGeneration, viewer)
    if (!needsAccess || !this.isCurrentAccessRequest(generation, authGeneration, viewer)) return

    const memberState = this.memberLoad.get(resource.id)
    const stored = readStoredWacAllow(
      this.browserContext.session.store.fetcher.getHeader(resource.subject, 'wac-allow')
    )
    if (stored) {
      this.setResourceAccess(resource, {
        state: stored.isPublic ? 'public' : 'private',
        canManageAccess: stored.canManageAccess
      })
    } else if (memberState === 'error') {
      this.resourceAccess = new Map(this.resourceAccess).set(resource.id, { state: 'error', canManageAccess: false })
    } else {
      this.resourceAccess = new Map(this.resourceAccess)
      this.resourceAccess.delete(resource.id)
      await this.loadResourceAccess(resource, generation, authGeneration, viewer)
    }
  }

  private async loadMemberCount (
    resource: Resource,
    generation = this.resourceGeneration,
    authGeneration = this.authGeneration,
    viewer = this.viewer
  ) {
    if (!resource.isContainer || this.memberLoad.has(resource.id) || !this.browserContext) return
    const fetcher = this.browserContext.session.store.fetcher
    this.memberLoad = new Map(this.memberLoad).set(resource.id, 'loading')
    try {
      await this.detailsQueue.run(() => fetcher.load(resource.subject))
      if (!this.isCurrentAccessRequest(generation, authGeneration, viewer)) return
      this.memberLoad = new Map(this.memberLoad).set(resource.id, 'loaded')
    } catch (error) {
      if (!this.isCurrentAccessRequest(generation, authGeneration, viewer)) return
      debug.warn('Unable to load folder-pane container member count', error)
      const message = error instanceof Error ? error.message : String(error)
      const state = /parse|syntax|turtle|unexpected token/i.test(message) ? 'parse-error' : 'error'
      this.memberLoad = new Map(this.memberLoad).set(resource.id, state)
    }
  }

  private get viewer () {
    return authn.currentUser?.()?.value
  }

  private setResourceAccess (
    resource: Resource,
    access: ResourceAccess,
    authGeneration = this.authGeneration,
    viewer = this.viewer,
    generation = this.resourceGeneration
  ) {
    if (!this.isCurrentAccessRequest(generation, authGeneration, viewer)) return
    this.resourceAccess = new Map(this.resourceAccess).set(resource.id, access)
    resourceAccessCache.set(viewer, resource.subject.uri, access)
  }

  private async loadResourceAccess (
    resource: Resource,
    generation = this.resourceGeneration,
    authGeneration = this.authGeneration,
    viewer = this.viewer
  ) {
    if (this.resourceAccess.has(resource.id) || !this.browserContext) return
    if (!this.isCurrentAccessRequest(generation, authGeneration, viewer)) return
    const cached = resourceAccessCache.get(viewer, resource.subject.uri)
    if (cached) {
      this.resourceAccess = new Map(this.resourceAccess).set(resource.id, cached)
      return
    }
    const resourceLogic = this.browserContext.session.logic.resource
    this.resourceAccess = new Map(this.resourceAccess).set(resource.id, { state: 'unknown', canManageAccess: false })
    try {
      const metadata = await this.detailsQueue.run<ResourceMetadata>(() => resourceLogic.fetchMetadata(resource.subject))
      if (!this.isCurrentAccessRequest(generation, authGeneration, viewer)) return
      this.setResourceAccess(resource, {
        state: getResourceAccessState(metadata.access),
        canManageAccess: metadata.access.canManageAccess
      }, authGeneration, viewer, generation)
    } catch {
      if (this.isCurrentAccessRequest(generation, authGeneration, viewer)) {
        this.resourceAccess = new Map(this.resourceAccess).set(resource.id, { state: 'error', canManageAccess: false })
      }
    }
  }

  private resetResourceDetails () {
    this.detailsQueue.clear()
    this.detailsObserver?.disconnect()
    this.resourceAccess = new Map()
    this.memberLoad = new Map()
  }

  private handleAuthChange = () => {
    this.authGeneration++
    resourceAccessCache.clear()
    this.detailsQueue.clear()
    this.resourceAccess = new Map()
    this.memberLoad = new Map()
    this.resourceActionMenuLoads = new Map()
    this.requestUpdate()
  }

  private observeResourceItems () {
    const items = Array.from(this.renderRoot.querySelectorAll<HTMLElement>('[data-resource-id]'))
    const resourcesById = new Map(this.resources.map(resource => [resource.id, resource]))
    const pending = items.filter(item => {
      const resource = resourcesById.get(item.dataset.resourceId!)
      return resource && ((resource.isContainer && !this.memberLoad.has(resource.id)) || !this.resourceAccess.has(resource.id))
    })
    if (pending.length === 0) return

    if (typeof IntersectionObserver === 'undefined') {
      for (const item of pending) this.loadResourceDetails(resourcesById.get(item.dataset.resourceId!)!)
      return
    }

    this.detailsObserver ??= new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const element = entry.target as HTMLElement
        this.detailsObserver?.unobserve(element)
        const resource = this.resources.find(candidate => candidate.id === element.dataset.resourceId)
        if (resource) this.loadResourceDetails(resource)
      }
    }, { rootMargin: '200px' })
    for (const item of pending) this.detailsObserver.observe(item)
  }

  connectedCallback () {
    super.connectedCallback()
    if (!this.authListenersAttached) {
      authSession.events.on('login', this.handleAuthChange)
      authSession.events.on('logout', this.handleAuthChange)
      this.authListenersAttached = true
    }
    if (this.hasUpdated) this.requestUpdate()
  }

  disconnectedCallback () {
    if (this.authListenersAttached) {
      authSession.events.off('login', this.handleAuthChange)
      authSession.events.off('logout', this.handleAuthChange)
      this.authListenersAttached = false
    }
    super.disconnectedCallback()
    this.resourceGeneration++
    this.resourceActionMenuLoads = new Map()
    this.resetResourceDetails()
  }

  async refresh (reloadFromServer = true) {
    resourceAccessCache.clear()
    this.resourceGeneration++
    this.resetResourceDetails()
    this.resourceActionMenuItems = new Map()
    this.resourceActionMenuLoads = new Map()
    this.resourceAccess = new Map()
    this.optimisticResources = []
    if (reloadFromServer && this.subject && this.browserContext) {
      try {
        await this.browserContext.session.store.fetcher.load(this.subject, {
          force: true,
          clearPreviousData: true
        })
      } catch (error) {
        await this.loadResources()
        this.loadError = 'The folder could not be refreshed. Showing the last known listing.'
        debug.warn('Unable to refresh folder-pane container', error)
        return
      }
    }
    await this.loadResources()
  }

  protected updated (changedProperties: Map<string, unknown>) {
    if (changedProperties.has('canUpload') && !this.canUpload) {
      this.fileDragDepth = 0
      this.dragActive = false
    }

    if (
      changedProperties.has('subject') ||
      changedProperties.has('resourceLogic') ||
      changedProperties.has('browserContext')
    ) {
      if (!this.updateWorkScheduled) {
        this.updateWorkScheduled = true
        queueMicrotask(() => {
          this.updateWorkScheduled = false
          if (!this.isConnected) return
          this.resourceGeneration++
          this.resetResourceDetails()
          this.resourceActionMenuItems = new Map()
          void this.loadResources()
          this.observeResourceItems()
        })
        return
      }
    }
    this.observeResourceItems()
  }

  private openAccessControls (resource: Resource) {
    resourceAccessCache.delete(resource.subject.uri)
    this.dispatchEvent(new CustomEvent('resource-open-pane', {
      detail: { resource: resource.subject, paneName: 'sharing' },
      bubbles: true,
      composed: true
    }))
  }

  private setResourceActionMenuItems (resource: Resource, items: ResourceActionMenuItem[]) {
    this.resourceActionMenuItems = new Map(this.resourceActionMenuItems).set(resource.id, items)
  }

  private renderAccessIndicator (resource: Resource) {
    const access = this.resourceAccess.get(resource.id)
    return access?.state === 'public'
      ? html`<icon-lucide-globe class="resource-access-indicator resource-access-indicator--public" role="img" aria-label="Public" title="Public"></icon-lucide-globe>`
      : access?.state === 'private'
        ? html`<icon-lucide-lock-keyhole class="resource-access-indicator resource-access-indicator--private" role="img" aria-label="Private" title="Private"></icon-lucide-lock-keyhole>`
        : nothing
  }

  private openResourcePane (resource: Resource, paneName: string) {
    this.dispatchEvent(new CustomEvent('resource-open-pane', {
      detail: { resource: resource.subject, paneName },
      bubbles: true,
      composed: true
    }))
  }

  private async getContentsMenuItem (resource: Resource): Promise<ResourceActionMenuItem | undefined> {
    if (!resource.isContainer || !this.browserContext) return undefined
    const folderPane = this.browserContext.session.paneRegistry.byName('folder')
    if (!folderPane) return undefined
    const [item] = await preparePaneMenuItems({
      subject: resource.subject,
      context: this.browserContext,
      panes: [folderPane as PaneMenuPane],
      openPane: (_subject, paneName, event) => {
        event.stopPropagation()
        this.openResourcePane(resource, paneName)
      }
    })
    const action = item?.action ?? ((event: Event) => {
      event.stopPropagation()
      this.openResourcePane(resource, folderPane.name)
    })
    return { ...item, key: folderPane.name, label: 'Contents', action }
  }

  private async loadResourceActionMenuItems (resource: Resource) {
    if (!this.browserContext) return
    const authGeneration = this.authGeneration
    const viewer = this.viewer
    const previousLoad = this.resourceActionMenuLoads.get(resource.id)
    if (previousLoad === 'loading' || previousLoad === 'loaded') return

    const resourceGeneration = this.resourceGeneration
    if (!this.isCurrentAccessRequest(resourceGeneration, authGeneration, viewer)) return
    this.resourceActionMenuLoads.set(resource.id, 'loading')
    const accessMetadata = this.browserContext.session.logic.resource.fetchMetadata(resource.subject)
      .then((metadata: ResourceMetadata) => metadata.access)
      .catch(error => {
        debug.warn('Unable to load folder-pane access metadata for resource actions', error)
        return undefined
      })
    const contents = await this.getContentsMenuItem(resource)
    if (!this.isCurrentAccessRequest(resourceGeneration, authGeneration, viewer)) return
    if (contents) this.setResourceActionMenuItems(resource, [contents])

    try {
      const items: ResourceActionMenuItem[] | undefined = await loadResourcePaneMenuItems({
        resource: resource.subject,
        isContainer: resource.isContainer,
        context: this.browserContext,
        resourceLogic: this.resourceLogic,
        openPane: (paneName, event) => {
          event.stopPropagation()
          this.openResourcePane(resource, paneName)
        },
        isCurrent: () => this.isCurrentAccessRequest(resourceGeneration, authGeneration, viewer)
      })
      if (!items) return

      if (contents) items.splice(1, 0, contents)
      this.setResourceActionMenuItems(resource, items)
      this.resourceActionMenuLoads.set(resource.id, 'loaded')
    } catch (error) {
      if (!this.isCurrentAccessRequest(resourceGeneration, authGeneration, viewer)) return
      this.resourceActionMenuLoads.set(resource.id, 'error')
      debug.warn('Unable to load resource panes for folder-pane action menu', error)
    } finally {
      const access = await accessMetadata
      if (this.isCurrentAccessRequest(resourceGeneration, authGeneration, viewer) && access) {
        this.setResourceAccess(resource, {
          state: getResourceAccessState(access),
          canManageAccess: access.canManageAccess
        }, authGeneration, viewer, resourceGeneration)
      } else if (this.isCurrentAccessRequest(resourceGeneration, authGeneration, viewer)) {
        this.resourceAccess = new Map(this.resourceAccess).set(resource.id, {
          state: 'error',
          canManageAccess: false
        })
      }
    }
  }

  private handleResourceActionsMenuClick (resource: Resource) {
    void this.loadResourceActionMenuItems(resource)
  }

  private renderResourceActionsMenu (resource: Resource, placement: 'grid' | 'list') {
    return html`
      <div
        class="resource-actions-menu resource-actions-menu--${placement}"
        @click=${(event: MouseEvent) => event.stopPropagation()}
      >
        <solid-ui-resource-actions-menu
          .store=${this.browserContext?.session.store}
          .subjectUri=${resource.subject.uri}
          .handleAccessClick=${() => this.openAccessControls(resource)}
          .showAccessInMenu=${true}
          .canManageAccess=${this.resourceAccess.get(resource.id)?.canManageAccess === true}
          .menuItems=${this.resourceActionMenuItems.get(resource.id) || []}
          @click=${() => this.handleResourceActionsMenuClick(resource)}
        ></solid-ui-resource-actions-menu>
      </div>
    `
  }

  private renderResourceItem (resource: Resource) {
    const label = utils.label(resource.subject)
    const memberCount = resource.isContainer && this.memberLoad.get(resource.id) === 'loaded'
      ? this.getVisibleMemberCount(resource)
      : -1

    return html`
      <li
        ${ref(element => this.makeResourceDraggable(element, resource))}
        class="resource-list-item"
        data-resource-id=${resource.id}
        notSelectable="false"
        aria-selected="false"
        aria-label=${label}
        about=${resource.subject.toNT()}
        role="option"
        tabindex="0"
        .subject=${resource.subject}
        @click=${() => this.selectResource(resource)}
        @keydown=${(event: KeyboardEvent) => this.handleResourceKeyDown(event, resource)}
      >
        <span class="resource-list-main">
          <span class=${resource.isContainer ? 'resource-list-icon resource-list-icon--container' : 'resource-list-icon'} aria-hidden="true">
            ${resource.isContainer
              ? html`<icon-lucide-folder></icon-lucide-folder>`
              : html`<icon-lucide-file></icon-lucide-file>`}
          </span>
          <span class="resource-list-label">${label}</span>
          <span class="resource-list-meta">
            ${memberCount >= 0
              ? html`<span class="container-member-count">${getContainerMemberCountLabel(memberCount)}</span>`
              : nothing}
            ${this.renderAccessIndicator(resource)}
          </span>
        </span>
        ${this.renderResourceActionsMenu(resource, 'list')}
      </li>
    `
  }

  private renderListView (resources: Resource[]) {
    return html`
      <ul class="resource-list" role="listbox" aria-label="Container resources">
        <li class="resource-list-header" role="presentation" aria-hidden="true">
          <span>Name</span>
          <span>Actions</span>
        </li>
        ${repeat(resources, resource => resource.id, resource => this.renderResourceItem(resource))}
      </ul>
    `
  }

  private renderGridItem (resource: Resource) {
    const label = utils.label(resource.subject)
    const memberCount = resource.isContainer && this.memberLoad.get(resource.id) === 'loaded'
      ? this.getVisibleMemberCount(resource)
      : -1

    return html`
      <li
        ${ref(element => this.makeResourceDraggable(element, resource))}
        class="resource-grid-item"
        data-resource-id=${resource.id}
        notSelectable="false"
        aria-selected="false"
        aria-label=${label}
        about=${resource.subject.toNT()}
        role="option"
        tabindex="0"
        .subject=${resource.subject}
        @click=${() => this.selectResource(resource)}
        @keydown=${(event: KeyboardEvent) => this.handleResourceKeyDown(event, resource)}
      >
        <span class=${resource.isContainer ? 'resource-grid-icon resource-grid-icon--container' : 'resource-grid-icon'} aria-hidden="true">
          ${resource.isContainer
            ? html`<icon-lucide-folder></icon-lucide-folder>`
            : html`<icon-lucide-file></icon-lucide-file>`}
        </span>
        ${resource.isContainer
          ? html`<span class="resource-grid-label resource-grid-label--container">${label}</span>`
          : nothing}
        <div class="resource-grid-item-footer">
          ${resource.isContainer
            ? memberCount < 0
              ? nothing
              : html`<span class="container-member-count">${getContainerMemberCountLabel(memberCount)}</span>`
            : html`<span class="resource-grid-label">${label}</span>`}
          ${this.renderAccessIndicator(resource)}
        </div>
        ${this.renderResourceActionsMenu(resource, 'grid')}
      </li>
    `
  }

  private renderGridView (resources: Resource[]) {
    return html`
      <ul class="resource-grid" role="listbox" aria-label="Container resources">
        ${repeat(resources, resource => resource.id, resource => this.renderGridItem(resource))}
      </ul>
    `
  }

  private renderEmptyContainer () {
    if (this.searchQuery.trim()) {
      return html`
        <div class="folder-pane-container-empty-message" role="status">
          <h2 class="folder-pane-container-empty-message-title">No resources match this search.</h2>
        </div>
      `
    }
    return html`
      <div class="folder-pane-container-empty-message" role="status">
        <div class="folder-pane-container-empty-message-icon" aria-hidden="true">
          <icon-lucide-file-box></icon-lucide-file-box>
        </div>
        <h2 class="folder-pane-container-empty-message-title">This folder is empty</h2>
        <p class="folder-pane-container-empty-message-body">Resources added to this folder will appear here.</p>
      </div>
    `
  }

  render () {
    const resources = this.visibleResources
    return html`
      <div
        class="folder-pane-container-content"
        data-drag-active=${String(this.dragActive)}
        @dragenter=${this.handleFileDragEnter}
        @dragleave=${this.handleFileDragLeave}
        @dragover=${this.handleFileDragOver}
        @drop=${this.handleFileDrop}
      >
        ${this.loadError ? html`<div class="folder-pane-container-error" role="alert">${this.loadError}</div>` : nothing}
        ${this.loading
          ? html`<div class="folder-pane-container-loading" role="status">Loading resources…</div>`
          : resources.length > 0
            ? this.view === 'grid' ? this.renderGridView(resources) : this.renderListView(resources)
          : this.renderEmptyContainer()}
      </div>
    `
  }
}
