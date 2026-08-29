import { customElement, utils, WebComponent } from 'solid-ui'
import { html, nothing } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { property, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import styles from './StorageResourceSidebar.styles.css'
import type { LiveStore, NamedNode } from 'rdflib'
import type { SolidLogic } from 'solid-logic'
import type { Resource, ResourceMap } from '../../types'
import '~icons/lucide/chevron-right'
import '~icons/lucide/folder'
import '~icons/lucide/globe'
import '~icons/lucide/circle-small'
import { getResourcesForContainer } from '../../helpers'
import '../storage-creation-area'

@customElement('storage-resource-sidebar')
export default class StorageResourceSidebar extends WebComponent {
  static styles = styles

  @property({ attribute: false })
  accessor dom: HTMLDocument | null = null

  @property({ attribute: false })
  accessor store: LiveStore | null = null

  @property({ attribute: false })
  accessor subject: NamedNode | null = null

  @property({ attribute: false })
  accessor resourceLogic: Pick<SolidLogic['resource'], 'isContainer'> | null = null

  @state()
  accessor resources: ResourceMap = new Map()

  @state()
  accessor expandedContainers: Set<string> = new Set()

  @state()
  accessor homeExpanded = false

  @state()
  accessor selectedResource: NamedNode | undefined = undefined

  private syncResources () {
    if (!this.store || !this.subject) return

    this.resources = getResourcesForContainer(this.store, this.subject, this.resourceLogic)
  }

  private async expandContainer (resource: Resource, event: MouseEvent) {
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

  private isSelectedResource (resource: Resource) {
    return this.selectedResource?.sameTerm(resource.subject) ?? false
  }

  private isPublicResource (resource: Resource) {
    return utils.label(resource.subject).toLowerCase() === 'public'
  }

  private getHomeResource (): Resource | null {
    if (!this.subject) {
      return null
    }

    return {
      id: this.subject.value,
      subject: this.subject,
      parentId: null,
      isContainer: true,
    }
  }

  private renderSpecialRootItem (
    label: string,
    icon: 'folder' | 'globe',
    selected: boolean,
    expanded: boolean,
    selectItem: () => void,
    toggleExpanded: () => void,
    children: unknown,
  ) {
    return html`
      <li
        class=${selected ? 'obj selected' : 'obj'}
        notSelectable="false"
        role="treeitem"
        aria-selected=${String(selected)}
        aria-expanded=${String(expanded)}
        data-expanded=${String(expanded)}
      >
        <div
          class="resource-row resource-row-special"
          tabindex="0"
          @click=${selectItem}
          @keydown=${(event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              selectItem()
            }
          }}
        >
          <icon-lucide-chevron-right
            @click=${(event: MouseEvent) => {
              event.preventDefault()
              event.stopPropagation()
              toggleExpanded()
            }}
          ></icon-lucide-chevron-right>
          ${icon === 'folder' ? html`<icon-lucide-folder></icon-lucide-folder>` : html`<icon-lucide-globe></icon-lucide-globe>`}
          ${label}
        </div>
        ${expanded ? children : nothing}
      </li>
    `
  }

  private renderPublicResource (resource: Resource) {
    const selected = this.isSelectedResource(resource)
    const isExpanded = this.expandedContainers.has(resource.id)
    const children = resource.isContainer && isExpanded
      ? getResourcesForContainer(this.store, resource.subject, this.resourceLogic)
      : null

    return html`
      <li
        class=${selected ? 'obj selected' : 'obj'}
        notSelectable="false"
        role="treeitem"
        aria-selected=${String(selected)}
        aria-expanded=${resource.isContainer ? String(isExpanded) : nothing}
        data-expanded=${String(isExpanded)}
        about=${resource.subject.toNT()}
        .subject=${resource.subject}
      >
        <div
          class="resource-row resource-row-special"
          tabindex="0"
          @click=${() => this.selectResource(resource)}
          @keydown=${(event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              this.selectResource(resource)
            }
          }}
        >
          <icon-lucide-chevron-right
            @click=${(event: MouseEvent) => this.expandContainer(resource, event)}
          ></icon-lucide-chevron-right>
          <icon-lucide-globe></icon-lucide-globe>
          Public
        </div>
        ${children ? this.renderResourceGroup(children, false) : nothing}
      </li>
    `
  }

  private selectResource (resource: Resource) {
    this.selectedResource = resource.subject
    this.dispatchEvent(new CustomEvent('resource-selected', {
      detail: { resource: resource.subject },
      bubbles: true,
      composed: true,
    }))
  }

  private renderResourceGroup (resources: ResourceMap, isRoot: boolean) {
    return this.renderResourceGroupFromList([...resources.values()], isRoot)
  }

  private renderResourceGroupFromList (resources: Resource[], isRoot: boolean) {
    const orderedResources = [...resources]
    const publicResourceIndex = isRoot
      ? orderedResources.findIndex((resource) => this.isPublicResource(resource))
      : -1
    const publicResource = publicResourceIndex >= 0
      ? orderedResources.splice(publicResourceIndex, 1)[0]
      : null
    const homeResource = this.getHomeResource()

    return html`
      <ul role=${isRoot ? 'tree' : 'group'} class=${isRoot ? 'resource-tree' : 'resource-group'}>
        ${isRoot
          ? this.renderSpecialRootItem(
            'Home',
            'folder',
            homeResource ? this.isSelectedResource(homeResource) : false,
            this.homeExpanded,
            () => {
              if (homeResource) {
                this.selectResource(homeResource)
              }
            },
            () => { this.homeExpanded = !this.homeExpanded },
            this.homeExpanded ? this.renderResourceGroupFromList(orderedResources, false) : nothing
          )
          : repeat(
            orderedResources,
            (resource) => resource.id,
            (resource) => this.renderResourceItem(resource)
          )}
        ${isRoot && publicResource ? this.renderPublicResource(publicResource) : nothing}
      </ul>
    `
  }

  private renderResourceItem (resource: Resource) {
    const selected = this.isSelectedResource(resource)
    const isExpanded = this.expandedContainers.has(resource.id)
    const children = resource.isContainer && isExpanded
      ? getResourcesForContainer(this.store, resource.subject, this.resourceLogic)
      : null

    return html`
      <li
        class=${selected ? 'obj selected' : 'obj'}
        notSelectable="false"
        role="treeitem"
        aria-selected=${String(selected)}
        aria-expanded=${resource.isContainer ? String(isExpanded) : nothing}
        data-expanded=${String(isExpanded)}
        about=${resource.subject.toNT()}
        .subject=${resource.subject}
      >
        <div
          class="resource-row"
          tabindex="0"
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
          <icon-lucide-circle-small></icon-lucide-circle-small>
          ${utils.label(resource.subject)}
        </div>
        ${children ? this.renderResourceGroup(children, false) : nothing}
      </li>
    `
  }

  protected willUpdate (changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties)
    if (
      changedProperties.has('store') ||
      changedProperties.has('subject') ||
      changedProperties.has('resourceLogic')
    ) {
      this.expandedContainers = new Set()
      this.homeExpanded = true
      this.selectedResource = this.subject ?? undefined
      this.syncResources()
    }
  }

  render () {
    return html`
      <aside>
        ${this.renderResourceGroup(this.resources, true)}
        <storage-creation-area
          .store=${this.store}
          .subject=${this.subject}
          @resource-created=${this.syncResources}
        ></storage-creation-area>
      </aside>
    `
  }
}
