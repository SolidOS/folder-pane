import { aclControl, composeExplorer, customElement, FILE_EXPLORER_BACK_EVENT, FILE_EXPLORER_OPEN_PANE_EVENT, getPreferredPane, getRelevantPanes, isExplorerEvent, log, ns, showDialog, WebComponent, widgets } from 'solid-ui'
import { authn, authSession } from 'solid-logic'
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
import { getIndexedApplicationSubject, getIndexedContainer, isAccessDeniedError, isContainerResource, isJavaScriptFile, type FolderPaneResourceLogic } from '../../helpers'
import { invalidateRenderRequest, isCurrentRenderRequest, type RenderRequest } from './renderRequest'
import FolderPaneCreateDialog from '../folder-pane-storage-header/FolderPaneCreateDialog'
import { getPaneLabel } from '../../helpers'
import { isSafeCreationName, invalidCreationNameMessage } from '../../creationSafety'
import { mintPaneInstance, PaneMintError, setMintStatus } from '../../mintPaneInstance'
import * as debug from '../../debug'

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

  @state()
  private accessor canCreate = false

  private initialLoadGeneration = 0
  private renderGeneration = 0
  private permissionGeneration = 0
  private permissionRequest: { containerUri: string, resourceLogic: unknown } | undefined
  private creationInFlight = false
  private authListenersAttached = false
  private dropProtectionAttached = false

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

  connectedCallback () {
    super.connectedCallback()
    if (!this.dropProtectionAttached) {
      aclControl.preventBrowserDropEvents(this.ownerDocument)
      this.dropProtectionAttached = true
    }
    this.addEventListener('folder-pane-create-pane', this.handleCreatePane)
    this.addEventListener('folder-pane-upload', this.handleUpload)
    if (!this.authListenersAttached) {
      authSession.events.on('login', this.handleAuthChange)
      authSession.events.on('logout', this.handleAuthChange)
      this.authListenersAttached = true
    }
  }

  disconnectedCallback () {
    // Invalidate awaited renders before detaching listeners. A late response
    // must never replace content in a detached view.
    this.renderGeneration = invalidateRenderRequest(this.renderGeneration)
    this.initialLoadGeneration++
    this.removeEventListener('folder-pane-create-pane', this.handleCreatePane)
    this.removeEventListener('folder-pane-upload', this.handleUpload)
    if (this.authListenersAttached) {
      authSession.events.off('login', this.handleAuthChange)
      authSession.events.off('logout', this.handleAuthChange)
      this.authListenersAttached = false
    }
    super.disconnectedCallback()
  }

  private handleAuthChange = () => {
    this.refreshCreationPermission(true)
    this.requestUpdate()
  }

  private handleCreatePane = async (event: Event) => {
    event.stopPropagation()
    if (this.creationInFlight || !authn.currentUser()) return
    const pane = (event as CustomEvent<{ pane?: PaneDefinition }>).detail?.pane
    if (!pane?.mintNew) return
    const container = this.getActiveContainer()
    const dom = this.ownerDocument
    const statusArea = this.statusArea
    if (!container || !statusArea) return
    this.creationInFlight = true
    const operationGeneration = ++this.renderGeneration
    const paneName = getPaneLabel(pane)
    try {
      const name = await new Promise<string | undefined>(resolve => {
        showDialog(FolderPaneCreateDialog, {
          props: { label: paneName },
          onClose: resolve
        })
      })
      if (!name || !authn.currentUser()) return
      if (operationGeneration !== this.renderGeneration ||
        this.getActiveContainer()?.sameTerm(container) !== true) return
      if (!isSafeCreationName(name)) {
        setMintStatus(statusArea, 'error', invalidCreationNameMessage)
        return
      }
      this.clearContentForCreation()
      const created = await mintPaneInstance({
        context: this.browserContext!,
        container,
        pane,
        name,
        noun: paneName,
        statusArea,
        me: authn.currentUser() ?? undefined,
        dom
      })
      const stillOwnsNavigation = operationGeneration === this.renderGeneration &&
        this.getActiveContainer()?.sameTerm(container) === true
      await this.showCreatedResource({
        container,
        ...created,
        pane,
        newInstance: stillOwnsNavigation ? created.newInstance : undefined
      })
    } catch (error) {
      debug.error('Unable to create folder-pane resource', error)
      if (!(error instanceof PaneMintError) && this.statusArea) {
        setMintStatus(this.statusArea, 'error', `Unable to create ${paneName}: ${error instanceof Error ? error.message : String(error)}`)
      }
    } finally {
      this.creationInFlight = false
    }
  }

  private handleUpload = (event: Event) => {
    event.stopPropagation()
    if (this.creationInFlight || !authn.currentUser()) return
    const container = this.getActiveContainer()
    const statusArea = this.statusArea
    if (!container || !statusArea || !this.store) return
    const input = this.ownerDocument.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.addEventListener('change', () => {
      const files = Array.from(input.files ?? [])
      const validFiles = files.filter(file => isSafeCreationName(file.name))
      const invalidFiles = files.filter(file => !isSafeCreationName(file.name))
      invalidFiles.forEach(file => setMintStatus(statusArea, 'error', `${file.name}: ${invalidCreationNameMessage}`))
      if (!validFiles.length) return
      this.creationInFlight = true
      let remaining = validFiles.length
      let refreshes = Promise.resolve()
      setMintStatus(statusArea, 'progress', `Uploading ${validFiles.length} file${validFiles.length === 1 ? '' : 's'}`)
      const finish = () => {
        remaining--
        if (remaining === 0) {
          this.creationInFlight = false
          if (statusArea.dataset.status === 'progress') statusArea.replaceChildren()
        }
      }
      widgets.uploadFiles(
        this.store!.fetcher,
        validFiles,
        container.uri,
        container.uri,
        (_file: File, uri: string) => {
          refreshes = refreshes.then(() => this.showCreatedResource({
            container,
            containedResource: this.store!.sym(uri)
          })).finally(finish)
        },
        (_file: File, message: string) => {
          setMintStatus(statusArea, 'error', message)
          finish()
        }
      )
    })
    input.click()
  }

  protected updated (changedProperties: PropertyValues<this>) {
    if (
      (changedProperties.has('subject') || changedProperties.has('browserContext')) &&
      this.subject
    ) {
      if (changedProperties.has('subject') || changedProperties.has('browserContext')) {
        this.selectedResource = undefined
        this.renderGeneration++
        this.initialLoadGeneration++
      }
      this.refreshCreationPermission()
      void this.showInitialContainer(this.subject)
      return
    }

    if (changedProperties.has('selectedResource')) {
      this.refreshCreationPermission()
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

  private async loadResource (resource: NamedNode): Promise<void> {
    if (!this.store) return
    try {
      await this.store.fetcher.load(resource)
    } catch (error) {
      // A request made before OIDC restoration can leave a failed fetch cached.
      // The owner is allowed to retry the resource once with a clean fetcher entry.
      if (!isAccessDeniedError(error) || !authn.currentUser()) throw error
      await this.store.fetcher.load(resource, { force: true, clearPreviousData: true })
    }
  }

  private clearContentError = () => {
    this.contentError = undefined
  }

  private retryContent = () => {
    const selectedResource = this.selectedResource
    const subject = this.subject
    if (!selectedResource && !subject) return
    this.clearContentError()
    if (selectedResource) {
      void this.showResourceInContentView(selectedResource)
    } else if (subject) {
      void this.showInitialContainer(subject)
    }
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
    // Resolve the pane again from the registry. Creation menu entries can be
    // replaced while the async mint is running; retaining that stale object
    // lets a different relevant pane (notably profile for pad indexes) win.
    const currentPane = pane?.name
      ? this.browserContext?.session.paneRegistry.byName(pane.name) ?? pane
      : pane
    this.showSubject(resource, typeof currentPane?.render === 'function' ? currentPane : undefined)
  }

  /**
   * The storage header belongs to the explorer, while its actions apply to
   * the container currently being viewed. A document selection has no
   * writable container of its own, so use its parent when it remains within
   * the explorer root; otherwise retain the last browsed container.
   */
  getActiveContainer (): NamedNode | undefined {
    const selected = this.selectedResource
    if (selected && this.resourceLogic && isContainerResource(selected, this.resourceLogic)) {
      return selected
    }

    const root = this.subject
    const parent = selected?.dir()
    const rootUri = root?.uri.endsWith('/') ? root.uri : `${root?.uri}/`
    if (root && parent && rootUri && parent.uri.startsWith(rootUri)) {
      return parent
    }

    return this.subject
  }

  private refreshCreationPermission (force = false) {
    const container = this.getActiveContainer()
    const resourceLogic = this.browserContext?.session.logic.resource
    if (
      !force &&
      container &&
      resourceLogic &&
      this.permissionRequest?.containerUri === container.uri &&
      this.permissionRequest.resourceLogic === resourceLogic
    ) return

    const permissionGeneration = ++this.permissionGeneration
    this.canCreate = false
    this.permissionRequest = container && resourceLogic
      ? { containerUri: container.uri, resourceLogic }
      : undefined
    if (!container || !resourceLogic) return

    void resourceLogic.fetchMetadata(container)
      .then(metadata => {
        if (
          permissionGeneration === this.permissionGeneration &&
          this.getActiveContainer()?.sameTerm(container) === true
        ) {
          this.canCreate = metadata.access.canEdit
        }
      })
      .catch(error => {
        if (permissionGeneration === this.permissionGeneration) {
          this.permissionRequest = undefined
          debug.warn('Unable to determine folder creation permission', error)
        }
      })
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
    const navigationGeneration = this.renderGeneration
    const navigationContext = this.browserContext
    const reload = async (resource: NamedNode): Promise<boolean> => {
      try {
        await store.fetcher.load(resource, { force: true, clearPreviousData: true })
        return true
      } catch (error) {
        log.warn('Unable to reload ' + resource.uri + ': ' + error)
        return false
      }
    }
    const confirmed = await reload(container)
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
      (HTMLElement & { refresh?: () => void, addOptimisticResource?: (resource: NamedNode) => void }) | null
    if (!confirmed && containerView?.addOptimisticResource) {
      containerView.addOptimisticResource(containedResource)
    }
    if (confirmed) {
      containerView?.refresh?.()
    }
    if (
      newInstance &&
      this.isConnected &&
      this.renderGeneration === navigationGeneration &&
      this.browserContext === navigationContext
    ) {
      this.openCreatedResource(newInstance, pane)
    }
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
      await this.loadResource(subject)
    } catch (error) {
      if (generation !== this.initialLoadGeneration || !this.subject?.sameTerm(subject)) return
      if (isAccessDeniedError(error)) {
        const target = this.resourceTarget
        if (target) this.renderAccessDeniedScreen()
        return
      }
      log.error('Unable to load storage container: ' + error)
      this.showContentError({
        title: 'Unable to load this folder',
        message: 'The folder could not be loaded. Try again.'
      })
      return
    }

    if (generation !== this.initialLoadGeneration || !this.subject?.sameTerm(subject)) return
    this.sidebar?.refreshResources?.()
    this.requestUpdate()
    if (!this.selectedResource) {
      this.showSubject(subject)
    }
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
    const selectedPane = pane || getPreferredPane(subject, this.browserContext, relevantPanes)
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
        const request: RenderRequest = {
          generation: ++this.renderGeneration,
          subjectUri: subject.uri,
          context: this.browserContext
        }
        this.renderExplorerInto(target, subject, nextPane, {
          ...options,
          paneOptions: nextPane.name === 'folder'
            ? { folderView: 'container', fullView: true, solo: true }
            : options.paneOptions,
          isCurrent: () => isCurrentRenderRequest(
            request,
            this.renderGeneration,
            this.selectedResource?.uri,
            this.browserContext
          )
        }).catch(error => {
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
    if (options.isCurrent && !options.isCurrent()) return
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
      const browserContext = this.browserContext
      if (!target || !this.store || !this.resourceLogic || !browserContext) return

      const request: RenderRequest = {
        generation: renderGeneration,
        subjectUri: selectedResource.uri,
        context: this.browserContext
      }
      const isCurrentSelection = (candidate: NamedNode) =>
        isCurrentRenderRequest(
          request,
          this.renderGeneration,
          this.selectedResource?.uri,
          this.browserContext
        ) && candidate.uri === request.subjectUri

      if (!isCurrentSelection(selectedResource)) return

      if (this.subject?.sameTerm(selectedResource) && pane?.name !== 'folder' && !indexRequested && !isJavaScriptFile(selectedResource)) {
        this.renderContainerView(selectedResource)
        return
      }

      if (isContainerResource(selectedResource, this.resourceLogic)) {
        try {
          await this.loadResource(selectedResource)
        } catch (error) {
          if (!isCurrentSelection(selectedResource)) return
          if (isAccessDeniedError(error)) {
            this.renderAccessDeniedScreen()
            return
          }
          log.error('Unable to load selected container: ' + error)
          this.showContentError({
            title: 'Unable to load this folder',
            message: 'The folder could not be loaded. Try again.'
          })
          return
        }

        if (!isCurrentSelection(selectedResource)) return
        this.sidebar?.refreshResources?.()

        if (pane?.name === 'folder') {
          this.renderContainerView(selectedResource)
          return
        }

        if (indexRequested || this.resourceLogic.containerHasIndexDocument(selectedResource)) {
          const applicationSubject = this.store.sym(
            getIndexedApplicationSubject(selectedResource, pane?.name)
          )
          try {
            await this.loadResource(applicationSubject.doc())
          } catch (error) {
            if (!isCurrentSelection(selectedResource)) return
            if (isAccessDeniedError(error)) {
              this.renderAccessDeniedScreen()
              return
            }
            log.error('Unable to load container index document: ' + error)
          }
          await this.renderExplorerInto(target, applicationSubject, pane, {
            isCurrent: () => isCurrentSelection(selectedResource),
            showHeader: false
          })
          return
        }

        const relevantPanes = await getRelevantPanes(selectedResource, browserContext, {
          excludedPaneNames: ['sharing'],
          fallbackPaneName: 'internal'
        })
        if (!isCurrentSelection(selectedResource)) return

        const selectedPane = pane || getPreferredPane(selectedResource, browserContext, relevantPanes)
        if (selectedPane?.name !== 'folder') {
          await this.renderExplorerInto(target, selectedResource, selectedPane, {
            isCurrent: () => isCurrentSelection(selectedResource),
            showHeader: true
          })
          return
        }

        this.renderContainerView(selectedResource)
        return
      }

      try {
        await this.loadResource(selectedResource)
      } catch (error) {
        if (!isCurrentSelection(selectedResource)) return
        if (isAccessDeniedError(error)) {
          this.renderAccessDeniedScreen()
          return
        }
        log.warn('Unable to load selected resource metadata: ' + error)
      }

      if (!isCurrentSelection(selectedResource)) return
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
    const indexRequested = !indexedContainer &&
      !!this.resourceLogic &&
      isContainerResource(resource, this.resourceLogic) &&
      this.resourceLogic.containerHasIndexDocument(resource)
    this.selectedResource = subject
    // Render directly so re-selecting the same resource still replaces the content target.
    void this.showResourceInContentView(subject, pane, !!indexedContainer || indexRequested)
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
    if (pane.name === 'folder') {
      this.showSubject(resource, pane)
      return
    }
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
      ${this.renderStorageHeader()}
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

  private renderStorageHeader () {
    return html`
      <folder-pane-storage-header
        .subject=${this.subject}
        .selectedResource=${this.selectedResource ?? this.subject}
        .browserContext=${this.browserContext}
        .paneList=${this.browserContext?.session.paneRegistry.list ?? []}
        .view=${this.containerView}
        .searchQuery=${this.searchQuery}
        .canCreate=${this.canCreate}
        @folder-pane-select-home=${this.handleSelectHome}
        @folder-pane-select-resource=${this.handleSelectBreadcrumbResource}
        @folder-pane-change-view=${this.handleContainerViewChange}
        @folder-pane-search=${this.handleSearch}
      ></folder-pane-storage-header>
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
          >
            <button type="button" @click=${this.retryContent}>Retry</button>
          </solid-ui-error-state>
        </div>
      `
    }

    return nothing
  }
}
