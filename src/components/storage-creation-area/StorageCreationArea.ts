import { authn } from 'solid-logic'
import { customElement, DEFAULT_STORE, FileExplorerContext, fileExplorerContext, ns, storeContext, WebComponent, widgets } from 'solid-ui'
import { html, nothing } from 'lit'
import styles from './StorageCreationArea.styles.css'
import '~icons/lucide/cloud-upload'
import { LiveStore } from 'rdflib'
import { consume } from '@lit/context'
import { property } from 'lit/decorators.js'


@customElement('storage-creation-area')
export default class StorageCreationArea extends WebComponent {
  static styles = styles

  @consume({ context: storeContext, subscribe: true })
  accessor store: LiveStore = DEFAULT_STORE

  @consume({ context: fileExplorerContext, subscribe: true })
  accessor fileExplorerContext: FileExplorerContext = undefined as unknown as FileExplorerContext

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

    const subjectUri = this.fileExplorerContext.subjectUri
    const subject = subjectUri ? this.store.sym(subjectUri) : undefined
    const files = event.dataTransfer?.files ?? []

    if (!this.store || !subject) {
      console.error('Store or subject is not defined for StorageCreationArea')
      return
    }

    widgets.uploadFiles(
      this.store.fetcher,
      files,
      subject.uri,
      subject.uri,
      (file, uri) => {
        const destination = this.store.sym(uri)
        this.store.add(subject, ns.ldp('contains'), destination, subject.doc())
        this.dispatchEvent(new CustomEvent('resource-created', {
          detail: { resource: destination },
          bubbles: true,
          composed: true,
        }))
      }
    )
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
