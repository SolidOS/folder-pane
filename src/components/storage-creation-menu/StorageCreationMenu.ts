import { customElement, WebComponent, authContext, DEFAULT_AUTH_CONTEXT, login, showDialog } from 'solid-ui'
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
import { getPaneLabel, makeNewAppInstance } from './mintPaneInstance'
import StorageCreationDialog from '../storage-creation-dialog'
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

    this.getStatusArea?.()?.replaceChildren()

    const name = await new Promise<string | undefined>((resolve) => {
      showDialog(StorageCreationDialog, {
        props: {
          label: getPaneLabel(pane)
        },
        onClose: (result) => resolve(result)
      })
    })

    if (!name) {
      return
    }

    const newResource = await makeNewAppInstance({
      browserContext: this.browserContext,
      container: this.container,
      pane,
      name,
      statusArea: this.getStatusArea?.() ?? this
    })

    // Folder is the shell itself, so re-selecting it would nest the whole
    // storage UI. Dokieli is mint-only here, so it also falls back.
    const selectedPaneName = pane.name === 'folder' || pane.name === 'Dokieli'
      ? undefined
      : pane.name
    this.storageContext.selectResource(newResource, selectedPaneName)
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
