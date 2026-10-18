import { composeExplorer, customElement, FILE_EXPLORER_BACK_EVENT, FILE_EXPLORER_OPEN_PANE_EVENT, getRelevantPanes, isExplorerEvent, log, ns, WebComponent } from 'solid-ui'
import { html, nothing } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import type { DataBrowserContext, PaneDefinition } from 'pane-registry'
import '../folder-pane-container'
import '../folder-pane-sidebar'
import '../folder-pane-content'
import '../folder-pane-storage-header'
import type { NamedNode } from 'rdflib'
import 'solid-ui/components/file-explorer-provider'
import type FileExplorerProvider from 'solid-ui/components/file-explorer-provider'
import 'solid-ui/components/error-state'
import 'solid-ui/components/file-explorer-header'
import type FolderPaneContainer from '../folder-pane-container/FolderPaneContainer'
import { getIndexedContainer, isAccessDeniedError, isContainerResource, isJavaScriptFile, type FolderPaneResourceLogic } from '../../helpers'

type CreatedResource = {
  container: NamedNode
  containedResource: NamedNode
  /** Omit to refresh listings without changing the content view (uploads). */
  newInstance?: NamedNode
  pane?: PaneDefinition
}

type ExplorerRenderOptions = {
  paneOptions?: unknown
  isCurrent?: () => boolean
  showHeader?: boolean
}

@customElement('folder-pane-view')
export default class FolderPaneView extends WebComponent {
  @property({ attribute: false })
  accessor browserContext: DataBrowserContext | undefined = undefined

  private get store () {
    return this.browserContext?.session.store
  }

  @property({ attribute: false })
  accessor subject: NamedNode | undefined = undefined

  private get resourceLogic (): FolderPaneResourceLogic | undefined {
    return this.browserContext?.session.logic.resource as FolderPaneResourceLogic | undefined
  }

  @property({ type: Boolean, attribute: 'full-view' })
  accessor fullView = false

  @state()
  accessor selectedResource: NamedNode | undefined = undefined

  @state()
  accessor containerView: 'grid' | 'list' = 'grid'

  @state()
  accessor searchQuery = ''

  @state()
  private accessor contentError: { title: string, message: string } | undefined = undefined

  private initialLoadGeneration = 0
  private renderGeneration = 0

  @query('folder-pane-content')
  private accessor contentView: HTMLElement | null = null

  @query('.folder-pane-full-view')
  private accessor fullViewTarget: HTMLElement | null = null

  @query('folder-pane-sidebar')
  private accessor sidebar: (HTMLElement & { refreshResources?: (container?: NamedNode) => void }) | null = null

  /** Top-of-content area for pane creation progress, errors and setup UI. */
  @query('.folder-pane-status')
  accessor statusArea: HTMLElement | null = null

  protected createRenderRoot () {
    return this
  }

  protected updated (changedProperties: PropertyValues<this>) {
    if (
      (changedProperties.has('subject') || changedProperties.has('browserContext')) &&
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

  // Lit never renders inside these targets; panes, explorers and containers
  // are inserted imperatively, and Lit-rendered errors sit beside them.
  private get resourceTarget () {
    return this.fullView ? this.fullViewTarget : this.contentView
  }

  private showContentError (error: { title: string, message: string }) {
    this.resourceTarget?.replaceChildren()
    this.contentError = error
  }

  private renderAccessDeniedScreen () {
    this.showContentError({
      title: 'Access denied',
      message: 'You do not have access to the contents of this container.'
    })
  }

  private clearContentError = () => {
    this.contentError = undefined
  }

  /**
   * Select the resource returned by a pane's mintNew implementation. Some
   * panes (notably long chat) mint a resource inside the new document rather
   * than the container URI itself, so routing this through the normal
   * selection path is important.
   */
  openCreatedResource (resource: NamedNode, pane?: PaneDefinition) {
    this.searchQuery = ''
    // Some minting panes (e.g. Dokieli) delegate viewing to another pane and
    // have no render(); let the relevant-pane lookup choose in that case.
    this.showSubject(resource, typeof pane?.render === 'function' ? pane : undefined)
  }

  /**
   * The storage header belongs to the explorer, while its actions apply to
   * the container currently being viewed. A document selection has no
   * writable container of its own, so retain the explorer's root in that
   * case.
   */
  getActiveContainer (): NamedNode | undefined {
    const selected = this.selectedResource
    if (selected && this.resourceLogic && isContainerResource(selected, this.resourceLogic)) {
      return selected
    }
    return this.subject
  }

  clearContentForCreation () {
    this.resourceTarget?.replaceChildren()
  }

  /**
   * Reload the server-backed container listing after a pane minted a new
   * resource, refresh the sidebar and container view, then open the result.
   */
  async showCreatedResource ({ container, containedResource, newInstance, pane }: CreatedResource) {
    const store = this.store
    if (!store) return
    const reload = async (resource: NamedNode) => {
      try {
        await store.fetcher.load(resource, { force: true, clearPreviousData: true })
      } catch (error) {
        log.warn('Unable to reload ' + resource.uri + ': ' + error)
      }
    }
    await reload(container)
    if (!store.holds(container, ns.ldp('contains'), containedResource, container.doc())) {
      // Keep the new resource reachable even if the listing has not caught up.
      store.add(container, ns.ldp('contains'), containedResource, container.doc())
    }
    if (containedResource.uri.endsWith('/')) {
      await reload(containedResource)
      // Panes may probe their new documents before writing them; forget those
      // cached 404s so rendering loads what the pane actually created.
      const members = store.each(containedResource, ns.ldp('contains'), undefined, containedResource.doc())
      for (const member of members) {
        if (member.termType === 'NamedNode' && store.fetcher.getState(member.value) === 'failed') {
          store.fetcher.unload(member as NamedNode)
        }
      }
    }

    this.sidebar?.refreshResources?.(container)
    const containerView = this.resourceTarget?.querySelector('folder-pane-container') as
      (HTMLElement & { refresh?: () => void }) | null
    containerView?.refresh?.()
    if (newInstance) this.openCreatedResource(newInstance, pane)
  }

  private renderContainerView (selectedResource: NamedNode) {
    const target = this.resourceTarget
    if (!target) return

    this.contentError = undefined
    const containerView = document.createElement('folder-pane-container') as FolderPaneContainer

    containerView.subject = selectedResource
    containerView.resourceLogic = this.resourceLogic ?? null
    containerView.browserContext = this.browserContext
    containerView.view = this.containerView
    containerView.searchQuery = this.searchQuery
    containerView.hideRootSpecialFolders = this.subject
      ? selectedResource.sameTerm(this.subject)
      : false

    target.replaceChildren(containerView)
  }

  private async showInitialContainer (subject: NamedNode) {
    const generation = ++this.initialLoadGeneration

    if (isJavaScriptFile(subject)) {
      this.showSubject(subject)
      return
    }

    if (!this.store || !this.resourceLogic) return

    try {
      await this.store.fetcher.load(subject)
    } catch (error) {
      if (generation !== this.initialLoadGeneration || !this.subject?.sameTerm(subject)) return
      if (isAccessDeniedError(error)) {
        const target = this.resourceTarget
        if (target) this.renderAccessDeniedScreen()
        return
      }
      log.error('Unable to load storage container: ' + error)
      return
    }

    if (generation !== this.initialLoadGeneration || !this.subject?.sameTerm(subject)) return
    this.sidebar?.refreshResources?.()
    if (!this.selectedResource) {
      this.renderContainerView(subject)
    }
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

    const relevantPanes = await getRelevantPanes(subject, this.browserContext, {
      excludedPaneNames: ['sharing'],
      fallbackPaneName: 'internal'
    })
    if (options.isCurrent && !options.isCurrent()) return
    const selectedPane = pane || this.getPaneForSubject(subject, relevantPanes)
    if (!selectedPane) {
      this.renderExplorerError(subject, 'No pane is available to display this resource.')
      return
    }

    let paneElement: HTMLElement
    try {
      paneElement = selectedPane.render(subject, this.browserContext, options.paneOptions || {})
    } catch (error) {
      log.error('Unable to render selected pane: ' + error)
      this.renderExplorerError(subject, 'The selected pane could not render this resource.')
      return
    }

    const provider = target.ownerDocument.createElement('solid-ui-file-explorer-provider') as FileExplorerProvider
    const menuItems = relevantPanes
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
      if (!isExplorerEvent(event, provider)) return
      event.stopPropagation()
      this.renderGeneration++
      this.selectedResource = undefined
      this.renderContainerView(this.subject || subject)
    })
    provider.addEventListener(FILE_EXPLORER_OPEN_PANE_EVENT, event => {
      if (!isExplorerEvent(event, provider)) return
      event.stopPropagation()
      const paneName = (event as CustomEvent<{ paneName: string }>).detail?.paneName
      const nextPane = paneName ? this.browserContext?.session.paneRegistry.byName(paneName) : undefined
      if (nextPane) {
        this.renderExplorerInto(target, subject, nextPane, options).catch(error => {
          log.error('Unable to switch selected pane: ' + error)
        })
      }
    })

    composeExplorer(provider, {
      context: this.browserContext,
      subjectUri: subject.uri,
      pane: selectedPane,
      relevantPanes,
      header: options.showHeader === false
        ? undefined
        : { paneIcon: selectedPane.icon, menuItems },
      paneElement
    })
    this.contentError = undefined
    target.replaceChildren(provider)
  }

  private renderExplorerError (subject: NamedNode, message: string) {
    this.showContentError({ title: message, message: subject.uri })
  }

  private async showResourceInContentView (
    selectedResource: NamedNode,
    pane?: PaneDefinition,
    indexRequested = false
  ) {
    const renderGeneration = ++this.renderGeneration

    try {
      const target = this.resourceTarget
      if (!target || !this.store || !this.resourceLogic) return

      const isCurrentSelection = (candidate: NamedNode) =>
        renderGeneration === this.renderGeneration &&
        this.selectedResource?.sameTerm(candidate) === true

      if (!isCurrentSelection(selectedResource)) return

      if (this.subject?.sameTerm(selectedResource) && !indexRequested && !isJavaScriptFile(selectedResource)) {
        this.renderContainerView(selectedResource)
        return
      }

      if (isContainerResource(selectedResource, this.resourceLogic)) {
        try {
          await this.store.fetcher.load(selectedResource)
        } catch (error) {
          if (!isCurrentSelection(selectedResource)) return
          if (isAccessDeniedError(error)) {
            this.renderAccessDeniedScreen()
            return
          }
          log.error('Unable to load selected container: ' + error)
          this.renderContainerView(selectedResource)
          return
        }

        if (!isCurrentSelection(selectedResource)) return
        this.sidebar?.refreshResources?.()

        if (indexRequested || this.resourceLogic.containerHasIndexDocument(selectedResource)) {
          const indexThing = this.resourceLogic.getContainerIndexThing(selectedResource)
          try {
            await this.store.fetcher.load(indexThing.doc())
          } catch (error) {
            if (!isCurrentSelection(selectedResource)) return
            if (isAccessDeniedError(error)) {
              this.renderAccessDeniedScreen()
              return
            }
            log.error('Unable to load container index document: ' + error)
          }
          target.replaceChildren()
          await this.renderExplorerInto(target, indexThing, pane, {
            isCurrent: () => isCurrentSelection(selectedResource),
            showHeader: false
          })
          return
        }

        this.renderContainerView(selectedResource)
        return
      }

      try {
        await this.store.fetcher.load(selectedResource)
      } catch (error) {
        if (!isCurrentSelection(selectedResource)) return
        if (isAccessDeniedError(error)) {
          this.renderAccessDeniedScreen()
          return
        }
        log.warn('Unable to load selected resource metadata: ' + error)
      }

      if (!isCurrentSelection(selectedResource)) return
      target.replaceChildren()
      const sourcePane = isJavaScriptFile(selectedResource)
        ? this.browserContext?.session.paneRegistry.byName('source')
        : undefined
      if (!pane && isJavaScriptFile(selectedResource) && !sourcePane) {
        this.renderExplorerError(selectedResource, 'The Source pane is unavailable to display this JavaScript file.')
        return
      }
      await this.renderExplorerInto(target, selectedResource, pane || sourcePane, {
        isCurrent: () => isCurrentSelection(selectedResource)
      })
    } catch (error) {
      log.error('Unable to render selected resource: ' + error)
      if (renderGeneration === this.renderGeneration && this.resourceTarget) {
        if (isAccessDeniedError(error)) {
          this.renderAccessDeniedScreen()
          return
        }
        this.renderExplorerError(selectedResource, 'Unable to display the selected resource.')
      }
    }
  }

  private showSubject (resource: NamedNode, pane?: PaneDefinition) {
    // `container/index.ttl#this` is rendered exactly like selecting its container,
    // so indexed panes never show the file-explorer header on either route.
    const indexedContainerUri = getIndexedContainer(resource)
    const indexedContainer = indexedContainerUri && this.store
      ? this.store.sym(indexedContainerUri)
      : undefined
    const subject = indexedContainer ?? resource
    this.selectedResource = subject
    // Render directly so re-selecting the same resource still replaces the content target.
    void this.showResourceInContentView(subject, pane, !!indexedContainer)
  }

  private handleResourceSelected = (event: CustomEvent<{ resource: NamedNode }>) => {
    const resource = event.detail?.resource
    if (!resource) return
    event.stopPropagation()
    this.searchQuery = ''
    this.showSubject(resource)
  }

  private handleResourceOpenPane = (event: CustomEvent<{ resource: NamedNode, paneName: string }>) => {
    const resource = event.detail?.resource
    const paneName = event.detail?.paneName
    const pane = paneName ? this.browserContext?.session.paneRegistry.byName(paneName) : undefined
    if (!resource || !pane) return
    event.stopPropagation()
    this.searchQuery = ''
    // Some minting panes (e.g. Dokieli) delegate viewing to another pane and
    // have no render(); let the relevant-pane lookup choose in that case.
    this.showSubject(resource, typeof pane?.render === 'function' ? pane : undefined)
  }

  private setContainerView (view: 'grid' | 'list') {
    this.containerView = view
    const container = this.resourceTarget?.querySelector('folder-pane-container') as FolderPaneContainer | null
    if (container) container.view = view
  }

  private handleSelectHome = () => {
    this.searchQuery = ''
    if (this.subject) this.showSubject(this.subject)
  }

  private handleSearch = (event: CustomEvent<{ query: string }>) => {
    event.stopPropagation()
    this.searchQuery = event.detail?.query || ''
    const container = this.resourceTarget?.querySelector('folder-pane-container') as FolderPaneContainer | null
    if (container) container.searchQuery = this.searchQuery
  }

  private handleSelectBreadcrumbResource = (event: CustomEvent<{ resource: NamedNode }>) => {
    const resource = event.detail?.resource
    if (!resource) return
    event.stopPropagation()
    this.showSubject(resource)
  }

  private handleContainerViewChange = (event: CustomEvent<{ view: 'grid' | 'list' }>) => {
    const view = event.detail?.view
    if (!view) return
    event.stopPropagation()
    this.setContainerView(view)
  }

  render () {
    if (this.fullView) {
      return html`
        ${this.renderContentError()}
        <div
          class="folder-pane-full-view"
          ?hidden=${!!this.contentError}
          @resource-selected=${this.handleResourceSelected}
          @resource-open-pane=${this.handleResourceOpenPane}
        ></div>
      `
    }

    return html`
      <folder-pane-storage-header
        .subject=${this.subject}
        .selectedResource=${this.selectedResource ?? this.subject}
        .browserContext=${this.browserContext}
        .paneList=${this.browserContext?.session.paneRegistry.list ?? []}
        .view=${this.containerView}
        .searchQuery=${this.searchQuery}
        @folder-pane-select-home=${this.handleSelectHome}
        @folder-pane-select-resource=${this.handleSelectBreadcrumbResource}
        @folder-pane-change-view=${this.handleContainerViewChange}
        @folder-pane-search=${this.handleSearch}
      ></folder-pane-storage-header>
      <div
        class="folder-pane-main-content"
        @resource-selected=${this.handleResourceSelected}
        @resource-open-pane=${this.handleResourceOpenPane}
      >
        <folder-pane-sidebar
          .store=${this.store}
          .resourceLogic=${this.resourceLogic}
          .subject=${this.subject}
          .selectedResource=${this.selectedResource ?? this.subject}
        ></folder-pane-sidebar>
        <div class="folder-pane-content-column">
          <div class="folder-pane-status"></div>
          ${this.renderContentError()}
          <folder-pane-content ?hidden=${!!this.contentError}></folder-pane-content>
        </div>
      </div>
    `
  }

  private renderContentError () {
    if (this.contentError) {
      return html`
        <div class="folder-pane-resource-error" role="status">
          <solid-ui-error-state
            .title=${this.contentError.title}
            .message=${this.contentError.message}
            @close=${this.clearContentError}
          ></solid-ui-error-state>
        </div>
      `
    }

    return nothing
  }
}
