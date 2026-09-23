import { authn } from 'solid-logic'
import { customElement, DEFAULT_STORE, storeContext, WebComponent } from 'solid-ui'
import { html, nothing } from 'lit'
import styles from './StorageCreationArea.styles.css'
import '~icons/lucide/cloud-upload'
import type { NamedNode } from 'rdflib'
import { LiveStore } from 'rdflib'
import { property, query } from 'lit/decorators.js'
import { consume } from '@lit/context'
import { uploadFilesIntoContainer } from '../../helpers'


@customElement('storage-creation-area')
export default class StorageCreationArea extends WebComponent {
  static styles = styles

  @consume({ context: storeContext, subscribe: true })
  accessor store: LiveStore = DEFAULT_STORE

  @property({ attribute: false })
  accessor subject: NamedNode | undefined = undefined

  @property({ attribute: false })
  accessor message: String | null = null

  @query('input[type="file"]')
  private accessor fileInput: HTMLInputElement | null = null

  public openChooser () {
    this.fileInput?.click()
  }

  private onDragOver (event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer!.dropEffect = 'copy'
  }

  private onDrop (event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()

    const subject = this.subject

    if (!this.store || !subject) {
      console.error('Store or subject is not defined for StorageCreationArea')
      return
    }

    const files = event.dataTransfer?.files ?? []

    uploadFilesIntoContainer(this.store, subject, files, (resource) => {
      this.dispatchEvent(new CustomEvent('resource-created', {
        detail: { resource },
        bubbles: true,
        composed: true,
      }))
    })
  }

  private onChooseFiles = (event: Event) => {
    const input = event.target as HTMLInputElement
    const subject = this.subject

    if (!this.store || !subject) {
      console.error('Store or subject is not defined for StorageCreationArea')
      return
    }

    const files = input.files ?? new FileList()

    uploadFilesIntoContainer(this.store, subject, files, (resource) => {
      this.dispatchEvent(new CustomEvent('resource-created', {
        detail: { resource },
        bubbles: true,
        composed: true,
      }))
    })

    input.value = ''
  }

  private onClick = () => {
    this.openChooser()
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.openChooser()
    }
  }

  render() {
    const me = authn.currentUser()

    return html`
      ${me
        ? html`
            <div
              class="storage-creation-area"
              title="Drop files or folder here or click to choose"
              aria-label="Drop files or folder here or click to choose"
              role="button"
              tabindex="0"
              @click=${this.onClick}
              @keydown=${this.onKeyDown}
              @dragover=${this.onDragOver}
              @drop=${this.onDrop}
            >
              <input
                type="file"
                multiple
                hidden
                @change=${this.onChooseFiles}
              />
              <icon-lucide-cloud-upload></icon-lucide-cloud-upload>
              <span class="storage-creation-area-message">${this.message ?? 'Drop files or folders here or click to choose files'}</span>
            </div>
          `
        : nothing}
    `
  }
}
