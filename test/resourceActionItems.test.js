import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sym } from 'rdflib'

const solidUi = vi.hoisted(() => ({
  getRelevantPanes: vi.fn(),
  getPreferredPane: vi.fn(),
  preparePaneMenuItems: vi.fn(async ({ panes, openPane, subject }) => panes.map(pane => ({
    key: pane.name,
    label: pane.name,
    action: event => openPane(subject, pane.name, event)
  })))
}))
vi.mock('solid-ui', () => solidUi)

const { loadResourcePaneMenuItems } = await import('../src/resourceActionItems')

const pane = name => ({ name, label: () => name })

function makeContext () {
  return {
    session: {
      store: {
        fetcher: { load: vi.fn().mockResolvedValue(undefined) },
        sym
      }
    }
  }
}

describe('loadResourcePaneMenuItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('puts the preferred pane first and omits the folder pane', async () => {
    const panes = [pane('folder'), pane('source'), pane('dataContents')]
    solidUi.getRelevantPanes.mockResolvedValue(panes)
    solidUi.getPreferredPane.mockReturnValue(panes[2])
    const openPane = vi.fn()

    const items = await loadResourcePaneMenuItems({
      resource: sym('https://pod.example/data.ttl'),
      isContainer: false,
      context: makeContext(),
      openPane,
      isCurrent: () => true
    })

    expect(items.map(item => item.key)).toEqual(['dataContents', 'source'])
    const event = new Event('click')
    items[1].action(event)
    expect(openPane).toHaveBeenCalledWith('source', event)
  })

  it('resolves indexed containers to their application subject', async () => {
    solidUi.getRelevantPanes.mockResolvedValue([pane('contact')])
    solidUi.getPreferredPane.mockReturnValue(undefined)
    const context = makeContext()
    const container = sym('https://pod.example/contacts/')

    await loadResourcePaneMenuItems({
      resource: container,
      isContainer: true,
      context,
      resourceLogic: { containerHasIndexDocument: () => true },
      openPane: vi.fn(),
      isCurrent: () => true
    })

    expect(context.session.store.fetcher.load).toHaveBeenCalledWith(sym('https://pod.example/contacts/index.ttl'))
    expect(solidUi.getRelevantPanes.mock.calls[0][0].uri).toBe('https://pod.example/contacts/index.ttl#this')
  })

  it('includes Contents for a container when requested', async () => {
    const panes = [pane('source'), pane('folder')]
    solidUi.getRelevantPanes.mockResolvedValue(panes)
    solidUi.getPreferredPane.mockReturnValue(panes[0])

    const items = await loadResourcePaneMenuItems({
      resource: sym('https://pod.example/contacts/'),
      isContainer: true,
      context: makeContext(),
      includeFolderPane: true,
      openPane: vi.fn(),
      isCurrent: () => true
    })

    expect(items.map(item => item.label)).toEqual(['source', 'Contents'])
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
