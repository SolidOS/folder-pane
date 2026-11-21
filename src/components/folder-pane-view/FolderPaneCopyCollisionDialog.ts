import { DialogComponent, customElement, showDialog } from 'solid-ui'
import type { ResourceCopyCollision } from 'solid-logic'
import { html } from 'lit'
import { property } from 'lit/decorators.js'
import styles from './FolderPaneCopyCollisionDialog.styles.css'

import 'solid-ui/components/button'
import 'solid-ui/components/dialog'
import 'solid-ui/components/dialog-content'
import 'solid-ui/components/dialog-footer'
import 'solid-ui/components/dialog-header'

export type CopyCollisionChoice = 'replace' | 'keep-both' | 'cancel'

@customElement('folder-pane-copy-collision-dialog')
export class FolderPaneCopyCollisionDialog extends DialogComponent<CopyCollisionChoice> {
  static styles = styles

  @property({ type: Boolean, attribute: 'is-container' })
  accessor isContainer = false

  @property({ type: String, attribute: 'resource-name' })
  accessor resourceName = 'resource'

  private cancel = () => this.close('cancel')

  private choose = (choice: CopyCollisionChoice) => () => this.close(choice)

  protected firstUpdated () {
    requestAnimationFrame(() => {
      this.renderRoot
        .querySelector<HTMLElement>('solid-ui-button[data-copy-choice="keep-both"]')
        ?.shadowRoot
        ?.querySelector<HTMLButtonElement>('button')
        ?.focus()
    })
  }

  protected render () {
    const resourceType = this.isContainer ? 'folder' : 'file'
    const description = this.isContainer
      ? `A folder named “${this.resourceName}” already exists here. Folders cannot be merged. Keep both folders or cancel the copy.`
      : `A file named “${this.resourceName}” already exists here. Choose whether to replace it or keep both files.`

    return html`
      <solid-ui-dialog>
        <solid-ui-dialog-header slot="header" class="folder-pane-copy-collision-dialog-header">
          <h1>Copy ${resourceType} conflict</h1>
        </solid-ui-dialog-header>
        <solid-ui-dialog-content>
          <p>${description}</p>
        </solid-ui-dialog-content>
        <solid-ui-dialog-footer>
          ${this.isContainer
            ? html`
              <solid-ui-button
                data-copy-choice="keep-both"
                @click=${this.choose('keep-both')}
              >
                Keep both folders
              </solid-ui-button>
              <solid-ui-button
                variant="secondary"
                data-copy-choice="cancel"
                @click=${this.cancel}
              >
                Cancel
              </solid-ui-button>
            `
            : html`
              <solid-ui-button
                data-copy-choice="replace"
                @click=${this.choose('replace')}
              >
                Replace existing file
              </solid-ui-button>
              <solid-ui-button
                variant="secondary"
                data-copy-choice="keep-both"
                @click=${this.choose('keep-both')}
              >
                Keep both files
              </solid-ui-button>
              <solid-ui-button
                variant="secondary"
                data-copy-choice="cancel"
                @click=${this.cancel}
              >
                Cancel
              </solid-ui-button>
            `}
        </solid-ui-dialog-footer>
      </solid-ui-dialog>
    `
  }
}

export function requestCopyCollision (collision: ResourceCopyCollision): Promise<CopyCollisionChoice> {
  const segments = new URL(collision.destination).pathname.split('/').filter(Boolean)
  let resourceName = segments[segments.length - 1] ?? 'resource'
  try {
    resourceName = decodeURIComponent(resourceName)
  } catch {
    // Keep the URI-encoded name when it is malformed.
  }

  return new Promise(resolve => {
    showDialog(FolderPaneCopyCollisionDialog, {
      props: {
        isContainer: collision.isContainer,
        resourceName
      },
      onClose: choice => resolve(choice ?? 'cancel')
    })
  })
}
