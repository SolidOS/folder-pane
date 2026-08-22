import { customElement, WebComponent } from 'solid-ui'
import { html } from 'lit'

@customElement('storage-content-view')
export default class StorageContentView extends WebComponent {


  render() {
    return html`
      <div class="storage-content-view">
        <slot></slot>
      </div>
    `
  }
}