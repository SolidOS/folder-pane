import { css, html, LitElement, type PropertyValues } from 'lit'
import { provide } from '@lit/context'
import { customElement, property } from 'lit/decorators.js'
import type { NamedNode } from 'rdflib'
import {
  folderPaneContext,
  type FolderPaneContext,
  type FolderPaneViewMode
} from '../../primitives/context'

function createContextValue (): FolderPaneContext {
  return {
    rootResource: undefined,
    displayedResource: undefined,
    activeContainer: undefined,
    view: 'grid',
    searchQuery: '',
    canCreate: false
  }
}

@customElement('folder-pane-provider')
export default class FolderPaneProvider extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }
  `

  @property({ attribute: false })
  accessor rootResource: NamedNode | undefined = undefined

  @property({ attribute: false })
  accessor displayedResource: NamedNode | undefined = undefined

  @property({ attribute: false })
  accessor activeContainer: NamedNode | undefined = undefined

  @property()
  accessor view: FolderPaneViewMode = 'grid'

  @property()
  accessor searchQuery = ''

  @property({ type: Boolean })
  accessor canCreate = false

  @provide({ context: folderPaneContext })
  accessor contextValue: FolderPaneContext = createContextValue()

  protected willUpdate (changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties)
    if (
      changedProperties.has('rootResource') ||
      changedProperties.has('displayedResource') ||
      changedProperties.has('activeContainer') ||
      changedProperties.has('view') ||
      changedProperties.has('searchQuery') ||
      changedProperties.has('canCreate')
    ) {
      this.contextValue = {
        rootResource: this.rootResource,
        displayedResource: this.displayedResource,
        activeContainer: this.activeContainer,
        view: this.view,
        searchQuery: this.searchQuery,
        canCreate: this.canCreate
      }
    }
  }

  render () {
    return html`<slot></slot>`
  }
}
