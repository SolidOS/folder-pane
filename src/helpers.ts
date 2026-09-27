import type { LiveStore, NamedNode } from 'rdflib'
import { ns, utils } from 'solid-ui'
import type { ContentViewRenderer, ResourceMap } from './types'

// move this to solid-logic resource logic
function noHiddenFiles (obj: NamedNode): boolean {
  // @@ This hiddenness should actually be server defined
  const directory = obj.dir()
  if (!directory) return true
  const pathEnd = obj.uri.slice(directory.uri.length)
  return !(
    pathEnd.startsWith('.') ||
    pathEnd.endsWith('.acl') ||
    pathEnd.endsWith('~')
  )
}

function getResourcesForContainer (store: LiveStore | null, container: NamedNode, resourceLogic: ResourceLogic | null): ResourceMap {
  if (!store) return new Map()

  const containedResources = store.each(container, ns.ldp('contains')).filter(
    (resource): resource is NamedNode =>
      resource.termType === 'NamedNode' && noHiddenFiles(resource as NamedNode)
  ).filter((containedResource, index, allContainedResources) => {
    return allContainedResources.findIndex(other => other.sameTerm(containedResource)) === index
  })
  const labeledResources: Array<[string, NamedNode]> = containedResources.map(containedResource => [
    utils.label(containedResource).toLowerCase(),
    containedResource
  ])
  labeledResources.sort()

  return new Map(labeledResources.map(([, resource]) => [resource.value, {
    id: resource.value,
    subject: resource,
    parentId: container.value,
    isContainer: resourceLogic?.isContainer?.(resource) ?? false
  }]))
}

function getContainerIndexThing (store: LiveStore, container: NamedNode): NamedNode {
  const folderUri = container.uri.endsWith('/') ? container.uri : container.uri + '/'
  return store.sym(folderUri + 'index.ttl#this')
}

function containerHasIndexDocument (store: LiveStore, container: NamedNode): boolean {
  const indexThing = getContainerIndexThing(store, container)
  return store.holds(container, ns.ldp('contains'), indexThing.doc())
}

function isStorageRoot (store: LiveStore, resource: NamedNode): boolean {
  return store.holds(resource, ns.rdf('type'), ns.space('Storage'), resource.doc())
}

async function renderSelectedResourceInContentView ({
  store,
  resourceLogic,
  selectedResource,
  contentView,
  outliner,
  renderContainerView,
  isCurrentSelection,
}: ContentViewRenderer): Promise<void> {
  if (!store || !isCurrentSelection(selectedResource)) {
    return
  }

  const isContainer = resourceLogic?.isContainer?.(selectedResource)

  if (isContainer) {
    try {
      await store.fetcher.load(selectedResource)
    } catch (error) {
      if (!isCurrentSelection(selectedResource)) {
        return
      }

      console.error('Unable to load selected container:', error)
      renderContainerView(selectedResource)
      return
    }

    if (!isCurrentSelection(selectedResource)) {
      return
    }

    const hasIndexDocumentAfterLoad = containerHasIndexDocument(store, selectedResource)

    if (hasIndexDocumentAfterLoad) {
      const indexThing = getContainerIndexThing(store, selectedResource)
      contentView.replaceChildren()
      outliner?.GotoSubject(indexThing, true, undefined, false, undefined, contentView)
      return
    }

    renderContainerView(selectedResource)
    return
  }

  contentView.replaceChildren()
  outliner?.GotoSubject(selectedResource, true, undefined, false, undefined, contentView)
}

export { 
  noHiddenFiles, 
  getResourcesForContainer,
  renderSelectedResourceInContentView,
  isStorageRoot
}
