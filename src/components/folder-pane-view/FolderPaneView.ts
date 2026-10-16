import { customElement, FILE_EXPLORER_BACK_EVENT, FILE_EXPLORER_OPEN_PANE_EVENT, log, login, ns, WebComponent } from 'solid-ui'
import { html } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import type { DataBrowserContext, PaneDefinition } from 'pane-registry'
import '../folder-pane-container'
import '../folder-pane-sidebar'
import '../folder-pane-content'
import type { LiveStore, NamedNode } from 'rdflib'
import type { SolidLogic } from 'solid-logic'
import 'solid-ui/components/file-explorer-provider'
import 'solid-ui/components/file-explorer-header'
import '~icons/lucide/layout-grid'
import '~icons/lucide/list'
import type FolderPaneContainer from '../folder-pane-container/FolderPaneContainer'

type ExplorerRenderOptions = {
  paneOptions?: unknown
  isCurrent?: () => boolean
}

@customElement('folder-pane-view')
export default class FolderPaneView extends WebComponent {
  @property({ attribute: false })
  accessor dom: HTMLDocument | null = null

  @property({ attribute: false })
  accessor browserContext: DataBrowserContext | undefined = undefined

  @property({ attribute: false })
  accessor store: LiveStore | null = null

  @property({ attribute: false })
  accessor subject: NamedNode | undefined = undefined

  @property({ attribute: false })
  accessor resourceLogic: SolidLogic['resource'] | null = null

  @property({ type: Boolean, attribute: 'full-view' })
  accessor fullView = false

  @state()
  accessor selectedResource: NamedNode | undefined = undefined

  @state()
  accessor containerView: 'grid' | 'list' = 'grid'

  private initialLoadGeneration = 0
  private renderGeneration = 0

  @query('folder-pane-content')
  private accessor contentView: HTMLElement | null = null

  @query('.folder-pane-full-view')
  private accessor fullViewTarget: HTMLElement | null = null

  @query('folder-pane-sidebar')
  private accessor sidebar: (HTMLElement & { refreshResources?: () => void }) | null = null

  protected createRenderRoot () {
    return this
  }

  protected updated (changedProperties: PropertyValues<this>) {
    if (
      (changedProperties.has('subject') || changedProperties.has('store') || changedProperties.has('resourceLogic')) &&
      this.subject
    ) {
      if (changedProperties.has('subject')) {
        this.selectedResource = undefined
        this.renderGeneration++
      }
      void this.showInitialContainer(this.subject)
      return
    }

    if (changedProperties.has('fullView') && changedProperties.get('fullView') !== undefined) {
      if (this.selectedResource) {
        void this.showResourceInContentView(this.selectedResource)
      } else if (this.subject) {
        this.renderContainerView(this.subject)
      }
    }
  }

  private get resourceTarget () {
    return this.fullView ? this.fullViewTarget : this.contentView
  }

  private renderContainerView (selectedResource: NamedNode) {
    const target = this.resourceTarget
    if (!target) return

    const containerView = document.createElement('folder-pane-container') as FolderPaneContainer

    containerView.subject = selectedResource
    containerView.resourceLogic = this.resourceLogic
    containerView.view = this.containerView

    target.replaceChildren(containerView)
  }

  private async showInitialContainer (subject: NamedNode) {
    const generation = ++this.initialLoadGeneration

    if (!this.store || !this.resourceLogic) return

    try {
      await this.store.fetcher.load(subject)
    } catch (error) {
      if (generation !== this.initialLoadGeneration || !this.subject?.sameTerm(subject)) return
      log.error('Unable to load storage container: ' + error)
      return
    }

    if (generation !== this.initialLoadGeneration || !this.subject?.sameTerm(subject)) return
    this.sidebar?.refreshResources?.()
    if (!this.selectedResource) {
      this.renderContainerView(subject)
    }
  }

  private async getRelevantPanes (subject: NamedNode): Promise<PaneDefinition[]> {
    const paneRegistry = this.browserContext?.session.paneRegistry
    if (!paneRegistry || !this.browserContext) return []

    const relevantPanes = paneRegistry.list.filter(
      pane => pane.label(subject, this.browserContext as DataBrowserContext) && !pane.global && pane.name !== 'sharing'
    )
    if (relevantPanes.length === 0) {
      const internalPane = paneRegistry.byName('internal')
      return internalPane ? [internalPane] : []
    }

    const filteredPanes = await login.filterAvailablePanes(relevantPanes)
    return filteredPanes.length > 0 ? filteredPanes : [relevantPanes[0]]
  }

  private getPaneForSubject (subject: NamedNode, relevantPanes: PaneDefinition[]) {
    const mintClass = this.store && (
      this.store.any(subject, ns.ui('mintClass'), undefined, subject.doc()) ||
      this.store.any(subject.doc(), ns.ui('mintClass'), undefined, subject.doc())
    )
    if (mintClass) {
      const mintClassPane = relevantPanes.find(pane => pane.mintClass?.sameTerm(mintClass))
      if (mintClassPane) return mintClassPane
    }

    return relevantPanes.find(candidate => candidate.shouldGetFocus?.(subject)) || relevantPanes[0]
  }

  private async renderExplorerInto (
    target: HTMLElement,
    subject: NamedNode,
    pane: PaneDefinition | undefined,
    options: ExplorerRenderOptions = {}
  ) {
    if (!this.browserContext) return

    const relevantPanes = await this.getRelevantPanes(subject)
    if (options.isCurrent && !options.isCurrent()) return
    const selectedPane = pane || this.getPaneForSubject(subject, relevantPanes)
    if (!selectedPane) return

    let paneElement: HTMLElement
    try {
      paneElement = selectedPane.render(subject, this.browserContext, options.paneOptions || {})
      paneElement.classList.add('paneDiv')
    } catch (error) {
      log.error('Unable to render selected pane: ' + error)
      return
    }

    const provider = document.createElement('solid-ui-file-explorer-provider') as HTMLElement & {
      context?: DataBrowserContext
      subjectUri?: string
      relevantPanes?: PaneDefinition[]
      pane?: PaneDefinition
    }
    provider.context = this.browserContext
    provider.subjectUri = subject.uri
    provider.relevantPanes = relevantPanes
    provider.pane = selectedPane

    const header = document.createElement('solid-ui-file-explorer-header') as HTMLElement & {
      paneIcon?: string
      menuItems?: Array<{ label: string, action: (event: Event) => void }>
    }
    header.paneIcon = selectedPane.icon
    header.menuItems = relevantPanes
      .map(candidate => {
        const label = candidate.label(subject, this.browserContext as DataBrowserContext)
        if (!label) return undefined
        return {
          label,
          action: (_event: Event) => {
            provider.dispatchEvent(new CustomEvent(FILE_EXPLORER_OPEN_PANE_EVENT, {
              bubbles: true,
              composed: true,
              detail: { subjectUri: subject.uri, paneName: candidate.name }
            }))
          }
        }
      })
      .filter((item): item is { label: string, action: (event: Event) => void } => item !== undefined)

    provider.addEventListener(FILE_EXPLORER_BACK_EVENT, event => {
      event.stopPropagation()
      this.renderGeneration++
      this.selectedResource = undefined
      this.renderContainerView(this.subject || subject)
    })
    provider.addEventListener(FILE_EXPLORER_OPEN_PANE_EVENT, event => {
      event.stopPropagation()
      const paneName = (event as CustomEvent<{ paneName: string }>).detail?.paneName
      const nextPane = paneName ? this.browserContext?.session.paneRegistry.byName(paneName) : undefined
      if (nextPane) {
        this.renderExplorerInto(target, subject, nextPane, options).catch(error => {
          log.error('Unable to switch selected pane: ' + error)
        })
      }
    })

    provider.replaceChildren(header, paneElement)
    target.replaceChildren(provider)
  }

  private async showResourceInContentView (selectedResource: NamedNode) {
    const renderGeneration = ++this.renderGeneration

    try {
      const target = this.resourceTarget
      if (!target || !this.store || !this.resourceLogic) return

      const isCurrentSelection = (candidate: NamedNode) =>
        renderGeneration === this.renderGeneration &&
        this.selectedResource?.sameTerm(candidate) === true

      if (!isCurrentSelection(selectedResource)) return

      if (this.subject?.sameTerm(selectedResource)) {
        this.renderContainerView(selectedResource)
        return
      }

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
        this.sidebar?.refreshResources?.()

        if (this.resourceLogic.containerHasIndexDocument(selectedResource)) {
          const indexThing = this.resourceLogic.getContainerIndexThing(selectedResource)
          try {
            await this.store.fetcher.load(indexThing.doc())
          } catch (error) {
            if (!isCurrentSelection(selectedResource)) return
            log.error('Unable to load container index document: ' + error)
          }
          target.replaceChildren()
          await this.renderExplorerInto(target, indexThing, undefined, {
            isCurrent: () => isCurrentSelection(selectedResource)
          })
          return
        }

        this.renderContainerView(selectedResource)
        return
      }

      target.replaceChildren()
      await this.renderExplorerInto(target, selectedResource, undefined, {
        isCurrent: () => isCurrentSelection(selectedResource)
      })
    } catch (error) {
      log.error('Unable to render selected resource: ' + error)
    }
  }

  private handleResourceSelected = (event: CustomEvent<{ resource: NamedNode }>) => {
    const resource = event.detail?.resource
    if (!resource) return
    event.stopPropagation()

    this.selectedResource = resource
    // Render directly so re-selecting the same resource still replaces the content target.
    void this.showResourceInContentView(resource)
  }

  private setContainerView (view: 'grid' | 'list') {
    this.containerView = view
    const container = this.resourceTarget?.querySelector<FolderPaneContainer>('folder-pane-container')
    if (container) container.view = view
  }

  render () {
    if (this.fullView) {
      return html`
        <div class="folder-pane-full-view" @resource-selected=${this.handleResourceSelected}></div>
      `
    }

    return html`
      <div class="folder-pane-view-controls" role="group" aria-label="Container view">
        <button
          type="button"
          aria-label="Grid view"
          aria-pressed=${String(this.containerView === 'grid')}
          @click=${() => this.setContainerView('grid')}
        >
          <icon-lucide-layout-grid aria-hidden="true"></icon-lucide-layout-grid>
        </button>
        <button
          type="button"
          aria-label="List view"
          aria-pressed=${String(this.containerView === 'list')}
          @click=${() => this.setContainerView('list')}
        >
          <icon-lucide-list aria-hidden="true"></icon-lucide-list>
        </button>
      </div>
      <div class="folder-pane-main-content" @resource-selected=${this.handleResourceSelected}>
        <folder-pane-sidebar
          .dom=${this.dom}
          .store=${this.store}
          .resourceLogic=${this.resourceLogic}
          .subject=${this.subject}
          .selectedResource=${this.selectedResource ?? this.subject}
        ></folder-pane-sidebar>
        <div class="folder-pane-content-column">
          <folder-pane-content></folder-pane-content>
        </div>
      </div>
    `
  }
}
