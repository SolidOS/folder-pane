import { ns, utils } from 'solid-ui'
import type { NamedNode } from 'rdflib'
import type { ContentViewRenderer, ResourceMap } from './types'

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

function isContainerResource (store, resource: NamedNode): boolean {
  if (!store) return false

  return store.each(resource, ns.ldp('contains')).length > 0 || store.holds(resource, ns.rdf('type'), ns.ldp('Container'))
}

function isStorageRoot (store, resource: NamedNode): boolean {
  if (!store) return false

  return store.holds(resource, ns.rdf('type'), ns.space('Storage'), resource.doc())
}

function containerHasIndexDocument (store, container: NamedNode): boolean {
  if (!store) return false

  const indexThing = getContainerIndexThing(store, container)
  return store.holds(container, ns.ldp('contains'), indexThing.doc())
}

async function renderSelectedResourceInContentView ({
  store,
  resourceLogic,
  selectedResource,
  contentView,
  outliner,
  renderContainerPane,
}: ContentViewRenderer): Promise<void> {
  const isContainer = isContainerResource(store, selectedResource)

  if (isContainer) {
    await store.fetcher.load(selectedResource)

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

  contentView.replaceChildren()
  outliner?.GotoSubject(selectedResource, true, undefined, false, undefined, contentView)
}

export { containerHasIndexDocument, getContainerIndexThing, getResourcesForContainer, isContainerResource, isStorageRoot, noHiddenFiles, renderSelectedResourceInContentView }
