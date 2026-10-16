import { html, nothing } from 'lit'
import { property } from 'lit/decorators.js'
import type { NamedNode } from 'rdflib'
import { customElement, utils, WebComponent } from 'solid-ui'
import type { SolidLogic } from 'solid-logic'
import type { Resource } from '../../types'
import { getResourcesForContainer } from '../../helpers'
import '~icons/lucide/file'
import '~icons/lucide/file-box'
import '~icons/lucide/folder'
import styles from './FolderPaneContainer.styles.css'

@customElement('folder-pane-container')
export default class FolderPaneContainer extends WebComponent {
  static styles = styles

  @property({ attribute: false })
  accessor subject: NamedNode | undefined = undefined

  @property({ attribute: false })
  accessor resourceLogic: SolidLogic['resource'] | null = null

  @property()
  accessor view: 'grid' | 'list' = 'grid'

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
          ${memberCount > 0
            ? html`<span class="container-member-count">${memberCount} ${memberCount === 1 ? 'item' : 'items'}</span>`
            : nothing}
        </span>
      </li>
    `
  }

  private renderListView (resources: Resource[]) {
    return html`
      <ul class="resource-list" role="listbox" aria-label="Container resources">
        <li class="resource-list-header" role="presentation" aria-hidden="true">
          <span>Name</span>
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
            ? memberCount > 0
              ? html`<span class="container-member-count">${memberCount} ${memberCount === 1 ? 'item' : 'items'}</span>`
              : nothing
            : html`<span class="resource-grid-label">${label}</span>`}
        </div>
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
    const resources = this.subject
      ? [...getResourcesForContainer(this.subject, this.resourceLogic).values()]
      : []

    return html`
      <div class="folder-pane-container-content">
        ${resources.length > 0
          ? this.view === 'grid' ? this.renderGridView(resources) : this.renderListView(resources)
          : this.renderEmptyContainer()}
      </div>
    `
  }
}
