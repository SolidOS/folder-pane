import { html, nothing } from 'lit'
import { consume } from '@lit/context'
import { property } from 'lit/decorators.js'
import type { DataBrowserContext } from 'pane-registry'
import { LiveStore, NamedNode } from 'rdflib'
import { customElement, DEFAULT_STORE, FileExplorerContext, fileExplorerContext, storeContext, WebComponent } from 'solid-ui'
import '~icons/lucide/folder-open'
import '~icons/lucide/search'
import '~icons/lucide/layout-grid'
import '~icons/lucide/list'
import '../storage-creation-menu/StorageCreationMenu'
import { isStorageRoot } from '../../helpers'
import styles from './StorageHeader.styles.css'
import { DEFAULT_STORAGE_CONTEXT, StorageContext, storageContext } from '../storage-provider/context'

@customElement('storage-header')
export default class StorageHeader extends WebComponent {
  static styles = styles

  @consume({ context: storeContext, subscribe: true })
  accessor store: LiveStore = DEFAULT_STORE

  @consume({ context: fileExplorerContext, subscribe: true })
  accessor fileExplorerContext: FileExplorerContext = undefined as unknown as FileExplorerContext

  @consume({ context: storageContext, subscribe: true })
  accessor storageContext: StorageContext = DEFAULT_STORAGE_CONTEXT

  @property({ attribute: false })
  accessor browserContext: DataBrowserContext | null = null

  @property({ attribute: false })
  accessor getStatusArea: (() => HTMLElement | null) | null = null

  private get currentSubject (): NamedNode | undefined {
    return this.fileExplorerContext?.subjectUri ? new NamedNode(this.fileExplorerContext.subjectUri) : undefined
  }

  private getBreadcrumbSegments (resource: NamedNode) {
    const segments: NamedNode[] = []
    let current: NamedNode | null = resource

    while (current) {
      segments.unshift(current)
      if (this.store && isStorageRoot(this.store, current)) {
        break
      }

      const parent = current.dir()
      if (!parent || parent.sameTerm(current)) {
        break
      }
      current = parent
    }

    return segments
  }

  private getBreadcrumbLabel (resource: NamedNode) {
    if (this.store && isStorageRoot(this.store, resource)) {
      return 'Storage'
    }

    try {
      const url = new URL(resource.uri)
      const pathSegments = url.pathname.split('/').filter(Boolean)

      if (pathSegments.length > 0) {
        return decodeURIComponent(pathSegments[pathSegments.length - 1])
      }

      return 'Storage'
    } catch (_error) {
      return resource.uri
    }
  }

  private onSearchInput = (event: Event) => {
    this.storageContext.setSearchQuery((event.target as HTMLInputElement).value)
  }

  private renderBreadcrumbs (resource: NamedNode) {
    const segments = this.getBreadcrumbSegments(resource)
    const specialCrumb = this.getBreadcrumbLabel(resource).toLowerCase() === 'public'
      ? 'Public'
      : 'Home'

    const breadcrumbItems: Array<NamedNode | string> = [...segments]

    if (breadcrumbItems.length > 0) {
      breadcrumbItems.splice(1, 0, specialCrumb)
    }

    return html`
      <nav class="storage-header-breadcrumbs" aria-label="Breadcrumb">
        <icon-lucide-folder-open></icon-lucide-folder-open>
        <ol>
          ${breadcrumbItems.map((segment, index) => typeof segment === 'string'
            ? html`
              <li>
                <span class=${index === breadcrumbItems.length - 1 ? 'current' : 'crumb'}>${segment}</span>
                ${index < breadcrumbItems.length - 1 ? html`<span class="separator">/</span>` : ''}
              </li>
            `
            : html`
            <li>
              <span class=${index === breadcrumbItems.length - 1 ? 'current' : 'crumb'}>
                ${this.getBreadcrumbLabel(segment)}
              </span>
              ${index < breadcrumbItems.length - 1 ? html`<span class="separator">/</span>` : ''}
            </li>
          `)}
        </ol>
      </nav>
    `
  }

  render() {
    const activeResource = this.storageContext.selectedResource ?? this.currentSubject
    const searchQuery = this.storageContext.searchQuery

    return html`
      <div class="storage-header">
        ${activeResource ? this.renderBreadcrumbs(activeResource) : ''}
        <div class="storage-header-toolbar">
          <div class="storage-header-search">
            <input
              type="text"
              aria-label="Search"
              .value=${searchQuery}
              @input=${this.onSearchInput}
            />
            ${searchQuery
              ? nothing
              : html`
                  <span class="storage-header-search-placeholder">
                    <icon-lucide-search></icon-lucide-search>
                    Search
                  </span>
                `}
          </div>
          <div class="storage-header-actions">
            <solid-ui-button
              variant="ghost"
              @click=${() => this.storageContext.setView('grid')}>
              <icon-lucide-layout-grid></icon-lucide-layout-grid>
            </solid-ui-button>
            <solid-ui-button
              variant="ghost"
              @click=${() => this.storageContext.setView('list')}>
              <icon-lucide-list></icon-lucide-list>
            </solid-ui-button>
          </div>
          <div class="storage-header-create-menu-trigger">
            ${activeResource && this.browserContext
              ? html`
                  <storage-creation-menu
                    .browserContext=${this.browserContext}
                    .getStatusArea=${this.getStatusArea}
                    .container=${activeResource}
                    .paneList=${this.browserContext.session.paneRegistry.list}
                  ></storage-creation-menu>
                `
              : nothing}
          </div>
        </div>
      </div>
    `
  }
}
