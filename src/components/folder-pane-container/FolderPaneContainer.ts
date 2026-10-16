import { html } from 'lit'
import { property } from 'lit/decorators.js'
import type { NamedNode } from 'rdflib'
import { customElement, utils, WebComponent } from 'solid-ui'
import type { SolidLogic } from 'solid-logic'
import type { Resource } from '../../types'
import { getResourcesForContainer } from '../../helpers'

@customElement('folder-pane-container')
export default class FolderPaneContainer extends WebComponent {
  @property({ attribute: false })
  accessor subject: NamedNode | undefined = undefined

  @property({ attribute: false })
  accessor resourceLogic: SolidLogic['resource'] | null = null

  private selectResource (resource: Resource) {
    this.dispatchEvent(new CustomEvent('resource-selected', {
      detail: { resource: resource.subject },
      bubbles: true,
      composed: true,
    }))
  }

  private renderResourceItem (resource: Resource) {
    return html`
      <li
        class="obj"
        notSelectable="false"
        aria-selected="false"
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
        ${utils.label(resource.subject)}
      </li>
    `
  }

  render () {
    const resources = this.subject
      ? getResourcesForContainer(this.subject, this.resourceLogic)
      : new Map<string, Resource>()

    return html`
      <div class="folder-pane-container">
        <div class="folder-pane-container-main-content">
          ${resources.size > 0
            ? html`
                <ul class="folder-pane-container-resource-list" role="listbox">
                  ${Array.from(resources.values()).map((resource) => this.renderResourceItem(resource))}
                </ul>
              `
            : html`<div class="folder-pane-container-empty-message">No resources found in this container.</div>`
          }
        </div>
      </div>
    `
  }
}
