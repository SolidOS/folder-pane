import { authn } from 'solid-logic'
import { customElement, ns, WebComponent, widgets } from 'solid-ui'
import type { NamedNode } from 'rdflib'
import { html, nothing } from 'lit'
import styles from './StorageCreationArea.styles.css'
import '~icons/lucide/plus'
import { property } from 'lit/decorators.js'
import { LiveStore } from 'rdflib'


@customElement('storage-creation-area')
export default class StorageCreationArea extends WebComponent {
  static styles = styles

  @property({ attribute: false })
  accessor store: LiveStore | null = null

  @property({ attribute: false })
  accessor subject: NamedNode | null = null

  private onDragOver (event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer!.dropEffect = 'copy'
  }

  private onDrop (event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()

    const store = this.store
    const subject = this.subject
    const files = event.dataTransfer?.files ?? []

    if (!store || !subject) {
      console.error('Store or subject is not defined for StorageCreationArea')
      return
    }

    widgets.uploadFiles(
      store.fetcher,
      files,
      subject.uri,
      subject.uri,
      (file, uri) => {
        const destination = store.sym(uri)
        store.add(subject, ns.ldp('contains'), destination, subject.doc())
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
              <icon-lucide-plus></icon-lucide-plus>
            </div>
          `
        : nothing}
    `
  }
}
