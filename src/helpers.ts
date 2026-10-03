import type { NamedNode } from 'rdflib'
import { ns, utils } from 'solid-ui'
import type { ContentViewRenderer, ResourceMap } from './types'

// move this to solid-logic resource logic
function noHiddenFiles (obj) {
  // @@ This hiddenness should actually be server defined
  const pathEnd = obj.uri.slice(obj.dir().uri.length)
  return !(
    pathEnd.startsWith('.') ||
    pathEnd.endsWith('.acl') ||
    pathEnd.endsWith('~')
  )
}

function getResourcesForContainer (store, container: NamedNode, resourceLogic): ResourceMap {
  if (!store) return new Map()

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
    isContainer: resourceLogic?.isContainer?.(pair[1]) ?? false
  }]))
}

function getContainerIndexThing (store, container: NamedNode): NamedNode {
  const folderUri = container.uri.endsWith('/') ? container.uri : container.uri + '/'
  return store.sym(folderUri + 'index.ttl#this')
}

function containerHasIndexDocument (store, container: NamedNode): boolean {
  if (!store) return false

  const indexThing = getContainerIndexThing(store, container)
  return store.holds(container, ns.ldp('contains'), indexThing.doc())
}

function isStorageRoot (store, resource: NamedNode): boolean {
  if (!store) return false

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
  if (!isCurrentSelection(selectedResource)) {
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
