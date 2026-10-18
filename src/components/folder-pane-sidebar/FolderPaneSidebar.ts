import { customElement, utils, WebComponent } from 'solid-ui'
import { html, nothing } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { property, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import styles from './FolderPaneSidebar.styles.css'
import type { LiveStore, NamedNode } from 'rdflib'
import type { Resource, ResourceMap } from '../../types'
import '~icons/lucide/chevron-right'
import '~icons/lucide/circle-small'
import '~icons/lucide/folder'
import '~icons/lucide/globe'
import '~icons/lucide/trash-2'
import { getResourcesForContainer, type FolderPaneResourceLogic } from '../../helpers'

type SpecialIcon = 'folder' | 'globe' | 'trash'

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

  private loadResources () {
    if (!this.store || !this.subject) return

    this.resources = getResourcesForContainer(this.subject, this.resourceLogic)
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

    const nextExpandedContainers = new Set(this.expandedContainers)
    if (nextExpandedContainers.has(resource.id)) {
      nextExpandedContainers.delete(resource.id)
      this.expandedContainers = nextExpandedContainers
      return
    }

    try {
      await this.store?.fetcher?.load(resource.subject)
    } catch (error) {
      console.error('Unable to expand storage container', error)
      return
    }

    nextExpandedContainers.add(resource.id)
    this.expandedContainers = nextExpandedContainers
  }

  private isSelected (resource: Resource | null) {
    return resource ? this.selectedResource?.sameTerm(resource.subject) ?? false : false
  }

  private isNamed (resource: Resource, name: string) {
    return utils.label(resource.subject).toLowerCase() === name
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
              toggle()
            }}
          >
            <icon-lucide-chevron-right></icon-lucide-chevron-right>
          </button>
        `
      : html`<span class="resource-expand-spacer" aria-hidden="true"></span>`

    return html`
      <div
        class=${special ? 'resource-row resource-row-special' : 'resource-row'}
        tabindex="0"
        @click=${() => this.selectResource(resource)}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            this.selectResource(resource)
          } else if (resource.isContainer && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
            const shouldExpand = event.key === 'ArrowRight'
            if (shouldExpand !== expanded) {
              event.preventDefault()
              toggle()
            }
          }
        }}
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
        aria-label=${label}
        aria-selected=${String(selected)}
        aria-expanded=${resource.isContainer ? String(expanded) : nothing}
        data-expanded=${String(expanded)}
        about=${resource.subject.toNT()}
        .subject=${resource.subject}
      >
        ${this.renderRow(resource, label, icon, expanded, toggle, special)}
        ${expanded ? children : nothing}
      </li>
    `
  }

  private renderSpecialIcon (icon: SpecialIcon) {
    if (icon === 'globe') return html`<icon-lucide-globe></icon-lucide-globe>`
    if (icon === 'trash') return html`<icon-lucide-trash-2></icon-lucide-trash-2>`
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
    const takeNamed = (name: string) => {
      const index = orderedResources.findIndex(resource => this.isNamed(resource, name))
      return index >= 0 ? orderedResources.splice(index, 1)[0] : null
    }
    const publicResource = takeNamed('public')
    const trashResource = takeNamed('trash')

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
        ${publicResource ? this.renderResourceItem(publicResource, 'Public', 'globe') : nothing}
        ${trashResource ? this.renderResourceItem(trashResource, 'Trash', 'trash') : nothing}
      </ul>
    `
  }

  protected willUpdate (changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties)
    if (changedProperties.has('subject')) {
      this.expandedContainers = new Set()
      this.homeExpanded = true
    }
    if (
      changedProperties.has('store') ||
      changedProperties.has('subject') ||
      changedProperties.has('resourceLogic')
    ) {
      this.loadResources()
    }
  }

  render () {
    return html`
      <aside>
        ${this.renderTree()}
      </aside>
    `
  }
}
