// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { sym } from 'rdflib'
import type FolderPaneContainer from '../src/components/folder-pane-container/FolderPaneContainer'
import '../src/components/folder-pane-container/FolderPaneContainer'

const home = sym('https://pod.example/files/')
const folder = sym(`${home.uri}folder/`)
const file = sym(`${home.uri}file.txt`)
const otherFile = sym('https://pod.example/other/other.txt')

function createContainer (view: 'grid' | 'list') {
  const container = document.createElement('folder-pane-container') as FolderPaneContainer
  container.subject = home
  container.view = view
  container.resourceLogic = {
    getContainerMembers: resource => resource.sameTerm(home) ? [folder, file] : [otherFile],
    isHiddenFile: () => false,
    isContainer: resource => resource.uri.endsWith('/'),
    containerHasIndexDocument: () => false,
    getContainerIndexThing: vi.fn(),
    uploadFiles: vi.fn()
  }
  document.body.append(container)
  return container
}

async function renderedItems (container: FolderPaneContainer) {
  await container.updateComplete
  await container.updateComplete
  return Array.from(container.shadowRoot!.querySelectorAll<HTMLElement>('[data-resource-id]'))
}

function dragEvent (type: string, setData = vi.fn()) {
  const event = new Event(type, { bubbles: true, composed: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: { setData, dropEffect: 'none' }
  })
  return { event, setData }
}

function expectResourceDrag (item: HTMLElement) {
  expect(item.draggable).toBe(true)
  const { event, setData } = dragEvent('dragstart')
  item.querySelector('span')!.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
  expect(setData.mock.calls).toEqual([
    ['text/uri-list', item.dataset.resourceId],
    ['text/plain', item.dataset.resourceId],
    ['text/html', item.outerHTML]
  ])
  expect(item.style.fontWeight).toBe('bold')
  item.dispatchEvent(dragEvent('dragend').event)
  expect(item.style.fontWeight).toBe('normal')
}

describe.each(['grid', 'list'] as const)('folder pane content dragging in %s view', view => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('drags both files and folders without requiring upload permission or selecting them', async () => {
    const container = createContainer(view)
    const selected = vi.fn()
    const uploaded = vi.fn()
    container.addEventListener('resource-selected', selected)
    container.addEventListener('folder-pane-upload-files', uploaded)
    const items = await renderedItems(container)

    expect(container.canUpload).toBe(false)
    expect(items.map(item => item.dataset.resourceId).sort()).toEqual([file.uri, folder.uri].sort())
    items.forEach(expectResourceDrag)
    expect(selected).not.toHaveBeenCalled()
    expect(uploaded).not.toHaveBeenCalled()
    expect(container.shadowRoot!.querySelector('[data-drag-active]')!.getAttribute('data-drag-active')).toBe('false')
  })

  it('keeps the correct URI and a single set of handlers after filtering and rerendering', async () => {
    const container = createContainer(view)
    await renderedItems(container)

    container.searchQuery = 'folder'
    const filtered = await renderedItems(container)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].dataset.resourceId).toBe(folder.uri)
    expectResourceDrag(filtered[0])

    container.searchQuery = ''
    const items = await renderedItems(container)
    items.forEach(expectResourceDrag)

    container.requestUpdate()
    await renderedItems(container)
    container.remove()
    document.body.append(container)
    const reconnected = await renderedItems(container)
    reconnected.forEach(expectResourceDrag)
  })

  it('uses the new resource URI after navigating to another container', async () => {
    const container = createContainer(view)
    await renderedItems(container)
    container.subject = sym('https://pod.example/other/')
    const items = await renderedItems(container)
    expect(items).toHaveLength(1)
    expect(items[0].dataset.resourceId).toBe(otherFile.uri)
    expectResourceDrag(items[0])
  })

  it('keeps resources draggable when switching views', async () => {
    const container = createContainer(view)
    await renderedItems(container)
    container.view = view === 'grid' ? 'list' : 'grid'
    const items = await renderedItems(container)
    expect(items).toHaveLength(2)
    items.forEach(expectResourceDrag)
  })
})
