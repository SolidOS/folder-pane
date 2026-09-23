import { ns, utils, widgets } from 'solid-ui'
import type { NamedNode, Statement } from 'rdflib'
import { solidLogicSingleton } from 'solid-logic'
import type { ContentViewRenderer, Resource, ResourceMap } from './types'

const draggedResourceMimeType = 'application/x-solidos-resource-uri'

const hiddenFileSuffixes = ['.acl', '~']

function noHiddenFiles (obj) {
  // @@ This hiddenness should actually be server defined
  const parentUri = obj?.dir?.()?.uri
  const uri = obj?.uri

  if (typeof uri !== 'string' || typeof parentUri !== 'string') {
    return true
  }

  const pathEnd = uri.slice(parentUri.length)
  return !pathEnd.startsWith('.') && !hiddenFileSuffixes.some((suffix) => pathEnd.endsWith(suffix))
}

function isNamedNode (term): term is NamedNode {
  return Boolean(term && typeof term.uri === 'string')
}

function getResourcesFromSearchQuery (store, query: string): ResourceMap {
  if (!store) {
    return new Map()
  }

  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return new Map()
  }

  const statements = (store.statements || []) as Statement[]
  const candidateResources = new Map<string, NamedNode>()

  for (const statement of statements) {
    for (const term of [statement.subject, statement.object]) {
      if (!isNamedNode(term)) {
        continue
      }

      if (!noHiddenFiles(term)) {
        continue
      }

      const label = utils.label(term).toLowerCase()
      if (label.includes(normalizedQuery) || term.uri.toLowerCase().includes(normalizedQuery)) {
        candidateResources.set(term.value, term)
      }
    }
  }

  const resourceMap = Array.from(candidateResources.values())
    .map(resource => [utils.label(resource).toLowerCase(), resource])
    .sort()

  return new Map(resourceMap.map(pair => [pair[1].value, {
    id: pair[1].value,
    subject: pair[1],
    parentId: pair[1].dir().value,
    isContainer: solidLogicSingleton.resource?.isContainer?.(pair[1]) ?? false
  }]))
}

function getResourcesForContainer (store, container: NamedNode): ResourceMap {
  if (!store) {
    return new Map()
  }

  let containedResources = store.each(container, ns.ldp('contains')).filter(noHiddenFiles)
  containedResources = containedResources.filter((containedResource, index, allContainedResources) => {
    return allContainedResources.findIndex(other => other.sameTerm(containedResource)) === index
  })
  containedResources = containedResources.map(containedResource => [utils.label(containedResource).toLowerCase(), containedResource])
  containedResources.sort()

  return new Map(containedResources.map(pair => [pair[1].value, {
    id: pair[1].value,
    subject: pair[1],
    parentId: container.value,
    isContainer: solidLogicSingleton.resource?.isContainer?.(pair[1]) ?? false
  }]))
}

async function loadResourcesForContainer (store, container: NamedNode): Promise<ResourceMap> {
  if (!store) {
    return new Map()
  }

  let resources = getResourcesForContainer(store, container)

  await Promise.all(
    Array.from(resources.values())
      .filter((resource) => resource.isContainer)
      .map(async (resource) => {
        try {
          await store.fetcher.load(resource.subject)
        } catch (_error) {
          // Keep loading best-effort; a missing child should not stop the rest.
        }
      })
  )

  resources = getResourcesForContainer(store, container)
  return resources
}

async function loadResourcesForStorage (store, root: NamedNode, onProgress?: (resource: NamedNode) => void): Promise<ResourceMap> {
  if (!store || !root) {
    return new Map()
  }

  const discoveredResources = new Map<string, {
    id: string
    subject: NamedNode
    parentId: string | null
    isContainer: boolean
  }>()
  const visitedContainers = new Set<string>()
  const pendingContainers: NamedNode[] = [root]

  while (pendingContainers.length > 0) {
    const container = pendingContainers.shift()

    if (!container || visitedContainers.has(container.value)) {
      continue
    }

    visitedContainers.add(container.value)

    const resources = getResourcesForContainer(store, container)

    for (const resource of resources.values()) {
      discoveredResources.set(resource.id, resource)

      if (resource.isContainer && !visitedContainers.has(resource.subject.value)) {
        pendingContainers.push(resource.subject)
      }
    }
  }

  return new Map(discoveredResources)
}

function getContainerIndexThing (store, container: NamedNode): NamedNode {
  const folderUri = container.uri.endsWith('/') ? container.uri : container.uri + '/'
  return store.sym(folderUri + 'index.ttl#this')
}

function containerHasMintClassIndexDocument (store, container: NamedNode): boolean {
  if (!store || !containerHasIndexDocument(store, container)) {
    return false
  }

  const indexThing = getContainerIndexThing(store, container)
  const mintClassPredicate = ns.ui('mintClass')

  return Boolean(
    store.any(indexThing, mintClassPredicate, undefined, indexThing.doc()) ||
    store.any(indexThing.doc(), mintClassPredicate, undefined, indexThing.doc())
  )
}

function canAcceptUploads (store, container: NamedNode): boolean {
  return !containerHasMintClassIndexDocument(store, container)
}

function uploadFilesIntoContainer (
  store,
  container: NamedNode,
  files: FileList | File[],
  onCreated?: (resource: NamedNode) => void
) {
  widgets.uploadFiles(
    store.fetcher,
    files,
    container.uri,
    container.uri,
    (_file, uri) => {
      const destination = store.sym(uri)
      store.add(container, ns.ldp('contains'), destination, container.doc())
      onCreated?.(destination)
    }
  )
}

function parseDroppedUris (dataTransfer: DataTransfer | null | undefined): string[] {
  const types = dataTransfer?.types

  if (!types) {
    return []
  }

  const normalizeDroppedUris = (uriText: string) => uriText
    .split('\n')
    .map(uri => uri.trim())
    .filter(uri => uri && uri[0] !== '#')

  if (Array.from(types).includes('text/uri-list')) {
    return normalizeDroppedUris(dataTransfer?.getData('text/uri-list') ?? '')
  }

  const plainText = dataTransfer?.getData('text/plain')?.trim() ?? ''

  if (plainText.startsWith('http')) {
    return [plainText]
  }

  return []
}

function getDraggedResourceUri (dataTransfer: DataTransfer | null | undefined): string | undefined {
  if (!dataTransfer) {
    return undefined
  }

  const draggedResourceUri = dataTransfer.getData(draggedResourceMimeType).trim()
  if (draggedResourceUri) {
    return draggedResourceUri
  }

  const [uri] = parseDroppedUris(dataTransfer)
  return uri
}

function setDraggedResource (event: DragEvent, resource: NamedNode) {
  const dataTransfer = event.dataTransfer

  if (!dataTransfer) {
    return
  }

  dataTransfer.effectAllowed = 'move'
  dataTransfer.setData(draggedResourceMimeType, resource.uri)
  dataTransfer.setData('text/uri-list', resource.uri)
  dataTransfer.setData('text/plain', resource.uri)
}

function addUrisToContainer (
  store,
  container: NamedNode,
  uris: string[],
  onCreated?: (resource: NamedNode) => void
) {
  for (const uri of uris) {
    const destination = store.sym(uri)
    store.add(container, ns.ldp('contains'), destination, container.doc())
    onCreated?.(destination)
  }
}

function handleContainerDrop (
  event: DragEvent,
  store,
  container: NamedNode,
  onCreated?: (resource: NamedNode) => void
) {
  event.preventDefault()
  event.stopPropagation()

  if (!canAcceptUploads(store, container)) {
    return false
  }

  const uris = parseDroppedUris(event.dataTransfer)
  if (uris.length > 0) {
    addUrisToContainer(store, container, uris, onCreated)
    return true
  }

  const files = event.dataTransfer?.files ?? []
  if (files.length > 0) {
    uploadFilesIntoContainer(store, container, files, onCreated)
    return true
  }

  return false
}

function handleContainerDragOver (event: DragEvent, store, container: NamedNode) {
  if (event.dataTransfer?.types.includes(draggedResourceMimeType)) {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer!.dropEffect = 'move'
    return true
  }

  if (!canAcceptUploads(store, container)) {
    return false
  }

  event.preventDefault()
  event.stopPropagation()
  event.dataTransfer!.dropEffect = 'copy'
  return true
}

function isStorageRoot (store, resource: NamedNode): boolean {
  if (!store || typeof store.holds !== 'function') return false

  try {
    return store.holds(resource, ns.rdf('type'), ns.space('Storage'), resource.doc())
  } catch (_error) {
    return false
  }
}

function containerHasIndexDocument (store, container: NamedNode): boolean {
  if (!store || typeof store.holds !== 'function') return false

  try {
    const indexThing = getContainerIndexThing(store, container)
    return store.holds(container, ns.ldp('contains'), indexThing.doc())
  } catch (_error) {
    return false
  }
}

async function renderSelectedResourceInContentView ({
  store,
  selectedResource,
  contentView,
  outliner,
  renderContainerPane,
  renderAccessDeniedView,
}: ContentViewRenderer): Promise<void> {
  const isAccessDeniedError = (error: unknown) => {
    const status = typeof error === 'object' && error !== null
      ? (error as { status?: number, response?: { status?: number } }).status ?? (error as { response?: { status?: number } }).response?.status
      : undefined

    return status === 401 || status === 403
  }

  const isContainer = solidLogicSingleton.resource.isContainer(selectedResource)

  if (isContainer) {
    try {
      await store.fetcher.load(selectedResource)
      await loadResourcesForContainer(store, selectedResource)
    } catch (_error) {
      if (isAccessDeniedError(_error)) {
        renderAccessDeniedView?.()
      }
      return
    }

    const hasIndexDocumentAfterLoad = containerHasIndexDocument(store, selectedResource)

    if (hasIndexDocumentAfterLoad) {
      const indexThing = getContainerIndexThing(store, selectedResource)
      contentView.replaceChildren()
      outliner?.GotoSubject(indexThing, true, undefined, false, undefined, contentView)
      return
    }
    renderContainerPane(selectedResource)
    return
  }

  try {
    await store.fetcher.load(selectedResource)
  } catch (_error) {
    return
  }

  contentView.replaceChildren()
  outliner?.GotoSubject(selectedResource, true, undefined, false, undefined, contentView)
}

// Resource tree chevrons should mirror the legacy outline behavior:
// shift opens the resource in the main view, alt opens the internal pane immediately.
function handleResourceChevronClick (
  event: MouseEvent,
  resource: Resource | null,
  selectResource: (resource: NamedNode, paneName?: string) => void,
  toggleExpanded: () => void
) {
  if (!resource) {
    return
  }

  event.preventDefault()
  event.stopPropagation()

  if (event.altKey) {
    selectResource(resource.subject, 'internal')
    return
  }

  if (event.shiftKey) {
    selectResource(resource.subject, 'resource')
    return
  }

  if (resource.isContainer) {
    toggleExpanded()
  }
}

export { 
  addUrisToContainer,
  canAcceptUploads,
  containerHasIndexDocument, 
  containerHasMintClassIndexDocument,
  getContainerIndexThing, 
  getResourcesForContainer,
  getResourcesFromSearchQuery, 
  getDraggedResourceUri,
  loadResourcesForContainer, 
  loadResourcesForStorage,
  handleContainerDragOver,
  handleContainerDrop,
  handleResourceChevronClick,
  isStorageRoot, 
  noHiddenFiles, 
  parseDroppedUris,
  setDraggedResource,
  uploadFilesIntoContainer,
  renderSelectedResourceInContentView 
}
