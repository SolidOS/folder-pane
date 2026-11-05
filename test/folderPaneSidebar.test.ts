// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { namedNode } from 'rdflib'
import '../src/components/folder-pane-sidebar/FolderPaneSidebar'

const home = namedNode('https://example.test/')
const folder = namedNode('https://example.test/folder/')
const file = namedNode('https://example.test/file.txt')
const secondFile = namedNode('https://example.test/1doktest.html')
const thirdFile = namedNode('https://example.test/2.ttl')

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
})
