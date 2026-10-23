import { customElement, WebComponent } from 'solid-ui'
import { html } from 'lit'
import styles from './FolderPaneContent.styles.css'

@customElement('folder-pane-content')
export default class FolderPaneContent extends WebComponent {
  static styles = styles

  render () {
    return html`
      <slot></slot>
    `
  }
}
