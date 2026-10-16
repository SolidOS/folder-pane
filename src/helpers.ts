import type { NamedNode } from 'rdflib'
import { utils } from 'solid-ui'
import type { ResourceLogic } from 'solid-logic'
import type { ResourceMap } from './types'

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

export { getResourcesForContainer }
