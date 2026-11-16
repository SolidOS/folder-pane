import { DialogComponent, customElement } from 'solid-ui'
import { html } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import { getCreationDialogText } from '../../helpers'
import { invalidCreationNameMessage, isSafeCreationName } from '../../creationSafety'
import styles from './FolderPaneCreateDialog.styles.css'

import 'solid-ui/components/button'
import 'solid-ui/components/dialog'
import 'solid-ui/components/dialog-content'
import 'solid-ui/components/dialog-footer'
import 'solid-ui/components/dialog-header'
import '~icons/lucide/x'

@customElement('folder-pane-create-dialog')
export default class FolderPaneCreateDialog extends DialogComponent<string> {
  static styles = styles

  @property({ attribute: false })
  accessor label: string | null = null

  @state()
  accessor name = ''

  @state()
  accessor validationMessage = ''

  @query('input')
  private accessor nameInput: HTMLInputElement | null = null

  private cancel = () => this.close()

  private confirm = () => {
    const name = this.name.trim()

    if (!isSafeCreationName(name)) {
      this.validationMessage = invalidCreationNameMessage
      return
    }

    this.close(name)
  }

  private onNameInput = (event: Event) => {
    this.name = (event.target as HTMLInputElement).value
    this.validationMessage = ''
  }

  private onNameKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      this.confirm()
    }
  }

  protected firstUpdated () {
    requestAnimationFrame(() => {
      this.nameInput?.focus()
      this.nameInput?.setSelectionRange(0, this.nameInput.value.length)
    })
  }

  protected render () {
    const paneLabel = this.label ?? 'Container'
    const { title, placeholder } = getCreationDialogText(paneLabel)
    const displayLabel = title.slice(4)
    const fieldLabel = `${displayLabel} name`

    return html`
      <solid-ui-dialog>
        <solid-ui-dialog-header slot="header" class="folder-pane-create-dialog-header">
          <h1>${title}</h1>
          <solid-ui-button variant="ghost" @click=${this.cancel} title="Close" aria-label="Close">
            <icon-lucide-x slot="icon"></icon-lucide-x>
          </solid-ui-button>
        </solid-ui-dialog-header>
        <solid-ui-dialog-content>
          <label class="folder-pane-create-dialog-label">
            <span>${fieldLabel}</span>
            <input
              type="text"
              placeholder=${placeholder}
              .value=${this.name}
              @input=${this.onNameInput}
              @keydown=${this.onNameKeydown}
            />
            ${this.validationMessage
              ? html`<span class="folder-pane-create-dialog-error" role="alert">${this.validationMessage}</span>`
              : ''}
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
