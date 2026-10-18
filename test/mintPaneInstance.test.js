import { describe, expect, it, vi } from 'vitest'
import { sym } from 'rdflib'
import { getContainedResource, getNewInstanceBase, isExtensionlessSourceFile, mintPaneInstance, PaneMintError } from '../src/mintPaneInstance'
import { getIndexedContainer, getResourcesForContainer } from '../src/helpers'

vi.mock('solid-ui', () => ({ utils: { label: resource => resource.uri }, ns: {}, icons: { iconBase: '' }, widgets: {} }))
vi.mock('solid-logic', () => ({ authn: {} }))

class FakeElement {
  constructor (tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = ownerDocument
    this.children = []
    this.parent = null
    this.dataset = {}
    this.attributes = {}
    this.listeners = {}
    this.className = ''
    this.ownText = ''
  }

  get textContent () { return this.ownText + this.children.map(child => child.textContent).join('') }
  set textContent (value) { this.children = []; this.ownText = value }
  appendChild (child) { child.remove(); child.parent = this; this.children.push(child); return child }
  prepend (child) { child.remove(); child.parent = this; this.children.unshift(child) }
  replaceChildren (...children) { this.children.forEach(c => { c.parent = null }); this.children = []; children.forEach(c => this.appendChild(c)) }
  remove () { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null }
  hasChildNodes () { return this.children.length > 0 || this.ownText.length > 0 }
  setAttribute (name, value) { this.attributes[name] = value }
  getAttribute (name) { return this.attributes[name] }
  addEventListener (type, listener) { this.listeners[type] = listener }
  click () { this.listeners.click?.() }
  querySelector (selector) {
    const className = selector.replace(':scope > .', '')
    return this.children.find(child => child.className === className) ?? null
  }
}

function createDom () {
  const dom = { createElement: tag => new FakeElement(tag, dom) }
  return dom
}

const container = sym('https://pod.example/storage/')
const context = { session: { store: { sym } } }

function setup () {
  const dom = createDom()
  const statusArea = dom.createElement('div')
  statusArea.className = 'folder-pane-status'
  return { dom, statusArea }
}

const message = statusArea => statusArea.querySelector(':scope > .folder-pane-status-message')
const paneOutput = statusArea => statusArea.querySelector(':scope > .folder-pane-status-pane-output')

describe('mintPaneInstance', () => {
  it('uses the legacy newThingUI contract and never supplies newInstance', async () => {
    const { dom, statusArea } = setup()
    const nestedContainer = sym('https://pod.example/storage/projects/')
    const mintNew = vi.fn(async (_context, options) => {
      expect(options.div.parent).toBe(statusArea)
      return { ...options, newInstance: sym(`${options.newBase}index.ttl#this`) }
    })
    const pane = { name: 'issue', mintNew }
    const created = await mintPaneInstance({ context, container: nestedContainer, pane, name: 'My Tracker', noun: 'tracker', statusArea, dom })

    const options = mintNew.mock.calls[0][1]
    expect(options).not.toHaveProperty('newInstance')
    expect(options).toMatchObject({ folder: nestedContainer, newBase: 'https://pod.example/storage/projects/My%20Tracker/', pane, noun: 'tracker', noIndexHTML: true })
    expect(created.newInstance.uri).toBe('https://pod.example/storage/projects/My%20Tracker/index.ttl#this')
    expect(created.containedResource.uri).toBe('https://pod.example/storage/projects/My%20Tracker/')
    expect(statusArea.children).toHaveLength(0)
  })

  it('clears pane-rendered success content after creation', async () => {
    const { dom, statusArea } = setup()
    const pane = {
      name: 'contacts',
      mintNew: async (ctx, options) => {
        const p = options.dom.createElement('p')
        p.textContent = 'Your address book is ready'
        options.div.appendChild(p)
        return Object.assign({ newInstance: sym(`${options.newBase}index.ttl#this`) }, ctx)
      }
    }
    const created = await mintPaneInstance({ context, container, pane, name: 'People', noun: 'address book', statusArea, dom })
    expect(created.containedResource.uri).toBe('https://pod.example/storage/People/')
    expect(statusArea.children).toHaveLength(0)
  })

  it('shows the pane name and resource name in the centered creation status', async () => {
    const { dom, statusArea } = setup()
    let resolveMint
    const pane = {
      name: 'contacts',
      mintNew: () => new Promise(resolve => { resolveMint = resolve })
    }

    const mint = mintPaneInstance({ context, container, pane, name: 'People', noun: 'Address book', statusArea, dom })
    await Promise.resolve()

    expect(message(statusArea).textContent).toBe('Creating People Address book')
    expect(statusArea.dataset.status).toBe('progress')
    expect(message(statusArea).dataset.status).toBe('progress')
    expect(message(statusArea).children[0].className).toContain('folder-pane-container-loading')

    resolveMint({ newInstance: sym('https://pod.example/storage/People/') })
    await mint
  })

  it('reports a pane that resolves undefined after complaining into its div', async () => {
    const { dom, statusArea } = setup()
    const pane = {
      name: 'issue',
      mintNew: async (_ctx, options) => {
        const complaint = options.dom.createElement('p')
        complaint.textContent = 'Error creating the tracker configuration'
        options.div.appendChild(complaint)
        return undefined
      }
    }
    await expect(mintPaneInstance({ context, container, pane, name: 'T', noun: 'tracker', statusArea, dom }))
      .rejects.toThrow(PaneMintError)
    expect(message(statusArea).dataset.status).toBe('error')
    expect(message(statusArea).getAttribute('role')).toBe('alert')
    expect(message(statusArea).children[0].tagName).toBe('SOLID-UI-ERROR-STATE')
    expect(message(statusArea).children[0].getAttribute('title')).toContain('Unable to create tracker "T"')
    expect(paneOutput(statusArea).textContent).toBe('Error creating the tracker configuration')
  })

  it('reports rejected mints and lets the user dismiss the message', async () => {
    const { dom, statusArea } = setup()
    const pane = { name: 'source', mintNew: async () => { throw new Error('request failed') } }
    await expect(mintPaneInstance({ context, container, pane, name: 'x.txt', noun: 'file', statusArea, dom }))
      .rejects.toThrow('request failed')
    const errorState = message(statusArea).children.find(c => c.tagName === 'SOLID-UI-ERROR-STATE')
    expect(errorState).toBeDefined()
    expect(errorState.getAttribute('title')).toContain('request failed')
    errorState.listeners.close()
    expect(statusArea.children).toHaveLength(0)
  })

  it('reports an extensionless source file without invoking its alerting mint handler', async () => {
    const { dom, statusArea } = setup()
    const mintNew = vi.fn(() => {
      throw new Error('source pane should not be called')
    })
    const pane = { name: 'source', mintNew }

    await expect(mintPaneInstance({ context, container, pane, name: 'notes', noun: 'file', statusArea, dom }))
      .rejects.toThrow('needs an extension')

    expect(mintNew).not.toHaveBeenCalled()
    expect(message(statusArea).dataset.status).toBe('error')
    expect(message(statusArea).children[0].tagName).toBe('SOLID-UI-ERROR-STATE')
    expect(message(statusArea).children[0].getAttribute('title')).toContain('needs an extension')
  })

  it('clears the previous result before a new mint', async () => {
    const { dom, statusArea } = setup()
    const failing = { name: 'issue', mintNew: async () => { throw new Error('first') } }
    await expect(mintPaneInstance({ context, container, pane: failing, name: 'a', noun: 'tracker', statusArea, dom })).rejects.toThrow()
    const ok = {
      name: 'folder',
      mintNew: async (_c, o) => {
        const output = o.dom.createElement('p')
        output.textContent = 'Folder created'
        o.div.appendChild(output)
        return { ...o, newInstance: sym(o.newBase) }
      }
    }
    await mintPaneInstance({ context, container, pane: ok, name: 'b', noun: 'folder', statusArea, dom })
    expect(statusArea.children).toHaveLength(0)
  })

  it('removes successful pane output from the status area', async () => {
    const { dom, statusArea } = setup()
    const pane = {
      name: 'contacts',
      mintNew: async (_ctx, options) => {
        const output = options.dom.createElement('p')
        output.textContent = 'Address book created'
        options.div.appendChild(output)
        return { ...options, newInstance: sym(options.newBase) }
      }
    }

    await mintPaneInstance({ context, container, pane, name: 'People', noun: 'address book', statusArea, dom })
    expect(statusArea.children).toHaveLength(0)
  })

  it('turns a hung pane mint into a dismissible error', async () => {
    const { dom, statusArea } = setup()
    const pane = { name: 'pad', mintNew: async () => new Promise(() => {}) }

    await expect(mintPaneInstance({
      context,
      container,
      pane,
      name: 'Notes',
      noun: 'notepad',
      statusArea,
      dom,
      mintTimeoutMs: 1
    })).rejects.toThrow('did not finish creating')
    expect(message(statusArea).children[0].tagName).toBe('SOLID-UI-ERROR-STATE')
  })
})

describe('created resource containment', () => {
  const newBase = getNewInstanceBase(container, 'item')
  it.each([
    ['index-based panes', `${newBase}index.ttl#this`, newBase],
    ['schedule details document', `${newBase}details.ttl#event`, newBase],
    ['folders', newBase, newBase],
    ['dokieli documents', 'https://pod.example/storage/item.html', 'https://pod.example/storage/item.html'],
    ['source files', 'https://pod.example/storage/notes.txt', 'https://pod.example/storage/notes.txt']
  ])('maps %s to the direct container member', (_label, instance, expected) => {
    expect(getContainedResource(container, newBase, sym(instance), sym).uri).toBe(expected)
  })
})

describe('index resources', () => {
  it('maps only the synthetic index thing to its container', () => {
    expect(getIndexedContainer(sym('https://pod.example/a/index.ttl#this'))).toBe('https://pod.example/a/')
    expect(getIndexedContainer(sym('https://pod.example/a/index.ttl'))).toBeNull()
    expect(getIndexedContainer(sym('https://pod.example/a/other.ttl#this'))).toBeNull()
  })

  it('lists a real index.ttl document as a container resource', () => {
    const indexDocument = sym('https://pod.example/a/index.ttl')
    const resources = getResourcesForContainer(sym('https://pod.example/a/'), {
      isContainer: () => false,
      isHiddenFile: () => false,
      getContainerMembers: () => [indexDocument, sym('https://pod.example/a/index.ttl#this')]
    })
    expect([...resources.keys()]).toEqual([indexDocument.uri])
  })
})
