import { customElement, WebComponent, login } from 'solid-ui'
import { html, nothing } from 'lit'
import { property, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import type { DataBrowserContext, PaneDefinition } from 'pane-registry'
import type { NamedNode } from 'rdflib'
import { makeNewAppInstance } from './mintPaneInstance'
import styles from './StorageCreationMenu.styles.css'


@customElement('storage-creation-menu')
export default class StorageCreationMenu extends WebComponent {
  static styles = styles

  @property({ attribute: false })
  accessor browserContext: DataBrowserContext | null = null

  @property({ attribute: false })
  accessor dom: HTMLDocument | null = null

  @property({ attribute: false })
  accessor folder: NamedNode | null = null

  @property({ attribute: false })
  accessor paneList: PaneDefinition[] = []

  @property({ attribute: false })
  accessor refreshTarget: { refresh?: () => void } | null = null

  @state()
  accessor availablePanes: PaneDefinition[] = []

  protected createRenderRoot () {
    return this
  }

  protected async updated (changedProperties: PropertyValues<this>) {
    if (changedProperties.has('paneList')) {
      this.availablePanes = await login.filterAvailablePanes(this.paneList ?? [])
    }
  }

  private async handlePaneSelected (pane: PaneDefinition) {
    if (!this.browserContext || !this.dom || !this.folder) {
      return
    }

    await makeNewAppInstance({
      browserContext: this.browserContext,
      div: this,
      dom: this.dom,
      folder: this.folder,
      pane,
      refreshTarget: this.refreshTarget,
      onCreated: (newInstance) => {
        this.dispatchEvent(new CustomEvent('resource-selected', {
          detail: { resource: newInstance },
          bubbles: true,
          composed: true
        }))
      }
    })
  }

  render () {
    return html`
      <div class="storage-creation-menu">
        ${this.availablePanes.length > 0
          ? this.availablePanes.map((pane) => html`
              <button
                type="button"
                class="storage-creation-menu__item"
                @click=${() => this.handlePaneSelected(pane)}
              >
                ${pane.icon ? html`<img src=${pane.icon} alt="" class="storage-creation-menu__icon" />` : nothing}
                <span>${pane.name}</span>
              </button>
            `)
          : html`<div class="storage-creation-menu__empty">No create targets available</div>`}
      </div>
    `
  }
}
