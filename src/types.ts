import { NamedNode } from "rdflib"

export type Resource = {
  id: string
  subject: NamedNode
  parentId: string | null
  isContainer: boolean
}

export type ResourceMap = Map<string, Resource>

export type StoragePaneOutliner = {
  GotoSubject: (
    subject: NamedNode,
    openPane: boolean,
    focus?: unknown,
    replace?: boolean,
    source?: unknown,
    targetView?: HTMLElement
  ) => void
}

export type ContentViewRenderer = {
  store: any
  resourceLogic: any
  selectedResource: NamedNode
  contentView: HTMLElement
  outliner?: StoragePaneOutliner
  renderContainerPane: (selectedResource: NamedNode) => void
}
