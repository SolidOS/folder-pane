import { authn } from 'solid-logic'
import { DataBrowserContext, PaneDefinition } from 'pane-registry'
import { NamedNode } from 'rdflib'
import { ns, widgets } from 'solid-ui'

// This code was from newThingUI in solid-ui, we don't need the UI part
// anymore we just need to create the new instance and add it to the folder. 
export type MakeNewAppInstanceOptions = {
  browserContext: DataBrowserContext
  div: HTMLElement
  dom: HTMLDocument
  folder: NamedNode
  pane: PaneDefinition
  refreshTarget?: { refresh?: () => void } | null
  onCreated?: (newInstance: NamedNode) => void
}

export async function makeNewAppInstance (options: MakeNewAppInstanceOptions): Promise<NamedNode | undefined> {
  const kb = options.browserContext.session.store
  const me = authn.currentUser()
  if (!me) {
    throw new Error('makeNewAppInstance: must be logged in')
  }

  const noun = options.pane.mintClass ? options.pane.name : options.pane.name
  const appPathSegment = noun.slice(0, 1).toUpperCase() + noun.slice(1)

  const name = await widgets.askName(
    options.dom,
    kb,
    options.div,
    ns.foaf('name'),
    null,
    noun
  )

  if (!name) {
    return undefined
  }

  let newBase = options.folder.uri
  if (!newBase.endsWith('/')) {
    newBase += '/'
  }
  newBase += encodeURIComponent(name) + '/'

  const newPaneOptions: any = {
    newBase,
    folder: options.folder,
    workspace: undefined,
    pane: options.pane,
    div: options.div,
    dom: options.dom,
    me,
    refreshTarget: options.refreshTarget ?? undefined,
    noun,
    appPathSegment,
    noIndexHTML: true
  }

  const created = await options.pane.mintNew!(options.browserContext, newPaneOptions)
  if (!created || !created.newInstance) {
    throw new Error('Cannot mint new thing - missing newInstance')
  }

  const tail = created.newInstance.uri.slice(options.folder.uri.length)
  const isPackage = tail.includes('/')

  if (isPackage) {
    kb.add(
      options.folder,
      ns.ldp('contains'),
      kb.sym(created.newBase),
      options.folder.doc()
    )
  } else {
    kb.add(
      options.folder,
      ns.ldp('contains'),
      created.newInstance,
      options.folder.doc()
    )
  }

  if (options.refreshTarget && options.refreshTarget.refresh) {
    options.refreshTarget.refresh()
  }

  options.onCreated?.(created.newInstance)
  return created.newInstance
}