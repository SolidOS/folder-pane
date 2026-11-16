import type { DataBrowserContext, PaneDefinition } from 'pane-registry'
import type { NamedNode } from 'rdflib'
import { getPreferredPane, getRelevantPanes, preparePaneMenuItems } from 'solid-ui'
import type { PaneMenuItem, PaneMenuPane } from 'solid-ui'
import { getIndexedApplicationSubject, type FolderPaneResourceLogic } from './helpers'
import * as debug from './debug'

export type ResourcePaneMenuOptions = {
  resource: NamedNode
  isContainer: boolean
  context: DataBrowserContext
  resourceLogic?: Pick<FolderPaneResourceLogic, 'containerHasIndexDocument'> | null
  openPane: (subject: NamedNode, paneName: string, event: Event) => void
  isCurrent: () => boolean
}

/**
 * Builds pane entries from the loaded resource and its application index.
 * The preferred pane comes first; the rest retain registry order.
 * Returns undefined when the request became stale.
 */
export async function loadResourcePaneMenuItems (
  options: ResourcePaneMenuOptions
): Promise<PaneMenuItem[] | undefined> {
  const { resource, context, isCurrent } = options
  const store = context.session.store
  try {
    await store.fetcher.load(resource)
  } catch (error) {
    debug.warn('Unable to preload resource for folder-pane action menu', error)
  }
  if (!isCurrent()) return undefined

  let paneSubject = resource
  if (options.isContainer && options.resourceLogic?.containerHasIndexDocument(resource)) {
    paneSubject = store.sym(getIndexedApplicationSubject(resource))
    try {
      await store.fetcher.load(paneSubject.doc())
    } catch (error) {
      debug.warn('Unable to preload index document for folder-pane action menu', error)
    }
    if (!isCurrent()) return undefined
  }

  const relevanceOptions = { excludedPaneNames: ['sharing'] }
  const resourcePanes = await getRelevantPanes(resource, context, relevanceOptions)
  const applicationPanes = paneSubject.sameTerm(resource)
    ? []
    : await getRelevantPanes(paneSubject, context, relevanceOptions)
  if (!isCurrent()) return undefined
  const primaryApplicationPane = getPreferredPane(paneSubject, context, applicationPanes)
  const paneSubjects = new Map<PaneDefinition, NamedNode>(
    resourcePanes.map(pane => [pane, resource])
  )
  if (primaryApplicationPane) paneSubjects.set(primaryApplicationPane, paneSubject)
  let panes = context.session.paneRegistry.list.filter(pane => paneSubjects.has(pane))
  if (!panes.length) {
    panes = await getRelevantPanes(resource, context, {
      ...relevanceOptions,
      fallbackPaneName: 'internal'
    })
  }
  const preferredPane = primaryApplicationPane || getPreferredPane(resource, context, resourcePanes)
  const orderedPanes = preferredPane
    ? [preferredPane, ...panes.filter(pane => pane !== preferredPane)]
    : panes
  const items = (await Promise.all(orderedPanes.map(pane => preparePaneMenuItems({
    subject: paneSubjects.get(pane) ?? resource,
    context,
    panes: [pane as PaneMenuPane],
    openPane: (subject, paneName, event) => options.openPane(subject, paneName, event)
  })))).flat()
  return isCurrent() ? items : undefined
}
