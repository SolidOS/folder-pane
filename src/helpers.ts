import type { NamedNode } from 'rdflib'
import { utils } from 'solid-ui'
import type { ResourceLogic } from 'solid-logic'
import type { PaneDefinition } from 'pane-registry'
import type { ResourceMap } from './types'

export type FolderPaneResourceLogic = Pick<
  ResourceLogic,
  'getContainerMembers' | 'isHiddenFile' | 'isContainer' | 'containerHasIndexDocument' | 'getContainerIndexThing'
>

function isJavaScriptFile (resource: NamedNode): boolean {
  return /\.[cm]?js$/i.test(new URL(resource.uri).pathname)
}

type ResourceAccessMetadata = { isPublic?: boolean, isPublicKnown?: boolean }

function getResourceAccessState (access: ResourceAccessMetadata): 'public' | 'private' | 'unknown' {
  if (access.isPublicKnown === false) return 'unknown'
  return access.isPublic ? 'public' : 'private'
}

function getCreationNoun (paneName?: string): string {
  if (paneName?.toLowerCase() === 'source') return 'file'
  return paneName || 'item'
}

function getPaneLabel (pane: Pick<PaneDefinition, 'name' | 'mintClass'>): string {
  if (pane.mintClass) return utils.label(pane.mintClass)
  const noun = getCreationNoun(pane.name)
  return noun.charAt(0).toUpperCase() + noun.slice(1)
}

function getContainerMemberCountLabel (memberCount: number): string {
  return `${memberCount} ${memberCount === 1 ? 'item' : 'items'}`
}

function getCreationPanes (panes: PaneDefinition[]): PaneDefinition[] {
  // Keep pane-registry order: it is also the pane priority order.
  return panes.filter(pane => !!pane.mintNew && pane.name?.toLowerCase() !== 'chat')
}

function getCreationDialogText (paneLabel = 'Container'): { title: string, placeholder: string } {
  const displayLabel = paneLabel.charAt(0).toUpperCase() + paneLabel.slice(1)
  return {
    title: `New ${displayLabel}`,
    placeholder: `Enter ${displayLabel} name`
  }
}

function isContainerResource (resource: NamedNode, resourceLogic: FolderPaneResourceLogic): boolean {
  return resource.uri.endsWith('/') || (!isJavaScriptFile(resource) && resourceLogic.isContainer(resource))
}

function isAccessDeniedError (error: unknown): boolean {
  const response = typeof error === 'object' && error !== null
    ? error as { status?: number, response?: { status?: number } }
    : undefined
  return response?.status === 401 || response?.status === 403 ||
    response?.response?.status === 401 || response?.response?.status === 403
}

/**
 * A pane's `index.ttl#this` stands for its container: return that container so
 * routing can render the pane without the file-explorer header.
 */
function getIndexedContainer (resource: NamedNode): string | null {
  const match = /^(.*\/)index\.ttl#this$/.exec(resource.uri)
  return match ? match[1] : null
}

function getIndexedApplicationSubject (container: NamedNode, paneName?: string): string {
  return paneName?.toLowerCase() === 'schedule'
    ? `${container.uri}details.ttl#event`
    : `${container.uri}index.ttl#this`
}

function getResourcesForContainer (container: NamedNode, resourceLogic: FolderPaneResourceLogic | null): ResourceMap {
  if (!resourceLogic) return new Map()

  const containedResources = resourceLogic.getContainerMembers(container).filter(
    (resource) => !resourceLogic.isHiddenFile(resource)
  ).filter((containedResource, index, allContainedResources) => {
    return allContainedResources.findIndex(other => other.sameTerm(containedResource)) === index
  }).filter((resource) => {
    const containerUri = container.uri.endsWith('/') ? container.uri : `${container.uri}/`
    return resource.uri !== `${containerUri}index.ttl#this`
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
    isContainer: isContainerResource(resource, resourceLogic)
  }]))
}

export {
  getCreationNoun,
  getCreationPanes,
  getCreationDialogText,
  getContainerMemberCountLabel,
  getIndexedApplicationSubject,
  getIndexedContainer,
  getPaneLabel,
  getResourceAccessState,
  getResourcesForContainer,
  isAccessDeniedError,
  isContainerResource,
  isJavaScriptFile
}
