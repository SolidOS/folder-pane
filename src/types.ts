import type { NamedNode } from 'rdflib'

export type Resource = {
  id: string
  subject: NamedNode
  parentId: string | null
  isContainer: boolean
}

export type ResourceMap = Map<string, Resource>
