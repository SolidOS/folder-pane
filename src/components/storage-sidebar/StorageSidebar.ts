import { customElement, utils, WebComponent } from 'solid-ui'
import { html } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { property, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import styles from './StorageSidebar.styles.css'
import { NamedNode } from 'rdflib'
import type { Resource, ResourceMap } from '../../types'
import '~icons/lucide/chevron-right'
import { getResourcesForContainer } from '../../helpers'

type VisibleResource = {
  resource: Resource
  depth: number
}

@customElement('storage-sidebar')
export default class StorageSidebar extends WebComponent {
  static styles = styles

  @property({ attribute: false })
  accessor dom: HTMLDocument | null = null

  @property({ attribute: false })
  accessor store: any = null

  @property({ attribute: false })
  accessor subject: any = null

  @property({ attribute: false })
  accessor resourceLogic: any = null

  @state()
  accessor resources: ResourceMap = new Map()

  @state()
  accessor expandedContainers: Set<string> = new Set()

  @state()
  accessor selectedResource: NamedNode | undefined = undefined

  private loadResources () {
    if (!this.store || !this.subject) return

    this.expandedContainers = new Set()
    this.resources = getResourcesForContainer(this.store, this.subject, this.resourceLogic)
  }

  private getVisibleResources (): VisibleResource[] {
    const visibleResources: VisibleResource[] = []

    const appendResources = (resources: ResourceMap, depth: number) => {
      for (const resource of resources.values()) {
        visibleResources.push({ resource, depth })

        if (resource.isContainer && this.expandedContainers.has(resource.id)) {
          appendResources(getResourcesForContainer(this.store, resource.subject, this.resourceLogic), depth + 1)
        }
      }
    }

    appendResources(this.resources, 0)
    return visibleResources
  }

  private async expandContainer (resource: Resource, event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (!resource.isContainer) {
      return
    }

    const nextExpandedContainers = new Set(this.expandedContainers)

    if (nextExpandedContainers.has(resource.id)) {
      nextExpandedContainers.delete(resource.id)
      this.expandedContainers = nextExpandedContainers
      return
    }

    if (this.store?.fetcher?.load) {
      try {
        await this.store.fetcher.load(resource.subject)
      } catch (e) {
        // will handle error handling later
        return
       }
    }

    nextExpandedContainers.add(resource.id)
    this.expandedContainers = nextExpandedContainers
  }

  private handleExpandClick (resource: Resource, event: MouseEvent) {
    void this.expandContainer(resource, event)
  }

  private isSelectedResource (resource: Resource) {
    return this.selectedResource?.sameTerm(resource.subject) ?? false
  }

  private selectResource (resource: Resource) {
    this.selectedResource = resource.subject
    this.dispatchEvent(new CustomEvent('resource-selected', {
      detail: { resource: resource.subject },
      bubbles: true,
      composed: true,
    }))
  }

  private renderResourceItem (resource: Resource, depth: number) {
    const selected = this.isSelectedResource(resource)
    const isExpanded = this.expandedContainers.has(resource.id)
    const expandControl = resource.isContainer
      ? html`
          <button
            class="storage-sidebar-expand-button"
            type="button"
            aria-label=${isExpanded ? 'Collapse container' : 'Expand container'}
            aria-expanded=${String(isExpanded)}
            @click=${(event: MouseEvent) => this.handleExpandClick(resource, event)}
          >
            <icon-lucide-chevron-right></icon-lucide-chevron-right>
          </button>
        `
      : html`
          <span class="storage-sidebar-expand-spacer" aria-hidden="true">
            <icon-lucide-chevron-right></icon-lucide-chevron-right>
          </span>
        `

    return html`
      <li
        class=${selected ? 'obj selected' : 'obj'}
        notSelectable="false"
        aria-selected=${String(selected)}
        data-expanded=${String(isExpanded)}
        style=${`padding-left: ${depth * 1.25}rem`}
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
        ${expandControl}
        ${utils.label(resource.subject)}
      </li>
    `
  }

  protected updated (changedProperties: PropertyValues<this>) {
    super.updated(changedProperties)
  }

  protected willUpdate (changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties)
    if (
      changedProperties.has('store') ||
      changedProperties.has('subject') ||
      changedProperties.has('resourceLogic')
    ) {
      this.loadResources()
    }
  }

  render () {
    const visibleResources = this.getVisibleResources()

    return html`
      <aside>
        <ul role="listbox">
          ${repeat(visibleResources, (item) => item.resource.id, (item) => this.renderResourceItem(item.resource, item.depth))}
        </ul>
      </aside>
    `
  }
}
