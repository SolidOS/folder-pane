import { authn } from 'solid-logic'
import { customElement, DEFAULT_STORE, storeContext, WebComponent } from 'solid-ui'
import { html, nothing } from 'lit'
import styles from './StorageCreationArea.styles.css'
import '~icons/lucide/cloud-upload'
import type { NamedNode } from 'rdflib'
import { LiveStore } from 'rdflib'
import { property } from 'lit/decorators.js'
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

  render() {
    const me = authn.currentUser()

    return html`
      ${me
        ? html`
            <div
              class="storage-creation-area"
              title="Drop resource to upload"
              aria-label="Drop resource to upload"
              @dragover=${this.onDragOver}
              @drop=${this.onDrop}
            >
              <icon-lucide-cloud-upload></icon-lucide-cloud-upload>
              <span class="storage-creation-area-message">${this.message ?? 'Drop file or folder'}</span>
            </div>
          `
        : nothing}
    `
  }
}
