import { ns, utils } from 'solid-ui'
import type { NamedNode } from 'rdflib'
import { solidLogicSingleton } from 'solid-logic'
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

function getResourcesForContainer (store, container: NamedNode): ResourceMap {
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
    isContainer: solidLogicSingleton.resource?.isContainer?.(pair[1]) ?? false
  }]))
}

async function loadResourcesForContainer (store, container: NamedNode): Promise<ResourceMap> {
  if (!store) return new Map()

  await store.fetcher.load(container)

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

function getContainerIndexThing (store, container: NamedNode): NamedNode {
  const folderUri = container.uri.endsWith('/') ? container.uri : container.uri + '/'
  return store.sym(folderUri + 'index.ttl#this')
}

function isContainerResource (store, resource: NamedNode): boolean {
  if (!store) return false

  // A freshly minted container has no statements in the store yet.
  if (resource.uri.endsWith('/')) return true

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
  selectedResource,
  contentView,
  outliner,
  renderContainerPane,
}: ContentViewRenderer): Promise<void> {
  const isContainer = isContainerResource(store, selectedResource)

  if (isContainer) {
    await store.fetcher.load(selectedResource)
    await loadResourcesForContainer(store, selectedResource)

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

export { containerHasIndexDocument, getContainerIndexThing, getResourcesForContainer, loadResourcesForContainer, isContainerResource, isStorageRoot, noHiddenFiles, renderSelectedResourceInContentView }
