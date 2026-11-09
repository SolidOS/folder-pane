// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { namedNode } from 'rdflib'
import '../src/components/folder-pane-sidebar/FolderPaneSidebar'

const home = namedNode('https://example.test/')
const folder = namedNode('https://example.test/folder/')
const file = namedNode('https://example.test/file.txt')
const secondFile = namedNode('https://example.test/1doktest.html')
const thirdFile = namedNode('https://example.test/2.ttl')
const laterFile = namedNode('https://example.test/z.txt')

function createSidebar (members = [folder, file]) {
  const sidebar = document.createElement('folder-pane-sidebar') as any
  sidebar.subject = home
  sidebar.store = { fetcher: { load: vi.fn().mockResolvedValue(undefined) } }
  sidebar.resourceLogic = {
    getContainerMembers: (resource: any) => resource.sameTerm(home) ? members : [],
    isHiddenFile: () => false,
    isContainer: (resource: any) => resource.sameTerm(folder),
    containerHasIndexDocument: () => false,
    getContainerIndexThing: () => undefined
  }
  document.body.append(sidebar)
  return sidebar
}

async function rendered (sidebar: any) {
  await sidebar.updateComplete
  return Array.from(sidebar.renderRoot.querySelectorAll('[role="treeitem"]')) as HTMLElement[]
}

describe('folder pane sidebar tree', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('uses one roving tabindex and keeps selection separate from focus', async () => {
    const sidebar = createSidebar()
    const items = await rendered(sidebar)
    expect(items.filter(item => item.tabIndex === 0)).toHaveLength(1)
    expect(items.filter(item => item.tabIndex === -1)).toHaveLength(2)
    expect(items[0].getAttribute('aria-selected')).toBe('false')

    items[0].focus()
    items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await sidebar.updateComplete
    const next = await rendered(sidebar)
    expect(next.find(item => item.tabIndex === 0)?.dataset.resourceId).toBe(file.value)
    expect(sidebar.selectedResource).toBeUndefined()
  })

  it('uses the single roving tab stop to enter the tree and leaves Tab navigation to the browser', async () => {
    const sidebar = createSidebar()
    const items = await rendered(sidebar)
    const tabStop = items.find(item => item.tabIndex === 0)!

    expect(tabStop).toBe(items[0])
    expect(items.filter(item => item.tabIndex === 0)).toHaveLength(1)

    tabStop.focus()
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true
    })
    tabStop.dispatchEvent(tab)

    expect(tab.defaultPrevented).toBe(false)
    expect(sidebar.activeResourceId).toBe(home.value)
  })

  it('uses arrow keys within the tree while preserving one tab stop', async () => {
    const sidebar = createSidebar()
    const items = await rendered(sidebar)
    items[0].focus()
    items[0].dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true
    }))
    await sidebar.updateComplete

    const nextItems = await rendered(sidebar)
    expect(nextItems.filter(item => item.tabIndex === 0).map(item => item.dataset.resourceId))
      .toEqual([file.value])
    expect(nextItems.filter(item => item.tabIndex === -1)).toHaveLength(2)
  })

  it('navigates and expands containers without selecting them', async () => {
    const sidebar = createSidebar()
    let items = await rendered(sidebar)
    const selection = vi.fn()
    sidebar.addEventListener('resource-selected', selection)

    items[0].focus()
    items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await sidebar.updateComplete
    items = await rendered(sidebar)
    expect(items.map(item => item.dataset.resourceId)).toEqual([home.value, file.value, folder.value])
    expect(selection).not.toHaveBeenCalled()

    const folderItem = items.find(item => item.dataset.resourceId === folder.value)!
    folderItem.focus()
    folderItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await sidebar.updateComplete
    expect((await rendered(sidebar)).map(item => item.dataset.resourceId)).toEqual([home.value, file.value, folder.value])
    folderItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(selection).toHaveBeenCalledTimes(1)
  })

  it('moves through every visible item on sequential ArrowDown presses', async () => {
    const sidebar = createSidebar([namedNode('https://example.test/1.ttl'), secondFile, thirdFile])
    const items = await rendered(sidebar)
    const visibleIds = items.map(item => item.dataset.resourceId)
    items[0].focus()

    for (const expectedId of visibleIds.slice(1)) {
      sidebar.shadowRoot.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowDown', bubbles: true, cancelable: true
      }))
      await sidebar.updateComplete
      expect(sidebar.shadowRoot.activeElement.dataset.resourceId).toBe(expectedId)
    }
    for (const expectedId of visibleIds.slice(0, -1).reverse()) {
      sidebar.shadowRoot.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowUp', bubbles: true, cancelable: true
      }))
      await sidebar.updateComplete
      expect(sidebar.shadowRoot.activeElement.dataset.resourceId).toBe(expectedId)
    }
    const selection = vi.fn()
    sidebar.addEventListener('resource-selected', selection)
    items[1].focus()
    items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(selection).toHaveBeenCalledTimes(1)
    expect(selection.mock.calls[0][0].detail.resource.value).toBe(visibleIds[1])
  })

  it('focuses Home on storage entry but does not steal focus on refresh', async () => {
    const sidebar = createSidebar()
    const items = await rendered(sidebar)
    expect(sidebar.shadowRoot.activeElement).toBe(items[0])
    const button = document.createElement('button')
    document.body.append(button)
    button.focus()
    sidebar.refreshResources()
    await sidebar.updateComplete
    expect(document.activeElement).toBe(button)
  })

  it('cancels removal focus restoration when focus leaves the tree in the same turn', async () => {
    const sidebar = createSidebar()
    const items = await rendered(sidebar)
    items[1].focus()
    const button = document.createElement('button')
    document.body.append(button)
    sidebar.refreshResources()
    button.focus()
    await sidebar.updateComplete
    expect(document.activeElement).toBe(button)
  })

  it('keeps a failed expansion collapsed and retries it', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined)
    const sidebar = createSidebar()
    sidebar.store.fetcher.load = load
    const errors: CustomEvent[] = []
    sidebar.addEventListener('folder-pane-resource-error', (event: Event) => {
      errors.push(event as CustomEvent)
    })
    const folderItem = (await rendered(sidebar)).find(item => item.dataset.resourceId === folder.value)!
    folderItem.focus()
    folderItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await Promise.resolve()
    await sidebar.updateComplete
    expect(folderItem.getAttribute('aria-expanded')).toBe('false')
    expect(errors).toHaveLength(1)

    errors[0].detail.retry()
    await Promise.resolve()
    await sidebar.updateComplete
    expect((await rendered(sidebar)).find(item => item.dataset.resourceId === folder.value)
      ?.getAttribute('aria-expanded')).toBe('true')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('ignores a stale expansion after refresh and does not restore old focus', async () => {
    let resolveLoad!: () => void
    const load = vi.fn().mockImplementation(() => new Promise<void>(resolve => {
      resolveLoad = resolve
    }))
    const sidebar = createSidebar()
    sidebar.store.fetcher.load = load
    const folderItem = (await rendered(sidebar)).find(item => item.dataset.resourceId === folder.value)!
    folderItem.focus()
    folderItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await Promise.resolve()
    const button = document.createElement('button')
    document.body.append(button)
    button.focus()
    sidebar.refreshResources()
    resolveLoad()
    await Promise.resolve()
    await sidebar.updateComplete
    expect((await rendered(sidebar)).find(item => item.dataset.resourceId === folder.value)
      ?.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(button)
  })

  it('moves active focus to Home when its resource disappears on refresh', async () => {
    const members = [folder, file]
    const sidebar = createSidebar(members)
    const items = await rendered(sidebar)
    const fileItem = items.find(item => item.dataset.resourceId === file.value)!
    fileItem.focus()
    members.splice(1, 1)
    sidebar.refreshResources()
    await sidebar.updateComplete
    expect(sidebar.shadowRoot.activeElement?.dataset.resourceId).toBe(home.value)
  })

  it('repairs the roving tab stop when the active resource disappears without tree focus', async () => {
    const members = [folder, file]
    const sidebar = createSidebar(members)
    const items = await rendered(sidebar)
    const fileItem = items.find(item => item.dataset.resourceId === file.value)!
    const button = document.createElement('button')
    document.body.append(button)
    button.focus()
    sidebar.activeResourceId = file.value
    members.splice(1, 1)
    sidebar.refreshResources()
    await sidebar.updateComplete
    const remaining = await rendered(sidebar)
    expect(remaining.filter(item => item.tabIndex === 0).map(item => item.dataset.resourceId))
      .toEqual([home.value])
    expect(fileItem.isConnected).toBe(false)
    expect(document.activeElement).toBe(button)
  })

  it('does not restore delayed expansion focus after navigating to another item', async () => {
    let resolveLoad!: () => void
    const sidebar = createSidebar([folder, file, laterFile])
    sidebar.store.fetcher.load = vi.fn().mockImplementation(() => new Promise<void>(resolve => {
      resolveLoad = resolve
    }))
    let items = await rendered(sidebar)
    const folderItem = items.find(item => item.dataset.resourceId === folder.value)!
    const nextItem = items[items.indexOf(folderItem) + 1]
    expect(nextItem).toBeDefined()
    folderItem.focus()
    folderItem.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight', bubbles: true, cancelable: true
    }))
    await Promise.resolve()
    folderItem.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowDown', bubbles: true, cancelable: true
    }))
    await sidebar.updateComplete
    expect(sidebar.shadowRoot.activeElement?.dataset.resourceId).toBe(nextItem.dataset.resourceId)
    resolveLoad()
    await Promise.resolve()
    await sidebar.updateComplete
    items = await rendered(sidebar)
    expect(sidebar.shadowRoot.activeElement?.dataset.resourceId).toBe(nextItem.dataset.resourceId)
    expect(items.find(item => item.dataset.resourceId === folder.value)
      ?.getAttribute('aria-expanded')).toBe('true')
  })

  it('does not let an old subject expansion focus the new subject', async () => {
    let resolveLoad!: () => void
    const sidebar = createSidebar()
    sidebar.store.fetcher.load = vi.fn().mockImplementation(() => new Promise<void>(resolve => {
      resolveLoad = resolve
    }))
    const folderItem = (await rendered(sidebar)).find(item => item.dataset.resourceId === folder.value)!
    folderItem.focus()
    folderItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await Promise.resolve()
    const nextHome = namedNode('https://example.test/other/')
    sidebar.subject = nextHome
    await sidebar.updateComplete
    resolveLoad()
    await Promise.resolve()
    await sidebar.updateComplete
    expect(sidebar.shadowRoot.activeElement?.dataset.resourceId).toBe(nextHome.value)
  })
})
