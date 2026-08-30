import { customElement, DialogComponent } from 'solid-ui'
import { html } from 'lit'
import { property, state } from 'lit/decorators.js'
import styles from './StorageCreationDialog.styles.css'
import 'solid-ui/components/button'
import 'solid-ui/components/dialog'
import 'solid-ui/components/dialog-content'
import 'solid-ui/components/dialog-footer'
import 'solid-ui/components/dialog-header'
import '~icons/lucide/x'

@customElement('storage-creation-dialog')
export default class StorageCreationDialog extends DialogComponent<string> {
  static styles = styles

  @property({ attribute: false })
  accessor label: string | null = null

  @state()
  accessor name = ''

  private cancel = () => this.close()

  private confirm = () => {
    const name = this.name.trim()

    if (!name) {
      return
    }

    this.close(name)
  }

  private onNameInput = (event: Event) => {
    this.name = (event.target as HTMLInputElement).value
  }

  protected render () {
    const paneLabel = this.label ?? 'Container'
    const fieldLabel = `${paneLabel} Name`

    return html`
      <solid-ui-dialog>
        <solid-ui-dialog-header slot="header" class="storage-creation-dialog-header">
          <h1>New ${paneLabel}</h1>
          <solid-ui-button variant="ghost" @click=${this.cancel} title="Close" aria-label="Close">
            <icon-lucide-x slot="icon"></icon-lucide-x>
          </solid-ui-button>
        </solid-ui-dialog-header>
        <solid-ui-dialog-content>
          <label class="storage-creation-dialog-label">
            <span>${fieldLabel}</span>
            <input
              type="text"
              .value=${this.name || `Untitled ${paneLabel}`}
              @input=${this.onNameInput}
            />
          </label>
        </solid-ui-dialog-content>
        <solid-ui-dialog-footer>
          <solid-ui-button variant="secondary" @click=${this.cancel}>
            Cancel
          </solid-ui-button>
          <solid-ui-button ?disabled=${!this.name.trim()} @click=${this.confirm}>
            Create
          </solid-ui-button>
        </solid-ui-dialog-footer>
      </solid-ui-dialog>
    `
  }
}
