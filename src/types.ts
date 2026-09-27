import type { LiveStore, NamedNode } from 'rdflib'
import type { SolidLogic } from 'solid-logic'

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
  store: LiveStore | null
  resourceLogic: SolidLogic['resource'] | null
  selectedResource: NamedNode
  contentView: HTMLElement
  outliner?: StoragePaneOutliner
  renderContainerView: (selectedResource: NamedNode) => void
  isCurrentSelection: (selectedResource: NamedNode) => boolean
}
