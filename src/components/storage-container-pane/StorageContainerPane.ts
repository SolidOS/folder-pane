import { html, nothing } from 'lit'
import { property, state } from 'lit/decorators.js'
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
import { customElement, DEFAULT_STORE, fileExplorerContext, storeContext, utils, WebComponent } from 'solid-ui'
import type { PaneDefinition } from 'pane-registry'
import { Resource, type ResourceMap, StoragePaneOutliner } from '../../types'
import { getResourcesForContainer, getResourcesFromSearchQuery, handleContainerDragOver, handleContainerDrop, loadResourcesForContainer } from '../../helpers'
import { getRelevantPanes, getRelevantPane } from 'solid-ui'
import type { ResourceActionMenuItem as ResourcePaneMenuItem } from 'solid-ui/components/resource-actions-menu'
import styles from './StorageContainerPane.styles.css'
import 'solid-ui/components/file-explorer-header'
import 'solid-ui/components/resource-actions-menu'
import '~icons/lucide/folder'
import '~icons/lucide/file'
import '~icons/lucide/globe'
import '~icons/lucide/lock-keyhole'

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

  private resourceAccessLoading = new Set<string>()
  private resourcePaneLoading = new Set<string>()
  private resourceSyncGeneration = 0

  @state()
  accessor isLoadingResources = false

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
    } finally {
      this.resourcePaneLoading.delete(resource.id)
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
    } catch (error) {
      console.error('[storage-container-pane.deleteResource] failed', error)
      globalThis.alert(this.currentSubject?.uri.endsWith('/Trash/')
        ? 'Error deleting resource'
        : 'Error moving resource to Trash')
    }
  }

  private renderResourceActionsMenu (resource: Resource, placement: 'grid' | 'list') {
    const sharingPane = byName('sharing')
    const canDelete = this.resourceAccess.get(resource.id)?.canDelete ?? false
    const deleteLabel = this.currentSubject?.uri.endsWith('/Trash/')
      ? 'Permanently Delete'
      : 'Move to Trash'
    const menuItems = [
      ...(this.resourcePaneItems.get(resource.id) ?? [])
    ]

    return html`
      <div class="resource-actions-menu resource-actions-menu--${placement}" @click=${(event: MouseEvent) => event.stopPropagation()}>
        <solid-ui-resource-actions-menu
          .menuItems=${menuItems}
          .handleAccessClick=${sharingPane
            ? () => {
                this.storageContext.selectResource(resource.subject, sharingPane.name)
              }
            : undefined}
          .handleDeleteClick=${canDelete
            ? () => { void this.deleteResource(resource) }
            : undefined}
          .deleteLabel=${deleteLabel}
        ></solid-ui-resource-actions-menu>
      </div>
    `
  }

  private onContainerDragOver (resource: Resource, event: DragEvent) {
    if (!resource.isContainer) {
      return
    }

    handleContainerDragOver(event, this.store, resource.subject)
  }

  private onContainerDrop (resource: Resource, event: DragEvent) {
    if (!resource.isContainer) {
      return
    }

    handleContainerDrop(event, this.store, resource.subject, () => { void this.syncResources() })
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
          class=${selected ? 'resource-grid-item selected' : 'resource-grid-item'}
          notSelectable="false"
          aria-selected=${String(selected)}
          about=${resource.subject.toNT()}
          role="option"
          tabindex="0"
          .subject=${resource.subject}
          @click=${() => this.selectResource(resource)}
          @dragover=${(event: DragEvent) => this.onContainerDragOver(resource, event)}
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
        notSelectable="false"
        aria-selected=${String(selected)}
        about=${resource.subject.toNT()}
        role="option"
        tabindex="0"
        .subject=${resource.subject}
        @click=${() => this.selectResource(resource)}
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
        class=${selected ? 'resource-list-item selected' : 'resource-list-item'}
        notSelectable="false"
        aria-selected=${String(selected)}
        about=${resource.subject.toNT()}
        role="option"
        tabindex="0"
        .subject=${resource.subject}
        @click=${() => this.selectResource(resource)}
        @dragover=${(event: DragEvent) => this.onContainerDragOver(resource, event)}
        @drop=${(event: DragEvent) => this.onContainerDrop(resource, event)}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            this.selectResource(resource)
          }
        }}
      >
        <span class=${isContainer(resource.subject) ? 'resource-list-icon resource-list-icon--container' : 'resource-list-icon'}>
          ${this.renderResourceIcon(resource)}
        </span>
        <span class="resource-list-label">${utils.label(resource.subject)}</span>
        ${isContainer(resource.subject) ? html`<span class="container-member-count">${getContainerVisibleItemCount(resource.subject)} items</span>` : nothing}
        ${isPublic === undefined ? nothing : isPublic ? html`<icon-lucide-globe></icon-lucide-globe>` : html`<icon-lucide-lock-keyhole></icon-lucide-lock-keyhole>`}
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
      void this.syncResources()
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
      <storage-creation-area
        .subject=${this.currentSubject}
        .message=${'Drop files or folder here'}
        @resource-created=${this.syncResources}
      ></storage-creation-area>
    `
  }
}
