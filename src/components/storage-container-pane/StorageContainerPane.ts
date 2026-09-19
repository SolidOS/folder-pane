import { html, nothing } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import { consume } from '@lit/context'
import '../storage-header'
import '../storage-content-view'
import '../storage-creation-area'
import type { LiveStore, NamedNode } from 'rdflib'
import type { DataBrowserContext } from 'pane-registry'
import { byName } from 'pane-registry'
import type { FileExplorerContext } from 'solid-ui'
import type { StorageContext } from '../storage-provider/context'
import { storageContext, DEFAULT_STORAGE_CONTEXT } from '../storage-provider/context'
import { solidLogicSingleton } from 'solid-logic'
import { customElement, DEFAULT_STORE, fileExplorerContext, log, storeContext, utils, WebComponent } from 'solid-ui'
import type { PaneDefinition } from 'pane-registry'
import { Resource, type ResourceMap, StoragePaneOutliner } from '../../types'
import { getResourcesForContainer, getResourcesFromSearchQuery, handleContainerDragOver, handleContainerDrop, loadResourcesForContainer, renderSelectedResourceInContentView } from '../../helpers'
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
  accessor resourceVisibility: Map<string, boolean> = new Map()

  @state()
  accessor resourcePaneIcons: Map<string, string> = new Map()

  @state()
  accessor resourcePaneItems: Map<string, ResourcePaneMenuItem[]> = new Map()

  @state()
  accessor resourceRelevantPanes: Map<string, PaneDefinition[]> = new Map()

  private resourceVisibilityLoading = new Set<string>()
  private resourcePaneLoading = new Set<string>()
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
        const nextVisibility = metadata.access.isPublic
        if (this.resourceVisibility.get(resource.id) === nextVisibility) {
          return
        }

        this.resourceVisibility = new Map(this.resourceVisibility).set(resource.id, nextVisibility)
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

  private renderResourceActionsMenu (resource: Resource, placement: 'grid' | 'list') {
    const sharingPane = byName('sharing')
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

  private renderContainerPane (selectedResource: NamedNode) {
    if (!this.contentView) return

    const containerPane = document.createElement('storage-container-pane') as HTMLElement & {
      outliner?: StoragePaneOutliner
      browserContext?: DataBrowserContext | null
      subject?: NamedNode
    }

    containerPane.subject = selectedResource
    containerPane.outliner = this.outliner
    containerPane.browserContext = this.browserContext

    this.contentView.replaceChildren(containerPane)
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
    this.ensureResourceVisibility(resource)
    const isPublic = this.resourceVisibility.get(resource.id)
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
    this.ensureResourceVisibility(resource)
    const isPublic = this.resourceVisibility.get(resource.id)
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
    const selectedResource = this.selectedResource
    const showContainerListAndCreationArea = !selectedResource || selectedResource.sameTerm(this.currentSubject ?? selectedResource)

    return html`
      ${showContainerListAndCreationArea ? nothing : html`<storage-content-view></storage-content-view>`}
      ${showContainerListAndCreationArea
        ? html`
            ${this.renderResourceListArea(searchQuery, visibleResources)}
            <storage-creation-area
              .subject=${this.currentSubject}
              .message=${'Drop files or folder here'}
              @resource-created=${this.syncResources}
            ></storage-creation-area>
          `
        : nothing}
    `
  }
}
