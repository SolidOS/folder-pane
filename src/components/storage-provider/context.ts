import { createContext } from '@lit/context'
import type { NamedNode } from 'rdflib'

export type ViewMode = 'grid' | 'list'

export interface StorageContext {
  selectedResource: NamedNode | undefined,
  selectResource: (resource: NamedNode) => void,
  view: ViewMode,
  setView: (view: ViewMode) => void,
  searchQuery: string,
  setSearchQuery: (query: string) => void,
  history: NamedNode[]
}

export const DEFAULT_STORAGE_CONTEXT: StorageContext = {
  selectedResource: undefined,
  selectResource: () => {},
  view: 'grid',
  setView: (view: ViewMode) => {},
  searchQuery: '',
  setSearchQuery: (query: string) => {},
  history: []
}

export const storageContext = createContext<StorageContext>(Symbol('storage'))