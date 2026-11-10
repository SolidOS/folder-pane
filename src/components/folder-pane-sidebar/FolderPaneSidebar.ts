import { customElement, utils, WebComponent, widgets } from 'solid-ui'
import { html, nothing } from 'lit'
import { keyed } from 'lit/directives/keyed.js'
import { ref } from 'lit/directives/ref.js'
import { repeat } from 'lit/directives/repeat.js'
import { property, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import styles from './FolderPaneSidebar.styles.css'
import type { LiveStore, NamedNode } from 'rdflib'
import type { Resource, ResourceMap } from '../../types'
import '~icons/lucide/chevron-right'
import '~icons/lucide/circle-small'
import '~icons/lucide/folder'
import { getResourcesForContainer, type FolderPaneResourceLogic } from '../../helpers'
import * as debug from '../../debug'

type SpecialIcon = 'folder'

@customElement('folder-pane-sidebar')
export default class FolderPaneSidebar extends WebComponent {
  static styles = styles

  @property({ attribute: false })
  accessor store: LiveStore | null = null

  @property({ attribute: false })
  accessor subject: NamedNode | undefined = undefined

  @property({ attribute: false })
  accessor resourceLogic: FolderPaneResourceLogic | null = null

  @property({ attribute: false })
  accessor selectedResource: NamedNode | undefined = undefined

  @state()
  accessor resources: ResourceMap = new Map()

  @state()
  accessor expandedContainers: Set<string> = new Set()

  @state()
  accessor homeExpanded = true
  @state()
  private accessor activeResourceId: string | null = null
  private pendingFocusResourceId: string | null = null
  private resourceGeneration = 0
  private focusHomeOnUpdate = false
  private draggableRows = new WeakSet<Element>()

  private makeResourceDraggable (element: Element | undefined, resource: Resource) {
    if (!element || this.draggableRows.has(element)) return
    widgets.makeDraggable(element, resource.subject)
    this.draggableRows.add(element)
  }

  private loadResources () {
    const hadFocus = this.isTreeFocused()
    const previousResources = new Map(this.getVisibleResources().map(resource => [resource.id, resource]))
    const previousActiveId = this.activeResourceId
    this.resourceGeneration++
    if (!this.store || !this.subject) {
      this.resources = new Map()
      this.expandedContainers = new Set()
      this.activeResourceId = null
      return
    }

    this.resources = getResourcesForContainer(this.subject, this.resourceLogic)
    const visibleIds = this.getVisibleResourceIds()
    if (previousActiveId && !visibleIds.includes(previousActiveId)) {
      let candidate = previousResources.get(previousActiveId)
      let fallback: string | null = null
      while (candidate) {
        const parentId = this.getParentResourceId(candidate)
        if (parentId && visibleIds.includes(parentId)) {
          fallback = parentId
          break
        }
        candidate = parentId ? previousResources.get(parentId) : undefined
      }
      this.activeResourceId = fallback ?? this.getHomeResource()?.id ?? null
    }
    if (hadFocus && this.activeResourceId) this.pendingFocusResourceId = this.activeResourceId
  }

  private getVisibleResources (): Resource[] {
    const home = this.getHomeResource()
    if (!home) return []
    const visible: Resource[] = [home]
    const addChildren = (resource: Resource) => {
      const expanded = resource.id === home.id ? this.homeExpanded : this.expandedContainers.has(resource.id)
      if (!resource.isContainer || !expanded) return
      const children = resource.id === home.id
        ? [...this.resources.values()]
        : [...getResourcesForContainer(resource.subject, this.resourceLogic).values()]
      for (const child of children) {
        visible.push(child)
        addChildren(child)
      }
    }
    addChildren(home)
    return visible
  }

  private getVisibleResourceIds () {
    return this.getVisibleResources().map(resource => resource.id)
  }

  private getParentResourceId (resource: Resource) {
    return resource.parentId ?? this.getHomeResource()?.id ?? null
  }

  private getFirstChildResource (resource: Resource) {
    if (!resource.isContainer) return null
    const children = resource.id === this.getHomeResource()?.id
      ? [...this.resources.values()]
      : [...getResourcesForContainer(resource.subject, this.resourceLogic).values()]
    return children[0] ?? null
  }

  private getNextVisibleResourceId (id: string) {
    const ids = this.getVisibleResourceIds()
    return ids[ids.indexOf(id) + 1] ?? null
  }

  private getPreviousVisibleResourceId (id: string) {
    const ids = this.getVisibleResourceIds()
    return ids[ids.indexOf(id) - 1] ?? null
  }

  private isTreeFocused () {
    const tree = this.renderRoot?.querySelector('[role="tree"]')
    const activeElement = (this.renderRoot as ShadowRoot)?.activeElement ?? document.activeElement
    return !!tree && (tree.contains(activeElement) || document.activeElement === this)
  }

  private async focusResource (id: string | null, scroll = true, fromTreeEvent = false) {
    if (!id || (!fromTreeEvent && !this.isTreeFocused())) return
    this.activeResourceId = id
    await this.updateComplete
    const item = Array.from(this.renderRoot.querySelectorAll<HTMLElement>('[role="treeitem"]'))
      .find(candidate => candidate.dataset.resourceId === id)
    if (!item?.isConnected) {
      this.pendingFocusResourceId = null
      return
    }
    if (!fromTreeEvent && !this.isTreeFocused()) return
    this.pendingFocusResourceId = id
    item.focus()
    this.pendingFocusResourceId = null
    if (scroll && typeof item.scrollIntoView === 'function') item.scrollIntoView({ block: 'nearest' })
  }

  private setActiveFromFocus (event: FocusEvent) {
    const item = (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]')
    if (this.pendingFocusResourceId && item?.dataset.resourceId !== this.pendingFocusResourceId) return
    if (item && (this.renderRoot as ShadowRoot)?.activeElement &&
      (this.renderRoot as ShadowRoot).activeElement !== item) return
    if (item?.dataset.resourceId) this.activeResourceId = item.dataset.resourceId
  }

  refreshResources (container?: NamedNode) {
    this.loadResources()
    if (!container || !this.subject || container.sameTerm(this.subject)) return

    const expanded = new Set(this.expandedContainers)
    let current = container
    while (!current.sameTerm(this.subject)) {
      expanded.add(current.value)
      const parent = current.dir()
      if (!parent || parent.sameTerm(current)) break
      current = parent
    }
    this.expandedContainers = expanded
  }

  private async toggleContainer (resource: Resource) {
    if (!resource.isContainer) return

    const generation = this.resourceGeneration
    const subject = this.subject
    const store = this.store
    const resourceLogic = this.resourceLogic
    const hadFocus = this.isTreeFocused()
    const nextExpandedContainers = new Set(this.expandedContainers)
    if (nextExpandedContainers.has(resource.id)) {
      nextExpandedContainers.delete(resource.id)
      this.expandedContainers = nextExpandedContainers
      return
    }

    const fetcher = this.store?.fetcher
    if (!fetcher) {
      this.reportExpansionError(resource)
      return
    }

    try {
      await fetcher.load(resource.subject)
    } catch (error) {
      if (generation !== this.resourceGeneration ||
        this.subject !== subject ||
        this.store !== store ||
        this.resourceLogic !== resourceLogic) return
      this.reportExpansionError(resource, error)
      return
    }

    if (generation !== this.resourceGeneration ||
      this.subject !== subject ||
      this.store !== store ||
      this.resourceLogic !== resourceLogic ||
      !this.getVisibleResources().some(candidate =>
        candidate.id === resource.id && candidate.subject.sameTerm(resource.subject))) return
    // Loading a container updates the RDF store asynchronously. Refresh the
    // root snapshot so a subsequent render sees the newly loaded members.
    if (this.store && this.subject) {
      this.resources = getResourcesForContainer(this.subject, this.resourceLogic)
    }
    this.expandedContainers = new Set(this.expandedContainers).add(resource.id)
    if (hadFocus && this.activeResourceId === resource.id && this.isTreeFocused()) {
      await this.updateComplete
      if (this.activeResourceId !== resource.id || !this.isTreeFocused()) return
      await this.focusResource(resource.id, false, true)
    }
  }

  private reportExpansionError (resource: Resource, error?: unknown) {
    if (error) debug.error('Unable to expand storage container', error)
    this.dispatchEvent(new CustomEvent('folder-pane-resource-error', {
      detail: {
        title: `Unable to load ${utils.label(resource.subject)}`,
        message: 'Try expanding the folder again.',
        retry: () => { void this.toggleContainer(resource) }
      },
      bubbles: true,
      composed: true
    }))
  }

  private isSelected (resource: Resource | null) {
    return resource ? this.selectedResource?.sameTerm(resource.subject) ?? false : false
  }

  private getHomeResource (): Resource | null {
    if (!this.subject) return null

    return {
      id: this.subject.value,
      subject: this.subject,
      parentId: null,
      isContainer: true,
    }
  }

  private selectResource (resource: Resource) {
    this.dispatchEvent(new CustomEvent('resource-selected', {
      detail: { resource: resource.subject },
      bubbles: true,
      composed: true,
    }))
  }

  private renderRow (
    resource: Resource,
    label: string,
    icon: unknown,
    expanded: boolean,
    toggle: () => void,
    special = false
  ) {
    const chevron = resource.isContainer
      ? html`
          <button
            class="resource-expand-button"
            type="button"
            tabindex="-1"
            aria-label=${expanded ? `Collapse ${label}` : `Expand ${label}`}
            @click=${(event: MouseEvent) => {
              event.preventDefault()
              event.stopPropagation()
              void this.focusResource(resource.id, false).then(toggle)
            }}
          >
            <icon-lucide-chevron-right></icon-lucide-chevron-right>
          </button>
        `
      : html`<span class="resource-expand-spacer" aria-hidden="true"></span>`

    return html`
      <div
        ${ref(element => this.makeResourceDraggable(element, resource))}
        class=${special ? 'resource-row resource-row-special' : 'resource-row'}
        @click=${() => this.selectResource(resource)}
      >
        ${chevron}
        ${icon}
        <span class="resource-label">${label}</span>
      </div>
    `
  }

  private renderItem (
    resource: Resource,
    label: string,
    icon: unknown,
    expanded: boolean,
    toggle: () => void,
    children: unknown,
    special = false
  ) {
    const selected = this.isSelected(resource)

    return html`
      <li
        class=${selected ? 'resource-item selected' : 'resource-item'}
        notSelectable="false"
        role="treeitem"
        tabindex=${this.activeResourceId === resource.id || this.activeResourceId === null && resource.id === this.getHomeResource()?.id ? '0' : '-1'}
        data-resource-id=${resource.id}
        aria-label=${label}
        aria-selected=${String(selected)}
        aria-expanded=${resource.isContainer ? String(expanded) : nothing}
        data-expanded=${String(expanded)}
        about=${resource.subject.toNT()}
        .subject=${resource.subject}
        @focusin=${this.setActiveFromFocus}
        @keydown=${(event: KeyboardEvent) => this.handleKeydown(event, resource, expanded, toggle)}
      >
        ${this.renderRow(resource, label, icon, expanded, toggle, special)}
        ${expanded ? children : nothing}
      </li>
    `
  }

  private handleKeydown (event: KeyboardEvent, resource: Resource, expanded: boolean, toggle: () => void) {
    if ((event.target as HTMLElement).closest('[role="treeitem"]') !== event.currentTarget) return
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'ArrowRight', 'ArrowLeft', 'Enter', ' '].includes(event.key)) return
    event.stopPropagation()
    // Keep the navigation origin current even when focusin was not emitted
    // (for example, repeated key events on the same DOM node).
    const currentId = (event.currentTarget as HTMLElement).dataset.resourceId ?? resource.id
    const currentResource = this.getVisibleResources().find(candidate => candidate.id === currentId)
    if (currentResource) {
      resource = currentResource
      expanded = resource.id === this.getHomeResource()?.id
        ? this.homeExpanded
        : this.expandedContainers.has(resource.id)
      toggle = () => {
        if (resource.id === this.getHomeResource()?.id) this.homeExpanded = !this.homeExpanded
        else void this.toggleContainer(resource)
      }
    }
    this.activeResourceId = currentId
    const focus = (id: string | null) => {
      if (id) {
        event.preventDefault()
        this.activeResourceId = id
        void this.focusResource(id, true, true)
      }
    }
    switch (event.key) {
      case 'ArrowDown':
        focus(this.getNextVisibleResourceId(resource.id))
        break
      case 'ArrowUp':
        focus(this.getPreviousVisibleResourceId(resource.id))
        break
      case 'Home':
        focus(this.getVisibleResourceIds()[0] ?? null)
        break
      case 'End':
        focus(this.getVisibleResourceIds().slice(-1)[0] ?? null)
        break
      case 'ArrowRight':
        if (!resource.isContainer) break
        if (!expanded) {
          event.preventDefault()
          void toggle()
        } else {
          focus(this.getFirstChildResource(resource)?.id ?? null)
        }
        break
      case 'ArrowLeft': {
        if (resource.isContainer && expanded) {
          event.preventDefault()
          void this.focusResource(resource.id, false, true).then(toggle)
        } else {
          focus(this.getParentResourceId(resource))
        }
        break
      }
      case 'Enter':
      case ' ':
        event.preventDefault()
        this.selectResource(resource)
        break
    }
  }

  private renderSpecialIcon (icon: SpecialIcon) {
    return html`<icon-lucide-folder></icon-lucide-folder>`
  }

  private renderResourceItem (resource: Resource, label = utils.label(resource.subject), specialIcon?: SpecialIcon) {
    const expanded = this.expandedContainers.has(resource.id)
    const children = resource.isContainer && expanded
      ? this.renderResourceGroup(getResourcesForContainer(resource.subject, this.resourceLogic))
      : nothing
    const icon = specialIcon
      ? this.renderSpecialIcon(specialIcon)
      : html`<icon-lucide-circle-small></icon-lucide-circle-small>`

    return this.renderItem(
      resource,
      label,
      icon,
      expanded,
      () => { void this.toggleContainer(resource) },
      children,
      Boolean(specialIcon)
    )
  }

  private renderResourceGroup (resources: ResourceMap | Resource[]) {
    const list = Array.isArray(resources) ? resources : [...resources.values()]
    if (list.length === 0) return nothing

    return html`
      <ul role="group" class="resource-group">
        ${repeat(list, (resource) => resource.id, (resource) => this.renderResourceItem(resource))}
      </ul>
    `
  }

  private renderTree () {
    const homeResource = this.getHomeResource()
    if (!homeResource) return nothing

    const orderedResources = [...this.resources.values()]

    return html`
      <ul role="tree" class="resource-tree" aria-label="Storage resources">
        ${this.renderItem(
          homeResource,
          'Home',
          this.renderSpecialIcon('folder'),
          this.homeExpanded,
          () => { this.homeExpanded = !this.homeExpanded },
          this.renderResourceGroup(orderedResources),
          true
        )}
      </ul>
    `
  }

  protected willUpdate (changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties)
    if (this.pendingFocusResourceId && !this.isTreeFocused()) {
      this.pendingFocusResourceId = null
    }
    if (changedProperties.has('subject')) {
      const hadFocus = this.isTreeFocused()
      this.focusHomeOnUpdate = !!this.subject &&
        (hadFocus || changedProperties.get('subject') === undefined)
      this.expandedContainers = new Set()
      this.homeExpanded = true
      this.activeResourceId = this.subject?.value ?? null
    }
    if (
      changedProperties.has('store') ||
      changedProperties.has('subject') ||
      changedProperties.has('resourceLogic')
    ) {
      this.loadResources()
    }
  }

  protected updated (changedProperties: PropertyValues<this>) {
    super.updated(changedProperties)
    if (this.focusHomeOnUpdate) {
      const home = this.renderRoot.querySelector<HTMLElement>('[role="treeitem"]')
      if (home) {
        this.focusHomeOnUpdate = false
        home.focus()
        this.pendingFocusResourceId = null
      }
      return
    }
    if (this.pendingFocusResourceId) {
      const item = Array.from(this.renderRoot.querySelectorAll<HTMLElement>('[role="treeitem"]'))
        .find(candidate => candidate.dataset.resourceId === this.pendingFocusResourceId)
      if (item?.isConnected) item.focus()
      this.pendingFocusResourceId = null
    }
  }

  render () {
    return html`
      <aside>
        ${keyed(this.subject?.value, this.renderTree())}
      </aside>
    `
  }
}
