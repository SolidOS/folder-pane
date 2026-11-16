import { createContext } from '@lit/context'
import type { NamedNode } from 'rdflib'

export type FolderPaneViewMode = 'grid' | 'list'

export interface FolderPaneContext {
  rootResource: NamedNode | undefined
  displayedResource: NamedNode | undefined
  activeContainer: NamedNode | undefined
  view: FolderPaneViewMode
  searchQuery: string
  canCreate: boolean
}

export const folderPaneContext = createContext<FolderPaneContext>(Symbol('folder-pane'))
