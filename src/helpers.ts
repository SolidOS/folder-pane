import type { NamedNode } from 'rdflib'
import { utils } from 'solid-ui'
import type { ResourceLogic } from 'solid-logic'
import type { ContentViewRenderer, ResourceMap } from './types'

function getResourcesForContainer (container: NamedNode, resourceLogic: ResourceLogic | null): ResourceMap {
  if (!resourceLogic) return new Map()

  const containedResources = resourceLogic.getContainerMembers(container).filter(
    (resource) => !resourceLogic.isHiddenFile(resource)
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
    isContainer: resourceLogic.isContainer(resource)
  }]))
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

  if (!resourceLogic) {
    return
  }

  const isContainer = resourceLogic.isContainer(selectedResource)

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

    const hasIndexDocumentAfterLoad = resourceLogic.containerHasIndexDocument(selectedResource)

    if (hasIndexDocumentAfterLoad) {
      const indexThing = resourceLogic.getContainerIndexThing(selectedResource)
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
  getResourcesForContainer,
  renderSelectedResourceInContentView
}
