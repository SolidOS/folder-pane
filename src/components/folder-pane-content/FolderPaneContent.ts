import { customElement, WebComponent } from 'solid-ui'
import { html } from 'lit'

@customElement('folder-pane-content')
export default class FolderPaneContent extends WebComponent {


  render() {
    return html`
      <div class="folder-pane-content">
        <slot></slot>
      </div>
    `
  }
}
