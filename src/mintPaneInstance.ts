import type { NamedNode } from 'rdflib'
import type { DataBrowserContext, PaneDefinition } from 'pane-registry'
import { normalizeCreationName } from './creationSafety'

export type MintPaneInstanceOptions = {
  context: DataBrowserContext
  container: NamedNode
  pane: PaneDefinition
  name: string
  noun: string
  statusArea: HTMLElement
  me?: NamedNode
  dom: HTMLDocument
  mintTimeoutMs?: number
  /** Replacement is opt-in; the normal create flow never overwrites a known member. */
  allowReplacement?: boolean
}

export type MintedPaneInstance = {
  newBase: string
  newInstance: NamedNode
  /** The direct child of `container` that holds the new instance. */
  containedResource: NamedNode
}

export class PaneMintError extends Error {
  constructor (message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'PaneMintError'
  }
}

function hasKnownDestinationConflict (context: DataBrowserContext, container: NamedNode, newBase: string): boolean {
  const store = context.session.store
  if (typeof store.each !== 'function') return false
  const members = store.each(container, store.sym('http://www.w3.org/ns/ldp#contains')) as NamedNode[]
  const withoutSlash = newBase.endsWith('/') ? newBase.slice(0, -1) : newBase
  return members.some(member => member.uri === newBase || member.uri === withoutSlash)
}

function getNewInstanceBase (container: NamedNode, name: string): string {
  const normalizedName = normalizeCreationName(name)
  const containerUri = container.uri.endsWith('/') ? container.uri : `${container.uri}/`
  return `${containerUri}${encodeURIComponent(normalizedName)}/`
}

function isExtensionlessSourceFile (pane: PaneDefinition, name: string): boolean {
  if (pane.name?.toLowerCase() !== 'source') return false

  const fileName = name.trim().split('/').pop() ?? ''
  const extensionStart = fileName.lastIndexOf('.')
  return extensionStart <= 0 || extensionStart === fileName.length - 1
}

/**
 * Legacy newThingUI containment rule: apps that create a folder of files are
 * contained as `newBase`; single-file results (source, dokieli) as themselves.
 */
function getContainedResource (
  container: NamedNode,
  newBase: string,
  newInstance: NamedNode,
  sym: (uri: string) => NamedNode
): NamedNode {
  const containerUri = container.uri.endsWith('/') ? container.uri : `${container.uri}/`
  const tail = newInstance.uri.startsWith(containerUri)
    ? newInstance.uri.slice(containerUri.length)
    : ''
  if (!tail) return sym(newBase)
  const firstSlash = tail.indexOf('/')
  if (firstSlash >= 0 && firstSlash < tail.length - 1) return sym(newBase)
  return sym(newInstance.doc().uri)
}

function getStatusMessage (statusArea: HTMLElement): HTMLElement {
  let message = statusArea.querySelector(':scope > .folder-pane-status-message') as HTMLElement | null
  if (!message) {
    message = statusArea.ownerDocument.createElement('div')
    message.className = 'folder-pane-status-message'
    statusArea.prepend(message)
  }
  return message
}

function setMintStatus (
  statusArea: HTMLElement,
  kind: 'progress' | 'success' | 'error',
  text: string
): HTMLElement {
  const dom = statusArea.ownerDocument
  const message = getStatusMessage(statusArea)
  statusArea.dataset.status = kind
  message.dataset.status = kind
  message.setAttribute('role', kind === 'error' ? 'alert' : 'status')
  if (kind === 'error') {
    const errorState = dom.createElement('solid-ui-error-state')
    errorState.setAttribute('title', text)
    errorState.addEventListener('close', () => statusArea.replaceChildren())
    message.replaceChildren(errorState)
    return message
  }
  const textElement = dom.createElement('span')
  textElement.className = kind === 'progress'
    ? 'folder-pane-status-text folder-pane-container-loading'
    : 'folder-pane-status-text'
  textElement.textContent = text
  message.replaceChildren(textElement)
  if (kind !== 'progress') {
    const dismiss = dom.createElement('solid-ui-button')
    dismiss.setAttribute('variant', 'ghost')
    dismiss.setAttribute('title', 'Dismiss')
    dismiss.setAttribute('aria-label', 'Dismiss')
    const icon = dom.createElement('icon-lucide-x')
    icon.setAttribute('slot', 'icon')
    dismiss.appendChild(icon)
    dismiss.addEventListener('click', () => statusArea.replaceChildren())
    message.appendChild(dismiss)
  }
  return message
}

/**
 * Run a pane's mintNew with the pane-registry contract used by the legacy
 * newThingUI and the folder-pane prototype. `newInstance` is deliberately not
 * supplied: panes derive their own documents (e.g. `index.ttl#this`) from
 * `newBase`, and a container URI passed as `newInstance` makes them write to
 * the container itself.
 */
async function mintPaneInstance ({
  context,
  container,
  pane,
  name,
  noun,
  statusArea,
  me,
  dom,
  mintTimeoutMs = 90_000,
  allowReplacement = false
}: MintPaneInstanceOptions): Promise<MintedPaneInstance> {
  if (!pane.mintNew) throw new PaneMintError(`The ${noun} pane cannot create new items.`)

  let normalizedName: string
  try {
    normalizedName = normalizeCreationName(name)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setMintStatus(statusArea, 'error', message)
    throw new PaneMintError(message, error)
  }

  statusArea.replaceChildren()
  if (isExtensionlessSourceFile(pane, normalizedName)) {
    const message = 'A new text file needs an extension, such as .txt, .ttl, or .json.'
    setMintStatus(statusArea, 'error', message)
    throw new PaneMintError(message)
  }

  setMintStatus(statusArea, 'progress', `Creating ${normalizedName} ${noun}`)
  // Pane-rendered messages and setup UI stay in the status area after minting.
  const paneOutput = statusArea.appendChild(dom.createElement('div'))
  paneOutput.className = 'folder-pane-status-pane-output'

  const newBase = getNewInstanceBase(container, normalizedName)
  if (!allowReplacement && hasKnownDestinationConflict(context, container, newBase)) {
    const message = `A resource named "${normalizedName}" already exists in this folder. Choose a different name; replacement is not enabled.`
    setMintStatus(statusArea, 'error', message)
    throw new PaneMintError(message)
  }
  const timeoutMessage = `The ${noun} pane did not finish creating the resource within ${mintTimeoutMs}ms. The result is uncertain; refresh the folder before retrying.`
  let timeout: ReturnType<typeof setTimeout> | undefined
  let result: Awaited<ReturnType<NonNullable<PaneDefinition['mintNew']>>> | undefined
  try {
    const mintOptions = {
      folder: container,
      newBase,
      title: normalizedName,
      pane,
      noun,
      div: paneOutput,
      dom,
      me,
      iconEle: dom.createElement('img'),
      noIndexHTML: true
    }
    const mintPromise = pane.mintNew(context, mintOptions)
    result = await Promise.race([
      mintPromise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(timeoutMessage)), mintTimeoutMs)
      })
    ])
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    setMintStatus(statusArea, 'error', `Unable to create ${noun} "${name}": ${reason}`)
    throw new PaneMintError(reason, error)
  } finally {
    if (timeout) clearTimeout(timeout)
  }

  if (!result?.newInstance) {
    // Some panes (e.g. issue-pane) report failures into `div` and resolve undefined.
    const paneMessage = paneOutput.textContent?.trim()
    setMintStatus(statusArea, 'error', paneMessage
      ? `Unable to create ${noun} "${name}". The ${noun} pane reported:`
      : `Unable to create ${noun} "${name}": the pane did not return a new resource.`)
    throw new PaneMintError(paneMessage || 'The pane did not return a new resource')
  }

  statusArea.replaceChildren()

  const sym = (uri: string) => context.session.store.sym(uri)
  return {
    newBase,
    newInstance: result.newInstance,
    containedResource: getContainedResource(container, newBase, result.newInstance, sym)
  }
}

export {
  getContainedResource,
  getNewInstanceBase,
  isExtensionlessSourceFile,
  mintPaneInstance,
  setMintStatus
}
