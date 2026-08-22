import { customElement, utils, WebComponent, ns } from 'solid-ui'
import { html } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { property, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import styles from './StorageResourceSidebar.styles.css'
import { NamedNode } from 'rdflib'
import type { ResourceMap, SelectableResourceItem } from '../../types'
import '~icons/lucide/chevron-right'
import { noHiddenFiles } from '../../helpers'

type VisibleResource = {
  resource: SelectableResourceItem
  depth: number
}

@customElement('storage-resource-sidebar')
export default class StorageResourceSidebar extends WebComponent {
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
  
  private getResourcesForContainer (container: NamedNode): ResourceMap{
    if (!this.store) return new Map()
    let containedResources = this.store.each(container, ns.ldp('contains')).filter(noHiddenFiles)
    // on the main page for localhost:3100 i was getting duplicates
    // when i viewed one of the storages though it was fine.
    containedResources = containedResources.filter((containedResource, index, allContainedResources) => {
      return allContainedResources.findIndex(other => other.sameTerm(containedResource)) === index
    })
    containedResources = containedResources.map(containedResource => [utils.label(containedResource).toLowerCase(), containedResource])
    containedResources.sort() // Sort by label case-insensitive
    return new Map(containedResources.map(pair => [pair[1].value, {
      id: pair[1].value,
      subject: pair[1],
      parentId: container.value,
      isContainer: this.resourceLogic?.isContainer?.(pair[1]) ?? false
    }]))
  }

  private loadResources () {
    if (!this.store || !this.subject) return

    this.expandedContainers = new Set()
    this.resources = this.getResourcesForContainer(this.subject)
  }

  private getVisibleResources (): VisibleResource[] {
    const visibleResources: VisibleResource[] = []

    const appendResources = (resources: ResourceMap, depth: number) => {
      for (const resource of resources.values()) {
        visibleResources.push({ resource, depth })

        if (resource.isContainer && this.expandedContainers.has(resource.id)) {
          appendResources(this.getResourcesForContainer(resource.subject), depth + 1)
        }
      }
    }

    appendResources(this.resources, 0)
    return visibleResources
  }

  private async expandContainer (resource: SelectableResourceItem, event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (!resource.isContainer) {
      return
    }

    if (this.store?.fetcher?.load) {
      await this.store.fetcher.load(resource.subject)
    }

    const nextExpandedContainers = new Set(this.expandedContainers)
    if (nextExpandedContainers.has(resource.id)) {
      nextExpandedContainers.delete(resource.id)
    } else {
      nextExpandedContainers.add(resource.id)
    }

    this.expandedContainers = nextExpandedContainers
  }

  private isSelectedResource (resource: SelectableResourceItem) {
    return this.selectedResource?.sameTerm(resource.subject) ?? false
  }

  private selectResource (resource: SelectableResourceItem) {
    this.selectedResource = resource.subject
    this.dispatchEvent(new CustomEvent('resource-selected', {
      detail: { resource: resource.subject },
      bubbles: true,
      composed: true,
    }))
  }

  private renderResourceItem (resource: SelectableResourceItem, depth: number) {
    const selected = this.isSelectedResource(resource)
    const isExpanded = this.expandedContainers.has(resource.id)

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
        .tabulatorSelect=${() => this.selectResource(resource)}
        .tabulatorDeselect=${() => {
          if (this.isSelectedResource(resource)) {
            this.selectedResource = undefined
          }
        }}
        @click=${() => this.selectResource(resource)}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            this.selectResource(resource)
          }
        }}
      >
        <icon-lucide-chevron-right 
          @click=${(event: MouseEvent) => this.expandContainer(resource, event)}>
        </icon-lucide-chevron-right>
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
