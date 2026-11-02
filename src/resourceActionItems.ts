import type { DataBrowserContext } from 'pane-registry'
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
  includeFolderPane?: boolean
  openPane: (paneName: string, event: Event) => void
  isCurrent: () => boolean
}

/**
 * Builds the pane entries for a resource's three-dots menu: the preferred
 * pane first, folder excluded, and indexed containers resolved to their
 * application subject. Returns undefined when the request became stale.
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

  const panes = await getRelevantPanes(paneSubject, context, {
    excludedPaneNames: ['sharing'],
    fallbackPaneName: 'internal'
  })
  if (!isCurrent()) return undefined

  const preferredPane = getPreferredPane(paneSubject, context, panes)
  const nonFolderPanes = panes.filter(pane => pane.name !== 'folder')
  const orderedPanes = preferredPane && preferredPane.name !== 'folder'
    ? [preferredPane, ...nonFolderPanes.filter(pane => pane !== preferredPane)]
    : nonFolderPanes
  const menuPanes = options.includeFolderPane && options.isContainer
    ? (preferredPane?.name === 'folder' ? [preferredPane, ...nonFolderPanes] : [...nonFolderPanes, ...panes.filter(pane => pane.name === 'folder')])
    : orderedPanes
  const items = await preparePaneMenuItems({
    subject: paneSubject,
    context,
    panes: menuPanes as PaneMenuPane[],
    openPane: (_subject, paneName, event) => options.openPane(paneName, event)
  })
  if (options.includeFolderPane) {
    const folderItem = items.find(item => item.key === 'folder')
    if (folderItem) folderItem.label = 'Contents'
  }
  return isCurrent() ? items : undefined
}
