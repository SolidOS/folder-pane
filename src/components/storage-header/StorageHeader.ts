import { customElement, WebComponent } from 'solid-ui'
import { html, nothing } from 'lit'
import { property, state } from 'lit/decorators.js'
import type { DataBrowserContext } from 'pane-registry'
import type { NamedNode } from 'rdflib'
import '~icons/lucide/folder-open'
import '~icons/lucide/search'
import '~icons/lucide/layout-grid'
import '~icons/lucide/list'
import '../storage-creation-menu/StorageCreationMenu'
import styles from './StorageHeader.styles.css'

@customElement('storage-header')
export default class StorageHeader extends WebComponent {
  static styles = styles

  @property({ attribute: false })
  accessor subject: NamedNode | undefined = undefined

  @property({ attribute: false })
  accessor selectedResource: NamedNode | undefined = undefined

  @property({ attribute: false })
  accessor browserContext: DataBrowserContext | null = null

  @state()
  accessor searchValue = ''

  private getBreadcrumbSegments (resource: NamedNode) {
    const segments: NamedNode[] = []
    let current: NamedNode | null = resource

    while (current) {
      segments.unshift(current)
      const parent = current.dir()
      if (!parent || parent.sameTerm(current)) {
        break
      }
      current = parent
    }

    return segments
  }

  private getBreadcrumbLabel (resource: NamedNode) {
    try {
      const url = new URL(resource.uri)
      const pathSegments = url.pathname.split('/').filter(Boolean)

      if (pathSegments.length > 0) {
        return decodeURIComponent(pathSegments[pathSegments.length - 1])
      }

      return url.host || resource.uri
    } catch (_error) {
      return resource.uri
    }
  }

  private onSearchInput = (event: Event) => {
    this.searchValue = (event.target as HTMLInputElement).value
  }

  private renderBreadcrumbs (resource: NamedNode) {
    const segments = this.getBreadcrumbSegments(resource)

    return html`
      <nav class="storage-header-breadcrumbs" aria-label="Breadcrumb">
        <icon-lucide-folder-open></icon-lucide-folder-open>
        <ol>
          ${segments.map((segment, index) => html`
            <li>
              <span class=${index === segments.length - 1 ? 'current' : 'crumb'}>
                ${this.getBreadcrumbLabel(segment)}
              </span>
              ${index < segments.length - 1 ? html`<span class="separator">/</span>` : ''}
            </li>
          `)}
        </ol>
      </nav>
    `
  }

  render() {
    const resource = this.selectedResource ?? this.subject

    return html`
      <div class="storage-header">
        ${resource ? this.renderBreadcrumbs(resource) : ''}
        <div class="storage-header-toolbar">
          <div class="storage-header-search">
            <input
              type="text"
              aria-label="Search"
              .value=${this.searchValue}
              @input=${this.onSearchInput}
            />
            ${this.searchValue
              ? ''
              : html`
                  <span class="storage-header-search-placeholder">
                    <icon-lucide-search></icon-lucide-search>
                    Search
                  </span>
                `}
          </div>
          <div class="storage-header-actions">
            <solid-ui-button variant="ghost">
              <icon-lucide-layout-grid></icon-lucide-layout-grid>
            </solid-ui-button>
            <solid-ui-button variant="ghost">
              <icon-lucide-list></icon-lucide-list>
            </solid-ui-button>
          </div>
          <div class="storage-header-create-menu-trigger">
            ${resource && this.browserContext
              ? html`
                  <storage-creation-menu
                    .browserContext=${this.browserContext}
                    .dom=${this.browserContext.dom}
                    .folder=${resource}
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
