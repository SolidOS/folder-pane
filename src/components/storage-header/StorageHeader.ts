import { customElement, WebComponent } from 'solid-ui'
import { html } from 'lit'
import { property } from 'lit/decorators.js'
import type { NamedNode } from 'rdflib'

@customElement('storage-header')
export default class StorageHeader extends WebComponent {
  @property({ attribute: false })
  accessor subject: NamedNode | undefined = undefined

  @property({ attribute: false })
  accessor selectedResource: NamedNode | undefined = undefined

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

  private renderBreadcrumbs (resource: NamedNode) {
    const segments = this.getBreadcrumbSegments(resource)

    return html`
      <nav class="storage-header-breadcrumbs" aria-label="Breadcrumb">
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
        <slot></slot>
      </div>
    `
  }
}
