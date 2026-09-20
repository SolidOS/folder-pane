import { customElement, DEFAULT_STORE, FileExplorerContext, fileExplorerContext, storeContext, utils, WebComponent } from 'solid-ui'
import { html, nothing } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { property, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import styles from './StorageResourceSidebar.styles.css'
import type { NamedNode } from 'rdflib'
import type { Resource, ResourceMap } from '../../types'
import '~icons/lucide/chevron-right'
import '~icons/lucide/folder'
import '~icons/lucide/globe'
import '~icons/lucide/circle-small'
import '../storage-creation-area'
import { consume } from '@lit/context'
import { DEFAULT_STORAGE_CONTEXT, StorageContext, storageContext } from '../storage-provider/context'
import { LiveStore } from 'rdflib'
import { getResourcesForContainer, handleContainerDragOver, handleContainerDrop, loadResourcesForContainer } from '../../helpers'
import '~icons/lucide/trash-2'

@customElement('storage-resource-sidebar')
export default class StorageResourceSidebar extends WebComponent {
  static styles = styles

  @property({ attribute: false })
  accessor dom: HTMLDocument | null = null

  @consume({ context: storeContext, subscribe: true })
  accessor store: LiveStore = DEFAULT_STORE

  @consume({ context: fileExplorerContext, subscribe: true })
  accessor fileExplorerContext: FileExplorerContext = undefined as unknown as FileExplorerContext

  @consume({ context: storageContext, subscribe: true })
  accessor storageContext: StorageContext = DEFAULT_STORAGE_CONTEXT

  @state()
  accessor resources: ResourceMap = new Map()

  @state()
  accessor expandedContainers: Set<string> = new Set()

  @state()
  accessor homeExpanded = true

  private get currentSubject (): NamedNode | undefined {
    if (!this.fileExplorerContext?.subjectUri || this.store === DEFAULT_STORE) {
      return undefined
    }

    return this.store.sym(this.fileExplorerContext.subjectUri)
  }

  private get currentSelectedResource (): NamedNode | undefined {
    return this.storageContext.selectedResource ?? this.currentSubject
  }

  private syncResources = async () => {
    const subject = this.currentSubject

    if (!this.store || !subject) {
      return
    }

    const loadedResources = await loadResourcesForContainer(this.store, subject)
    this.resources = loadedResources
  }

  refresh () {
    void this.syncResources()
  }

  protected firstUpdated () {
    void this.syncResources()
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
    return this.currentSelectedResource?.sameTerm(resource.subject) ?? false
  }

  private isPublicResource (resource: Resource) {
    return utils.label(resource.subject).toLowerCase() === 'public'
  }

  private isTrashResource (resource: Resource) {
    return utils.label(resource.subject).toLowerCase() === 'trash'
  }

  private getHomeResource (): Resource | null {
    const subject = this.currentSubject

    if (!subject) {
      return null
    }

    return {
      id: subject.value,
      subject,
      parentId: null,
      isContainer: true,
    }
  }

  private renderSpecialRootItem (
    label: string,
    icon: 'folder' | 'globe' | 'trash',
    selected: boolean,
    expanded: boolean,
    selectItem: () => void,
    toggleExpanded: () => void,
    children: unknown,
    resource: Resource | null,
  ) {
    return html`
      <li
        class=${selected ? 'resource-item selected' : 'resource-item'}
        notSelectable="false"
        role="treeitem"
        aria-selected=${String(selected)}
        aria-expanded=${String(expanded)}
        data-expanded=${String(expanded)}
        @dragover=${resource ? (event: DragEvent) => this.onContainerDragOver(resource, event) : undefined}
        @drop=${resource ? (event: DragEvent) => this.onContainerDrop(resource, event) : undefined}
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
          ${icon === 'folder'
            ? html`<icon-lucide-folder></icon-lucide-folder>`
            : icon === 'globe'
              ? html`<icon-lucide-globe></icon-lucide-globe>`
              : html`<icon-lucide-trash-2></icon-lucide-trash-2>`}
          ${label}
        </div>
        ${expanded ? children : nothing}
      </li>
    `
  }

  private renderTrashResource (resource: Resource) {
    const selected = this.isSelectedResource(resource)
    const isExpanded = this.expandedContainers.has(resource.id)
    const children = resource.isContainer && isExpanded
      ? getResourcesForContainer(this.store, resource.subject)
      : null

    return html`
      <li
        class=${selected ? 'resource-item selected' : 'resource-item'}
        notSelectable="false"
        role="treeitem"
        aria-selected=${String(selected)}
        aria-expanded=${resource.isContainer ? String(isExpanded) : nothing}
        data-expanded=${String(isExpanded)}
        about=${resource.subject.toNT()}
        .subject=${resource.subject}
        @dragover=${(event: DragEvent) => this.onContainerDragOver(resource, event)}
        @drop=${(event: DragEvent) => this.onContainerDrop(resource, event)}
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
          <icon-lucide-trash-2></icon-lucide-trash-2>
          Trash
        </div>
        ${children ? this.renderResourceGroup(children, false) : nothing}
      </li>
    `
  }

  private renderPublicResource (resource: Resource) {
    const selected = this.isSelectedResource(resource)
    const isExpanded = this.expandedContainers.has(resource.id)
    const children = resource.isContainer && isExpanded
      ? getResourcesForContainer(this.store, resource.subject)
      : null

    return html`
      <li
        class=${selected ? 'resource-item selected' : 'resource-item'}
        notSelectable="false"
        role="treeitem"
        aria-selected=${String(selected)}
        aria-expanded=${resource.isContainer ? String(isExpanded) : nothing}
        data-expanded=${String(isExpanded)}
        about=${resource.subject.toNT()}
        .subject=${resource.subject}
        @dragover=${(event: DragEvent) => this.onContainerDragOver(resource, event)}
        @drop=${(event: DragEvent) => this.onContainerDrop(resource, event)}
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
    this.storageContext.selectResource(resource.subject)
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

    const handled = handleContainerDrop(event, this.store, resource.subject, () => { void this.syncResources() })

    if (handled) {
      this.selectResource(resource)
    }
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
    const trashResourceIndex = isRoot
      ? orderedResources.findIndex((resource) => this.isTrashResource(resource))
      : -1
    const trashResource = trashResourceIndex >= 0
      ? orderedResources.splice(trashResourceIndex, 1)[0]
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
            this.homeExpanded ? this.renderResourceGroupFromList(orderedResources, false) : nothing,
            homeResource
          )
          : repeat(
            orderedResources,
            (resource) => resource.id,
            (resource) => this.renderResourceItem(resource)
          )}
        ${isRoot && publicResource ? this.renderPublicResource(publicResource) : nothing}
        ${isRoot && trashResource ? this.renderTrashResource(trashResource) : nothing}
      </ul>
    `
  }

  private renderResourceItem (resource: Resource) {
    const selected = this.isSelectedResource(resource)
    const isExpanded = this.expandedContainers.has(resource.id)
    const children = resource.isContainer && isExpanded
      ? getResourcesForContainer(this.store, resource.subject)
      : null

    return html`
      <li
        class=${selected ? 'resource-item selected' : 'resource-item'}
        notSelectable="false"
        role="treeitem"
        aria-selected=${String(selected)}
        aria-expanded=${resource.isContainer ? String(isExpanded) : nothing}
        data-expanded=${String(isExpanded)}
        about=${resource.subject.toNT()}
        .subject=${resource.subject}
        @dragover=${(event: DragEvent) => this.onContainerDragOver(resource, event)}
        @drop=${(event: DragEvent) => this.onContainerDrop(resource, event)}
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
            @click=${(event: MouseEvent) => this.expandContainer(resource, event)}
          ></icon-lucide-chevron-right>
          <icon-lucide-circle-small></icon-lucide-circle-small>
          ${utils.label(resource.subject)}
        </div>
        ${children ? this.renderResourceGroup(children, false) : nothing}
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
      changedProperties.has('fileExplorerContext') ||
      resourceRevisionChanged
    ) {
      void this.syncResources()
    }
  }

  render () {
    return html`
      <aside>
        ${this.renderResourceGroup(this.resources, true)}
      </aside>
      <storage-creation-area
        .subject=${this.currentSubject}
        @resource-created=${this.syncResources}
      ></storage-creation-area>
    `
  }
}
