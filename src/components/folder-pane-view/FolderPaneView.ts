import { customElement, log, WebComponent } from 'solid-ui'
import { html } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import '../folder-pane-container'
import '../folder-pane-sidebar'
import '../folder-pane-content'
import type { LiveStore, NamedNode } from 'rdflib'
import type { StoragePaneOutliner } from '../../types'
import type { SolidLogic } from 'solid-logic'


@customElement('folder-pane-view')
export default class FolderPaneView extends WebComponent {
  @property({ attribute: false })
  accessor dom: HTMLDocument | null = null

  @property({ attribute: false })
  accessor outliner: StoragePaneOutliner | undefined = undefined

  @property({ attribute: false })
  accessor store: LiveStore | null = null

  @property({ attribute: false })
  accessor subject: NamedNode | undefined = undefined

  @property({ attribute: false })
  accessor resourceLogic: SolidLogic['resource'] | null = null

  @state()
  accessor selectedResource: NamedNode | undefined = undefined

  private renderGeneration = 0

  @query('folder-pane-content')
  private accessor contentView: HTMLElement | null = null

  protected createRenderRoot () {
    return this
  }

  protected updated (changedProperties: PropertyValues<this>) {
    if (changedProperties.has('selectedResource') && this.selectedResource) {
      void this.showResourceInContentView(this.selectedResource)
    }
  }

  private renderContainerView (selectedResource: NamedNode) {
    if (!this.contentView) return

    const containerView = document.createElement('folder-pane-container') as HTMLElement & {
      subject?: NamedNode
      resourceLogic?: SolidLogic['resource'] | null
    }

    containerView.subject = selectedResource
    containerView.resourceLogic = this.resourceLogic

    this.contentView.replaceChildren(containerView)
  }

  private async showResourceInContentView (selectedResource: NamedNode) {
    const renderGeneration = ++this.renderGeneration

    try {
      if (!this.contentView || !this.store || !this.resourceLogic) return

      const isCurrentSelection = (candidate: NamedNode) =>
        renderGeneration === this.renderGeneration &&
        this.selectedResource?.sameTerm(candidate) === true

      if (!isCurrentSelection(selectedResource)) return

      if (this.resourceLogic.isContainer(selectedResource)) {
        try {
          await this.store.fetcher.load(selectedResource)
        } catch (error) {
          if (!isCurrentSelection(selectedResource)) return
          log.error('Unable to load selected container: ' + error)
          this.renderContainerView(selectedResource)
          return
        }

        if (!isCurrentSelection(selectedResource)) return

        if (this.resourceLogic.containerHasIndexDocument(selectedResource)) {
          const indexThing = this.resourceLogic.getContainerIndexThing(selectedResource)
          this.contentView.replaceChildren()
          this.outliner?.GotoSubject(indexThing, true, undefined, false, undefined, this.contentView)
          return
        }

        this.renderContainerView(selectedResource)
        return
      }

      this.contentView.replaceChildren()
      this.outliner?.GotoSubject(selectedResource, true, undefined, false, undefined, this.contentView)
    } catch (error) {
      log.error('Unable to render selected resource: ' + error)
    }
  }

  private handleResourceSelected = (event: CustomEvent<{ resource: NamedNode }>) => {
    if (!event.detail?.resource) return

    this.selectedResource = event.detail.resource
  }

  render () {
    return html`
      <div class="folder-pane-main-content" @resource-selected=${this.handleResourceSelected}>
        <div class="folder-pane-section">
          <folder-pane-sidebar
            .dom=${this.dom}
            .store=${this.store}
            .resourceLogic=${this.resourceLogic}
            .subject=${this.subject}
            ></folder-pane-sidebar>
          <folder-pane-content></folder-pane-content>
        </div>
      </div>
    `
  }
}
