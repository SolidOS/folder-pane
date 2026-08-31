import { html, nothing } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import '../storage-header'
import '../storage-content-view'
import '../storage-creation-area'
import type { NamedNode } from 'rdflib'
import { solidLogicSingleton } from 'solid-logic'
import { customElement, log, utils, WebComponent } from 'solid-ui'
import { Resource, StoragePaneOutliner } from '../../types'
import { getResourcesForContainer, loadResourcesForContainer, renderSelectedResourceInContentView } from '../../helpers'
import styles from './StorageContainerPane.styles.css'
import '~icons/lucide/folder'
import '~icons/lucide/file'
import '~icons/lucide/globe'
import '~icons/lucide/lock-keyhole'

/* think i'm going to need to move the web component for the 3 dots to solid-ui 
because i need it here too */
import '~icons/lucide/ellipsis-vertical'

@customElement('storage-container-pane')
export default class StorageContainerPane extends WebComponent {
  static styles = styles

  @property({ attribute: false })
  accessor outliner: StoragePaneOutliner | undefined = undefined

  @property({ attribute: false })
  accessor store: any = null

  @property({ attribute: false })
  accessor subject: NamedNode | undefined = undefined

  @property({ attribute: false })
  accessor view: 'grid' | 'list' = 'grid'

  @state()
  accessor selectedResource: NamedNode | undefined = undefined

  @state()
  accessor resources = getResourcesForContainer(this.store, this.subject!)

  @state()
  accessor resourceVisibility: Map<string, boolean> = new Map()

  private resourceVisibilityLoading = new Set<string>()

  @query('storage-content-view')
  private accessor contentView: HTMLElement | null = null

  protected createRenderRoot() {
    return this
  }

  private ensureResourceVisibility (resource: Resource) {
    if (this.resourceVisibility.has(resource.id) || this.resourceVisibilityLoading.has(resource.id)) {
      return
    }

    this.resourceVisibilityLoading.add(resource.id)

    void solidLogicSingleton.resource.fetchMetadata(resource.subject)
      .then((metadata) => {
        this.resourceVisibility = new Map(this.resourceVisibility).set(resource.id, metadata.access.isPublic)
      })
      .catch(() => {
        // Unknown visibility stays unknown; render nothing.
      })
      .finally(() => {
        this.resourceVisibilityLoading.delete(resource.id)
      })
  }

  private async syncResources () {
    if (!this.store || !this.subject) return

    this.resources = await loadResourcesForContainer(this.store, this.subject)
    for (const resource of this.resources.values()) {
      this.ensureResourceVisibility(resource)
    }
  }

  private selectResource (resource: Resource) {
    this.selectedResource = resource.subject
    this.dispatchEvent(new CustomEvent('resource-selected', {
      detail: { resource: resource.subject },
      bubbles: true,
      composed: true,
    }))
  }

  private renderContainerPane (selectedResource: NamedNode) {
    if (!this.contentView) return

    const containerPane = document.createElement('storage-container-pane') as HTMLElement & {
      outliner?: StoragePaneOutliner
      store?: any
      subject?: NamedNode
    }

    containerPane.outliner = this.outliner
    containerPane.store = this.store
    containerPane.subject = selectedResource

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

  private renderResourceGridItem (resource: Resource, depth: number) {
    const selected = this.isSelectedResource(resource)
    const { isContainer, getContainerMemberCount } = solidLogicSingleton.resource
    this.ensureResourceVisibility(resource)
    const isPublic = this.resourceVisibility.get(resource.id)

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
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            this.selectResource(resource)
          }
        }}
      >
        <span class="resource-grid-icon">
          ${isContainer(resource.subject) ? html`<icon-lucide-folder></icon-lucide-folder>` : html`<icon-lucide-file></icon-lucide-file>`}</span>
        </span>
        <span class="resource-grid-label">${utils.label(resource.subject)}</span>
        <div class="resource-grid-item-footer">
          ${isContainer(resource.subject) ? html`<span class="container-member-count">${getContainerMemberCount(resource.subject)} items</span>` : nothing}
          ${isPublic === undefined ? nothing : isPublic ? html`<icon-lucide-globe></icon-lucide-globe>` : html`<icon-lucide-lock-keyhole></icon-lucide-lock-keyhole>`}
        </div>
      </li>
    `
  }

  private renderResourceListItem (resource: Resource, depth: number) {
    const selected = this.isSelectedResource(resource)
    const { isContainer, getContainerMemberCount } = solidLogicSingleton.resource
    this.ensureResourceVisibility(resource)
    const isPublic = this.resourceVisibility.get(resource.id)

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
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            this.selectResource(resource)
          }
        }}
      >
        ${isContainer(resource.subject) ? html`<icon-lucide-folder></icon-lucide-folder>` : html`<icon-lucide-file></icon-lucide-file>`}
        <span class="resource-list-label">${utils.label(resource.subject)}</span>
        ${isContainer(resource.subject) ? html`<span class="container-member-count">${getContainerMemberCount(resource.subject)} items</span>` : nothing}
        ${isPublic === undefined ? nothing : isPublic ? html`<icon-lucide-globe></icon-lucide-globe>` : html`<icon-lucide-lock-keyhole></icon-lucide-lock-keyhole>`}
      </li>
    `
  }

  protected updated (changedProperties: PropertyValues<this>) {
    if (changedProperties.has('selectedResource') && this.selectedResource) {
      void this.showResourceInContentView(this.selectedResource)
    }
  } 

  protected willUpdate (changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties)

    if (
      changedProperties.has('store') ||
      changedProperties.has('subject') 
    ) {
      void this.syncResources()
    }
  }

  private renderListView () {
    return html`
      <ul class="resource-list" role="listbox">
        ${Array.from(this.resources.values()).map((resource) => this.renderResourceListItem(resource, 0))}
      </ul>
    `
  }

  private renderGridView () {
    return html`
      <ul class="resource-grid" role="listbox">
        ${Array.from(this.resources.values()).map((resource) => this.renderResourceGridItem(resource, 0))}
      </ul>
    `
  }

  render () {
    return html`
      <div class="storage-container-pane">
        <div class="storage-container-pane-main-content">
          ${this.resources.size > 0
            ? (this.view === 'grid' ? this.renderGridView() : this.renderListView())
            : html`<div class="storage-container-pane-empty-message">No resources found in this container.</div>`
          }
          <storage-content-view></storage-content-view>
          <storage-creation-area
            .store=${this.store}
            .subject=${this.subject}
            @resource-created=${this.syncResources}
          ></storage-creation-area>
        </div>
      </div>
    `
  }
}
