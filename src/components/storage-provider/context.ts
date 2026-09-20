import { createContext } from '@lit/context'
import type { NamedNode } from 'rdflib'

export type ViewMode = 'grid' | 'list'

export interface StorageContext {
  selectedResource: NamedNode | undefined,
  selectedPaneName: string | undefined,
  selectResource: (resource: NamedNode, paneName?: string) => void,
  deleteResource: (resource: NamedNode) => Promise<void>,
  resourceRevision: number,
  view: ViewMode,
  setView: (view: ViewMode) => void,
  searchQuery: string,
  setSearchQuery: (query: string) => void,
  history: NamedNode[]
}

export const DEFAULT_STORAGE_CONTEXT: StorageContext = {
  selectedResource: undefined,
  selectedPaneName: undefined,
  selectResource: () => {},
  deleteResource: async () => {},
  resourceRevision: 0,
  view: 'grid',
  setView: (view: ViewMode) => {},
  searchQuery: '',
  setSearchQuery: (query: string) => {},
  history: []
}

export const storageContext = createContext<StorageContext>(Symbol('storage'))