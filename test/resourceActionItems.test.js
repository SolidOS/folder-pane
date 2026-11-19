import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sym } from 'rdflib'

const solidUi = vi.hoisted(() => ({
  getRelevantPanes: vi.fn(),
  getPreferredPane: vi.fn(),
  preparePaneMenuItems: vi.fn(async ({ panes, openPane, subject }) => panes.map(pane => ({
    key: pane.name,
    label: pane.label(subject),
    action: event => openPane(subject, pane.name, event)
  })))
}))
vi.mock('solid-ui', () => solidUi)

const { loadResourcePaneMenuItems } = await import('../src/resourceActionItems')

const pane = name => ({ name, label: () => name })

function makeContext (panes = []) {
  return {
    session: {
      store: {
        fetcher: { load: vi.fn().mockResolvedValue(undefined) },
        sym
      },
      paneRegistry: {
        list: panes,
        byName: vi.fn(name => panes.find(pane => pane.name === name))
      }
    }
  }
}

describe('loadResourcePaneMenuItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    solidUi.getPreferredPane.mockImplementation((_subject, _context, panes) => panes[0])
  })

  it('puts the preferred pane first and preserves the remaining registry order', async () => {
    const panes = [pane('source'), pane('dataContents')]
    solidUi.getRelevantPanes.mockResolvedValue(panes)
    solidUi.getPreferredPane.mockImplementation((_subject, _context, panes) => panes[1])
    const openPane = vi.fn()

    const items = await loadResourcePaneMenuItems({
      resource: sym('https://pod.example/data.ttl'),
      isContainer: false,
      context: makeContext(panes),
      openPane,
      isCurrent: () => true
    })

    expect(items.map(item => item.key)).toEqual(['dataContents', 'source'])
    const event = new Event('click')
    items[1].action(event)
    expect(openPane).toHaveBeenCalledWith(sym('https://pod.example/data.ttl'), 'source', event)
  })

  it('uses the container subject for menus even when it has an index document', async () => {
    const contact = { ...pane('contact'), label: subject => subject.uri.endsWith('#this') ? 'Contacts' : null }
    const folder = { ...pane('folder'), label: subject => subject.uri.endsWith('/') ? 'Contents (2)' : null }
    const panes = [contact, folder]
    solidUi.getRelevantPanes.mockImplementation(async subject => panes.filter(pane => pane.label(subject)))
    const context = makeContext(panes)
    const container = sym('https://pod.example/contacts/')
    const openPane = vi.fn()

    const items = await loadResourcePaneMenuItems({
      resource: container,
      isContainer: true,
      context,
      resourceLogic: { containerHasIndexDocument: () => true },
      openPane,
      isCurrent: () => true
    })

    expect(context.session.store.fetcher.load).toHaveBeenCalledWith(container)
    expect(solidUi.getRelevantPanes.mock.calls.map(([subject]) => subject.uri)).toEqual([
      container.uri, 'https://pod.example/contacts/index.ttl#this'
    ])
    expect(items.map(item => item.label)).toEqual(['Contacts', 'Contents (2)'])
    const event = new Event('click')
    items[0].action(event)
    expect(openPane).toHaveBeenCalledWith(sym('https://pod.example/contacts/index.ttl#this'), 'contact', event)
  })

  it('preserves shared container panes and maps only the primary indexed pane to the application', async () => {
    const contact = { ...pane('contact'), label: () => 'Contacts' }
    const folder = { ...pane('folder'), label: () => 'Contents (2)' }
    const shared = ['slideshow', 'dataContents', 'source', 'n3', 'RDFXML', 'default', 'internal'].map(pane)
    const applicationOnly = pane('applicationOnly')
    const panes = [contact, folder, ...shared, applicationOnly]
    solidUi.getRelevantPanes.mockImplementation(async subject =>
      subject.uri.endsWith('#this') ? [contact, ...shared, applicationOnly] : [folder, ...shared]
    )
    const openPane = vi.fn()
    const container = sym('https://pod.example/contacts/')

    const items = await loadResourcePaneMenuItems({
      resource: container,
      isContainer: true,
      context: makeContext(panes),
      resourceLogic: { containerHasIndexDocument: () => true },
      openPane,
      isCurrent: () => true
    })

    expect(items.map(item => item.key)).toEqual(['contact', 'folder', ...shared.map(pane => pane.name)])
    const event = new Event('click')
    for (const item of items.slice(1)) {
      item.action(event)
      expect(openPane).toHaveBeenLastCalledWith(container, item.key, event)
    }
    items[0].action(event)
    expect(openPane).toHaveBeenLastCalledWith(sym(`${container.uri}index.ttl#this`), 'contact', event)
  })

  it('includes the relevant folder pane without a menu-specific inclusion option', async () => {
    const panes = [pane('source'), pane('folder')]
    solidUi.getRelevantPanes.mockResolvedValue(panes)

    const items = await loadResourcePaneMenuItems({
      resource: sym('https://pod.example/contacts/'),
      isContainer: true,
      context: makeContext(panes),
      openPane: vi.fn(),
      isCurrent: () => true
    })

    expect(items.map(item => item.label)).toEqual(['source', 'folder'])
  })

  it('keeps Contents first and Slideshow second in registry order', async () => {
    const panes = [pane('folder'), pane('slideshow'), pane('source')]
    solidUi.getRelevantPanes.mockResolvedValue(panes)

    const items = await loadResourcePaneMenuItems({
      resource: sym('https://pod.example/slideshow/'),
      isContainer: true,
      context: makeContext(panes),
      openPane: vi.fn(),
      isCurrent: () => true
    })

    expect(items.map(item => item.label)).toEqual(['folder', 'slideshow', 'source'])
  })

  it('preserves registry order for the remaining container panes', async () => {
    const panes = [pane('folder'), pane('slideshow'), pane('source')]
    solidUi.getRelevantPanes.mockResolvedValue(panes)

    const items = await loadResourcePaneMenuItems({
      resource: sym('https://pod.example/empty/'),
      isContainer: true,
      context: makeContext(panes),
      openPane: vi.fn(),
      isCurrent: () => true
    })

    expect(items.map(item => item.label)).toEqual(['folder', 'slideshow', 'source'])
  })

  it('waits for the document to load before asking for relevant panes', async () => {
    const panes = [pane('folder')]
    const context = makeContext(panes)
    let finishLoad
    context.session.store.fetcher.load.mockReturnValue(new Promise(resolve => { finishLoad = resolve }))
    solidUi.getRelevantPanes.mockResolvedValue(panes)
    const result = loadResourcePaneMenuItems({
      resource: sym('https://pod.example/empty/'),
      isContainer: true,
      context,
      openPane: vi.fn(),
      isCurrent: () => true
    })

    expect(solidUi.getRelevantPanes).not.toHaveBeenCalled()
    finishLoad()
    expect((await result).map(item => item.label)).toEqual(['folder'])
  })

  it('returns undefined when the request becomes stale', async () => {
    solidUi.getRelevantPanes.mockResolvedValue([pane('source')])
    let current = true
    solidUi.getPreferredPane.mockImplementation(() => {
      current = false
      return undefined
    })

    const items = await loadResourcePaneMenuItems({
      resource: sym('https://pod.example/data.ttl'),
      isContainer: false,
      context: makeContext(),
      openPane: vi.fn(),
      isCurrent: () => current
    })

    expect(items).toBeUndefined()
  })
})
