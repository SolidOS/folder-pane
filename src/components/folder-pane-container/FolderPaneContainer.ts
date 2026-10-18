import { html, nothing } from 'lit'
import { property } from 'lit/decorators.js'
import { state } from 'lit/decorators.js'
import type { DataBrowserContext } from 'pane-registry'
import type { NamedNode } from 'rdflib'
import { solidLogicSingleton } from 'solid-logic'
import { customElement, FILE_EXPLORER_MANAGE_ACCESS_EVENT, getRelevantPanes, utils, WebComponent } from 'solid-ui'
import type { Resource } from '../../types'
import { getContainerMemberCountLabel, getResourcesForContainer, type FolderPaneResourceLogic } from '../../helpers'
import 'solid-ui/components/resource-actions-menu'
import '~icons/lucide/file'
import '~icons/lucide/file-box'
import '~icons/lucide/folder'
import styles from './FolderPaneContainer.styles.css'
import '~icons/lucide/globe'
import '~icons/lucide/lock-keyhole'

type ResourceActionMenuItem = {
  label: string
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
  private accessor resourceAccess = new Map<string, { isPublic: boolean }>()

  @state()
  private accessor loading = true

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

    return this.hideRootSpecialFolders
      ? resources.filter(resource => !this.isRootSpecialFolder(resource))
      : resources
  }

  private get visibleResources () {
    const query = this.searchQuery.trim().toLowerCase()
    if (!query) return this.resources
    return this.resources.filter(resource => utils.label(resource.subject).toLowerCase().includes(query))
  }

  private async loadResources () {
    const generation = ++this.resourceGeneration
    this.loading = true
    const resources = this.getResourcesFromStore()

    if (this.browserContext) {
      await Promise.all(resources
        .filter(resource => resource.isContainer)
        .map(async resource => {
          try {
            await this.browserContext?.session.store.fetcher.load(resource.subject)
          } catch (error) {
            // The resource remains visible even when its member count cannot be loaded.
            console.warn('Unable to load folder-pane container member count', error)
          }
        }))
    }

    if (generation !== this.resourceGeneration) return
    this.resources = this.getResourcesFromStore()
    this.loading = false
    for (const resource of this.resources) void this.loadResourceAccess(resource)
    void this.loadResourceActionMenuItems()
  }

  private async loadResourceAccess (resource: Resource) {
    if (this.resourceAccess.has(resource.id)) return
    try {
      const metadata = await solidLogicSingleton.resource.fetchMetadata(resource.subject)
      this.resourceAccess = new Map(this.resourceAccess).set(resource.id, {
        isPublic: metadata.access.isPublic
      })
    } catch {
      // Access metadata is advisory; do not hide otherwise readable resources.
    }
  }

  private renderAccessIndicator (resource: Resource) {
    const access = this.resourceAccess.get(resource.id)
    if (!access) return nothing
    // The icon element has no ARIA role of its own, so `title` alone is not
    // exposed to assistive technology (WCAG 1.1.1 Non-text Content). Giving it
    // an explicit img role and label ensures the public/private state is
    // announced, not just shown as a mouse-hover tooltip.
    return access.isPublic
      ? html`<icon-lucide-globe class="resource-access-indicator resource-access-indicator--public" role="img" aria-label="Public" title="Public"></icon-lucide-globe>`
      : html`<icon-lucide-lock-keyhole class="resource-access-indicator resource-access-indicator--private" role="img" aria-label="Private" title="Private"></icon-lucide-lock-keyhole>`
  }

  refresh () {
    void this.loadResources()
  }

  private async loadResourceActionMenuItems () {
    const generation = ++this.actionMenuGeneration
    if (!this.browserContext) {
      this.resourceActionMenuItems = new Map()
      return
    }

    const menuItems = await Promise.all(this.resources.map(async resource => {
      const panes = await getRelevantPanes(resource.subject, this.browserContext!, {
        excludedPaneNames: ['sharing'],
        fallbackPaneName: 'internal'
      })
      return [resource.id, panes.map(pane => ({
        label: pane.label(resource.subject, this.browserContext!) || pane.name,
        action: () => {
          this.dispatchEvent(new CustomEvent('resource-open-pane', {
            detail: { resource: resource.subject, paneName: pane.name },
            bubbles: true,
            composed: true
          }))
        }
      }))] as const
    }))

    if (generation === this.actionMenuGeneration) {
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
    const memberCount = this.getVisibleMemberCount(resource)

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
    const memberCount = this.getVisibleMemberCount(resource)

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
          ${resource.isContainer
            ? html`<span class="container-member-count">${getContainerMemberCountLabel(memberCount)}</span>`
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
        ${this.loading
          ? html`<div class="folder-pane-container-loading" role="status">Loading resources…</div>`
          : resources.length > 0
            ? this.view === 'grid' ? this.renderGridView(resources) : this.renderListView(resources)
          : this.renderEmptyContainer()}
      </div>
    `
  }
}
