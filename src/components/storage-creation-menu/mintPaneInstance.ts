import { authn } from 'solid-logic'
import { DataBrowserContext, PaneDefinition } from 'pane-registry'
import { NamedNode } from 'rdflib'
import { ns, utils } from 'solid-ui'

// This code was from newThingUI in solid-ui, we don't need the UI part
// anymore we just need to create the new instance and add it to the container.
export type MakeNewAppInstanceOptions = {
  browserContext: DataBrowserContext
  container: NamedNode
  pane: PaneDefinition
  name: string
  // Panes render their own "created" notice into this element.
  statusArea: HTMLElement
}

export function getPaneLabel (pane: PaneDefinition): string {
  if (!pane.mintClass) {
    return pane.name.charAt(0).toUpperCase() + pane.name.slice(1)
  }

  return utils.label(pane.mintClass)
}

export async function makeNewAppInstance (options: MakeNewAppInstanceOptions): Promise<NamedNode> {
  const { browserContext, container, pane, name, statusArea } = options
  const kb = browserContext.session.store
  const me = authn.currentUser()
  if (!me) {
    throw new Error('makeNewAppInstance: must be logged in')
  }

  const noun = getPaneLabel(pane)
  const containerUri = container.uri.endsWith('/') ? container.uri : container.uri + '/'
  const newBase = containerUri + encodeURIComponent(name) + '/'

  const created = await pane.mintNew!(browserContext, {
    newBase,
    // solid-ui mintNew implementations still expect this to be called `folder`.
    folder: container,
    pane,
    div: statusArea,
    dom: browserContext.dom,
    me,
    noun,
    appPathSegment: noun.charAt(0).toUpperCase() + noun.slice(1),
    noIndexHTML: true
  } as any)

  if (!created || !created.newInstance) {
    throw new Error('Cannot mint new thing - missing newInstance')
  }

  const newResource = created.newInstance

  kb.add(container, ns.ldp('contains'), newResource, container.doc())

  return newResource
}
