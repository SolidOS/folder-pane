import styles from './StorageContentView.styles.css'
import { customElement, WebComponent } from 'solid-ui'
import { html } from 'lit'

@customElement('storage-content-view')
export default class StorageContentView extends WebComponent {
  static styles = styles

  render () {
    return html`
      <div class="storage-content-view">
        <slot></slot>
      </div>
    `
  }
}
