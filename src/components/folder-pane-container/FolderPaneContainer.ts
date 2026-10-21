import { html, nothing } from 'lit'
import { property } from 'lit/decorators.js'
import { state } from 'lit/decorators.js'
import type { DataBrowserContext } from 'pane-registry'
import type { NamedNode } from 'rdflib'
import { customElement, FILE_EXPLORER_MANAGE_ACCESS_EVENT, getRelevantPanes, utils, WebComponent } from 'solid-ui'
import type { Resource } from '../../types'
import { getContainerMemberCountLabel, getResourceAccessState, getResourcesForContainer, type FolderPaneResourceLogic } from '../../helpers'
import 'solid-ui/components/resource-actions-menu'
import '~icons/lucide/file'
import '~icons/lucide/file-box'
import '~icons/lucide/folder'
import styles from './FolderPaneContainer.styles.css'
import '~icons/lucide/globe'
import '~icons/lucide/lock-keyhole'

type ResourceActionMenuItem = {
  label: string
  icon?: string
  action: (event: Event) => void
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

  @property({ type: Boolean, attribute: 'hide-root-special-folders' })
  accessor hideRootSpecialFolders = false

  @state()
  private accessor resourceActionMenuItems = new Map<string, ResourceActionMenuItem[]>()

  @state()
  private accessor resources: Resource[] = []
  @state()
  private accessor optimisticResources: Resource[] = []

  @state()
  private accessor resourceAccess = new Map<string, { state: 'public' | 'private' | 'unknown' | 'error' }>()
  @state()
  private accessor memberLoad = new Map<string, 'loading' | 'loaded' | 'error'>()

  @state()
  private accessor loading = true
  @state()
  private accessor loadError: string | undefined = undefined

  private actionMenuGeneration = 0
  private resourceGeneration = 0

  private selectResource (resource: Resource) {
    this.dispatchEvent(new CustomEvent('resource-selected', {
      detail: { resource: resource.subject },
      bubbles: true,
      composed: true,
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

  private isRootSpecialFolder (resource: Resource) {
    if (!resource.isContainer) return false
    const label = utils.label(resource.subject).toLowerCase()
    return label === 'public' || label === 'trash'
  }

  private getResourcesFromStore () {
    const resources = this.subject
      ? [...getResourcesForContainer(this.subject, this.resourceLogic).values()]
      : []

    const optimistic = this.optimisticResources.filter(resource =>
      !resources.some(confirmed => confirmed.id === resource.id))
    const combined = [...resources, ...optimistic]
    return this.hideRootSpecialFolders
      ? combined.filter(resource => !this.isRootSpecialFolder(resource))
      : combined
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
    const resources = this.getResourcesFromStore()
    this.resources = resources
    this.loading = false
    this.loadError = undefined
    this.memberLoad = new Map(resources.filter(resource => resource.isContainer).map(resource => [resource.id, 'loading']))

    if (this.browserContext) {
      void Promise.all(resources
        .filter(resource => resource.isContainer)
        .map(async resource => {
          try {
            await this.browserContext?.session.store.fetcher.load(resource.subject)
            if (generation !== this.resourceGeneration) return
            this.memberLoad = new Map(this.memberLoad).set(resource.id, 'loaded')
          } catch (error) {
            console.warn('Unable to load folder-pane container member count', error)
            if (generation !== this.resourceGeneration) return
            this.memberLoad = new Map(this.memberLoad).set(resource.id, 'error')
          }
        }))
    }

    if (generation !== this.resourceGeneration) return
    this.resources = this.getResourcesFromStore()
    // These are advisory and must not delay the server listing.
    for (const resource of this.resources) void this.loadResourceAccess(resource, generation)
    void this.loadResourceActionMenuItems(generation)
  }

  private async loadResourceAccess (resource: Resource, generation = this.resourceGeneration) {
    if (this.resourceAccess.has(resource.id) || !this.browserContext) return
    try {
      const metadata = await this.browserContext.session.logic.resource.fetchMetadata(resource.subject)
      if (generation !== this.resourceGeneration) return
      const state = getResourceAccessState(metadata.access)
      this.resourceAccess = new Map(this.resourceAccess).set(resource.id, { state })
    } catch {
      if (generation === this.resourceGeneration) {
        this.resourceAccess = new Map(this.resourceAccess).set(resource.id, { state: 'error' })
      }
    }
  }

  private renderAccessIndicator (resource: Resource) {
    const access = this.resourceAccess.get(resource.id)
    if (!access) return nothing
    // The icon element has no ARIA role of its own, so `title` alone is not
    // exposed to assistive technology (WCAG 1.1.1 Non-text Content). Giving it
    // an explicit img role and label ensures the public/private state is
    // announced, not just shown as a mouse-hover tooltip.
    return access.state === 'public'
      ? html`<icon-lucide-globe class="resource-access-indicator resource-access-indicator--public" role="img" aria-label="Public" title="Public"></icon-lucide-globe>`
      : access.state === 'private'
        ? html`<icon-lucide-lock-keyhole class="resource-access-indicator resource-access-indicator--private" role="img" aria-label="Private" title="Private"></icon-lucide-lock-keyhole>`
        : nothing
  }

  async refresh (reloadFromServer = true) {
    this.resourceGeneration++
    this.resourceAccess = new Map()
    this.memberLoad = new Map()
    this.resourceActionMenuItems = new Map()
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
        console.warn('Unable to refresh folder-pane container', error)
        return
      }
    }
    await this.loadResources()
  }

  private async loadResourceActionMenuItems (resourceGeneration = this.resourceGeneration) {
    const actionGeneration = ++this.actionMenuGeneration
    if (!this.browserContext) {
      this.resourceActionMenuItems = new Map()
      return
    }

    const menuItems = await Promise.all(this.resources.map(async resource => {
      const panes = await getRelevantPanes(resource.subject, this.browserContext!, {
        excludedPaneNames: ['sharing'],
        fallbackPaneName: 'internal'
      })
      const items = await Promise.all(panes.map(async pane => {
        const label = pane.label(resource.subject, this.browserContext!) || pane.name
        const paneWithIcon = pane as Omit<typeof pane, 'icon'> & {
          icon?: string | ((subject: NamedNode, context: DataBrowserContext) => string | undefined | Promise<string | undefined>)
        }
        const iconValue = paneWithIcon.icon
        const iconSource = typeof iconValue === 'function'
          ? await iconValue(resource.subject, this.browserContext!)
          : iconValue
        return {
          label,
          icon: iconSource,
          action: () => {
            this.dispatchEvent(new CustomEvent('resource-open-pane', {
              detail: { resource: resource.subject, paneName: pane.name },
              bubbles: true,
              composed: true
            }))
          }
        }
      }))
      return [resource.id, items] as const
    }))

    if (resourceGeneration === this.resourceGeneration && actionGeneration === this.actionMenuGeneration) {
      this.resourceActionMenuItems = new Map(menuItems)
    }
  }

  protected updated (changedProperties: Map<string, unknown>) {
    if (
      changedProperties.has('subject') ||
      changedProperties.has('resourceLogic') ||
      changedProperties.has('browserContext') ||
      changedProperties.has('hideRootSpecialFolders')
    ) {
      this.resourceAccess = new Map()
      this.memberLoad = new Map()
      this.resourceActionMenuItems = new Map()
      void this.loadResources()
    }
  }

  private openAccessControls (resource: Resource) {
    this.dispatchEvent(new CustomEvent(FILE_EXPLORER_MANAGE_ACCESS_EVENT, {
      detail: { subjectUri: resource.subject.uri },
      bubbles: true,
      composed: true
    }))
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
          .menuItems=${this.resourceActionMenuItems.get(resource.id) || []}
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
        class="resource-list-item"
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
          ${memberCount >= 0
            ? html`<span class="container-member-count">${getContainerMemberCountLabel(memberCount)}</span>`
            : nothing}
          ${this.renderAccessIndicator(resource)}
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
        ${resources.map((resource) => this.renderResourceItem(resource))}
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
        class="resource-grid-item"
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
          ${resource.isContainer && memberCount >= 0
            ? html`<span class="container-member-count">${getContainerMemberCountLabel(memberCount)}</span>`
            : !resource.isContainer
              ? html`<span class="resource-grid-label">${label}</span>`
              : nothing}
          ${this.renderAccessIndicator(resource)}
        </div>
        ${this.renderResourceActionsMenu(resource, 'grid')}
      </li>
    `
  }

  private renderGridView (resources: Resource[]) {
    return html`
      <ul class="resource-grid" role="listbox" aria-label="Container resources">
        ${resources.map(resource => this.renderGridItem(resource))}
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
      <div class="folder-pane-container-content">
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
