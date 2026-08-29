import { customElement, WebComponent, login, utils } from 'solid-ui'
import { html, nothing } from 'lit'
import { property, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import type { DataBrowserContext, PaneDefinition } from 'pane-registry'
import type { NamedNode } from 'rdflib'
import 'solid-ui/components/button'
import 'solid-ui/components/menu'
import 'solid-ui/components/menu-item'
import '~icons/lucide/chevron-down'
import '~icons/lucide/plus'
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
      const audiencePanes = await login.filterAvailablePanes(this.paneList ?? [])
      // filterAvailablePanes only filters by audience; only minting panes can create anything.
      this.availablePanes = audiencePanes.filter((pane) => pane.mintNew)
    }
  }

  private getPaneLabel (pane: PaneDefinition): string {
    if (!pane.mintClass) {
      return pane.name.charAt(0).toUpperCase() + pane.name.slice(1)
    }

    return utils.label(pane.mintClass)
  }

  private getMintNoun (pane: PaneDefinition): string {
    return `New ${this.getPaneLabel(pane)}`
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
      <solid-ui-menu placement="bottom-end">
        <solid-ui-button slot="trigger" variant="primary">
          <icon-lucide-plus slot="left-icon"></icon-lucide-plus>
          Add
          <icon-lucide-chevron-down slot="right-icon"></icon-lucide-chevron-down>
        </solid-ui-button>
        ${this.availablePanes.map((pane) => html`
          <solid-ui-menu-item @solid-ui-select=${() => this.handlePaneSelected(pane)}>
            ${pane.icon ? html`<img slot="left-icon" src=${pane.icon} alt="" />` : nothing}
            ${this.getMintNoun(pane)}
          </solid-ui-menu-item>
        `)}
      </solid-ui-menu>
    `
  }
}
