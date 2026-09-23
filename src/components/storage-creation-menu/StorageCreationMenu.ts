import { customElement, WebComponent, authContext, DEFAULT_AUTH_CONTEXT, login } from 'solid-ui'
import { html, nothing } from 'lit'
import { consume } from '@lit/context'
import { property, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import type { DataBrowserContext, PaneDefinition } from 'pane-registry'
import type { NamedNode } from 'rdflib'
import type { AuthContext } from 'solid-ui'
import { DEFAULT_STORAGE_CONTEXT, storageContext, type StorageContext } from '../storage-provider/context'
import { solidLogicSingleton } from 'solid-logic'
import 'solid-ui/components/button'
import 'solid-ui/components/menu'
import 'solid-ui/components/menu-item'
import '~icons/lucide/chevron-down'
import '~icons/lucide/plus'
import { createNewResource, getPaneLabel } from './mintPaneInstance'
import styles from './StorageCreationMenu.styles.css'


@customElement('storage-creation-menu')
export default class StorageCreationMenu extends WebComponent {
  static styles = styles

  @property({ attribute: false })
  accessor browserContext: DataBrowserContext | null = null

  @property({ attribute: false })
  accessor container: NamedNode | null = null

  @property({ attribute: false })
  accessor paneList: PaneDefinition[] = []

  // Resolved on click, because the target is not rendered yet on first paint.
  @property({ attribute: false })
  accessor getStatusArea: (() => HTMLElement | null) | null = null

  @consume({ context: authContext, subscribe: true })
  private accessor auth: AuthContext = DEFAULT_AUTH_CONTEXT

  @consume({ context: storageContext, subscribe: true })
  private accessor storageContext: StorageContext = DEFAULT_STORAGE_CONTEXT

  @state()
  accessor availablePanes: PaneDefinition[] = []

  private unsubscribeSessionUpdated?: () => void

  connectedCallback () {
    super.connectedCallback()

    this.unsubscribeSessionUpdated = this.auth.onSessionUpdated(() => this.requestUpdate())
  }

  disconnectedCallback () {
    super.disconnectedCallback()

    this.unsubscribeSessionUpdated?.()
  }

  protected async updated (changedProperties: PropertyValues<this>) {
    if (changedProperties.has('paneList')) {
      const audiencePanes = await login.filterAvailablePanes(this.paneList ?? [])
      // filterAvailablePanes only filters by audience; only minting panes can create anything.
      this.availablePanes = audiencePanes.filter((pane) => pane.mintNew)
    }
  }

  private get canAddToCurrentResource () {
    return !!this.container && solidLogicSingleton.resource.isContainer(this.container)
  }

  private get addTooltip () {
    return this.canAddToCurrentResource
      ? 'Add a new item in the selected container'
      : 'Select a container to add items here'
  }

  private async handlePaneSelected (pane: PaneDefinition) {
    if (!this.browserContext || !this.container || !this.auth.account) {
      return
    }

    await createNewResource({
      browserContext: this.browserContext,
      container: this.container,
      pane,
      statusArea: this.getStatusArea?.() ?? this,
      storageContext: this.storageContext
    })
  }

  render () {
    const isLoggedIn = !!this.auth.account

    return html`
      <solid-ui-menu placement="bottom-end">
        <solid-ui-button slot="trigger" variant="primary" ?disabled=${!isLoggedIn || !this.canAddToCurrentResource} title=${this.addTooltip}>
          <icon-lucide-plus slot="left-icon"></icon-lucide-plus>
          Add
          <icon-lucide-chevron-down slot="right-icon"></icon-lucide-chevron-down>
        </solid-ui-button>
        ${this.availablePanes.map((pane) => html`
          <solid-ui-menu-item @solid-ui-select=${() => this.handlePaneSelected(pane)}>
            ${pane.icon ? html`<img slot="left-icon" src=${pane.icon} alt="" />` : nothing}
            New ${getPaneLabel(pane)}
          </solid-ui-menu-item>
        `)}
      </solid-ui-menu>
    `
  }
}
