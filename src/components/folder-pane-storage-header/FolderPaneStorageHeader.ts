import { html, nothing } from 'lit'
import { property, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import type { DataBrowserContext, PaneDefinition } from 'pane-registry'
import { customElement, login, WebComponent } from 'solid-ui'
import type { NamedNode } from 'rdflib'
import 'solid-ui/components/button'
import 'solid-ui/components/menu'
import 'solid-ui/components/menu-item'
import '~icons/lucide/folder-open'
import '~icons/lucide/layout-grid'
import '~icons/lucide/list'
import '~icons/lucide/chevron-down'
import '~icons/lucide/plus'
import '~icons/lucide/upload'
import '~icons/lucide/search'
import { getCreationPanes, getPaneLabel } from '../../helpers'
import * as debug from '../../debug'
import styles from './FolderPaneStorageHeader.styles.css'

@customElement('folder-pane-storage-header')
export default class FolderPaneStorageHeader extends WebComponent {
  static styles = styles

  @property({ attribute: false })
  accessor subject: NamedNode | undefined = undefined

  @property({ attribute: false })
  accessor selectedResource: NamedNode | undefined = undefined

  @property({ attribute: false })
  accessor browserContext: DataBrowserContext | undefined = undefined

  @property({ attribute: false })
  accessor paneList: PaneDefinition[] = []

  @property()
  accessor view: 'grid' | 'list' = 'grid'

  @property()
  accessor searchQuery = ''

  @property({ type: Boolean })
  accessor canCreate = false

  @state()
  accessor availablePanes: PaneDefinition[] = []

  private availablePanesGeneration = 0

  protected updated (changedProperties: PropertyValues<this>) {
    if (!changedProperties.has('paneList') && !changedProperties.has('browserContext')) return
    const generation = ++this.availablePanesGeneration
    void login.filterAvailablePanes(this.paneList)
      .then(panes => {
        if (generation === this.availablePanesGeneration) {
          this.availablePanes = getCreationPanes(panes)
        }
      })
      .catch(error => debug.error('Unable to load folder creation panes', error))
  }

  private get breadcrumbResources () {
    const root = this.subject
    const selected = this.selectedResource
    if (!root || !selected) return root ? [root] : []

    const resources = [selected]
    let current = selected
    while (!current.sameTerm(root)) {
      const parent = current.dir()
      if (!parent || parent.sameTerm(current)) return [root, selected]
      resources.unshift(parent)
      current = parent
      if (resources.length > 32) return [root, selected]
    }
    return resources
  }

  private getResourceLabel (resource: NamedNode, index: number) {
    if (this.subject?.sameTerm(resource) || index === 0) return 'Home'

    try {
      const pathSegments = new URL(resource.uri).pathname.split('/').filter(Boolean)
      return decodeURIComponent(pathSegments[pathSegments.length - 1] || resource.uri)
    } catch {
      return resource.uri
    }
  }

  private selectHome () {
    this.dispatchEvent(new CustomEvent('folder-pane-select-home', {
      bubbles: true,
      composed: true
    }))
  }

  private selectView (view: 'grid' | 'list') {
    this.dispatchEvent(new CustomEvent('folder-pane-change-view', {
      detail: { view },
      bubbles: true,
      composed: true
    }))
  }

  private selectResource (resource: NamedNode) {
    this.dispatchEvent(new CustomEvent('folder-pane-select-resource', {
      detail: { resource },
      bubbles: true,
      composed: true
    }))
  }

  private requestUpload () {
    this.dispatchEvent(new CustomEvent('folder-pane-upload', {
      bubbles: true,
      composed: true
    }))
  }

  private updateSearch (event: Event) {
    this.dispatchEvent(new CustomEvent('folder-pane-search', {
      detail: { query: (event.target as HTMLInputElement).value },
      bubbles: true,
      composed: true
    }))
  }

  private createPane (pane: PaneDefinition) {
    this.dispatchEvent(new CustomEvent('folder-pane-create-pane', {
      detail: { pane },
      bubbles: true,
      composed: true
    }))
  }

  render () {
    return html`
      <header class="folder-pane-storage-header">
        <nav class="folder-pane-storage-header-breadcrumbs" aria-label="Storage breadcrumb">
          <icon-lucide-folder-open aria-hidden="true"></icon-lucide-folder-open>
          <ol>
            ${this.breadcrumbResources.map((resource, index, resources) => html`
              <li>
                ${index === resources.length - 1
                  ? html`<span aria-current="page">${this.getResourceLabel(resource, index)}</span>`
                  : html`
                      <button
                        type="button"
                        @click=${() => index === 0 ? this.selectHome() : this.selectResource(resource)}
                      >${this.getResourceLabel(resource, index)}</button>
                      <span class="separator" aria-hidden="true">/</span>
                    `}
              </li>
            `)}
          </ol>
        </nav>
        <div class="folder-pane-storage-header-toolbar">
          <label class="folder-pane-storage-header-search">
            <icon-lucide-search aria-hidden="true"></icon-lucide-search>
            <input
              aria-label="Search"
              type="search"
              .value=${this.searchQuery}
              @input=${this.updateSearch}
            >
          </label>
          <div class="folder-pane-storage-header-view-controls" role="group" aria-label="Container view">
            <div class=${`folder-pane-storage-header-view-toggle ${this.view === 'grid' ? 'is-selected' : ''}`}>
              <solid-ui-button
                variant="ghost"
                aria-label="Grid view"
                aria-pressed=${String(this.view === 'grid')}
                @click=${() => this.selectView('grid')}
              >
                <icon-lucide-layout-grid slot="icon" aria-hidden="true"></icon-lucide-layout-grid>
              </solid-ui-button>
            </div>
            <div class=${`folder-pane-storage-header-view-toggle ${this.view === 'list' ? 'is-selected' : ''}`}>
              <solid-ui-button
                variant="ghost"
                aria-label="List view"
                aria-pressed=${String(this.view === 'list')}
                @click=${() => this.selectView('list')}
              >
                <icon-lucide-list slot="icon" aria-hidden="true"></icon-lucide-list>
              </solid-ui-button>
            </div>
          </div>
          ${this.canCreate ? html`<solid-ui-menu class="folder-pane-storage-header-add-menu" placement="bottom-end">
            <solid-ui-button
              slot="trigger"
              variant="primary"
              aria-haspopup="menu"
            >
              <icon-lucide-plus slot="left-icon" aria-hidden="true"></icon-lucide-plus>
              Add
              <icon-lucide-chevron-down slot="right-icon" aria-hidden="true"></icon-lucide-chevron-down>
            </solid-ui-button>
            ${this.availablePanes.map(pane => html`
              <solid-ui-menu-item @solid-ui-select=${() => this.createPane(pane)}>
                ${pane.icon
                  ? html`<img
                    slot="left-icon"
                    src=${String(pane.icon)}
                    alt=""
                  >`
                  : nothing}
                New ${getPaneLabel(pane)}
              </solid-ui-menu-item>
            `)}
            <solid-ui-menu-item @solid-ui-select=${this.requestUpload}>
              <icon-lucide-upload slot="left-icon" aria-hidden="true"></icon-lucide-upload>
              Upload
            </solid-ui-menu-item>
          </solid-ui-menu>` : nothing}
        </div>
      </header>
    `
  }
}
