import { NamedNode } from "rdflib"

export type Resource = {
  id: string
  subject: NamedNode
  parentId: string | null
  isContainer: boolean
}

export type ResourceMap = Map<string, Resource>

export type SelectableResourceItem = Resource & {
  tabulatorSelect?: () => void
  tabulatorDeselect?: () => void
}
