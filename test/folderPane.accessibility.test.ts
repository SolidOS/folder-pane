// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { namedNode } from 'rdflib'
import '../src/components/folder-pane-sidebar/FolderPaneSidebar'
import '../src/components/folder-pane-storage-header/FolderPaneStorageHeader'
import '../src/components/folder-pane-view/FolderPaneView'

const home = namedNode('https://example.test/')
const folder = namedNode('https://example.test/folder/')
const file = namedNode('https://example.test/file.txt')

function createSidebar () {
  const sidebar = document.createElement('folder-pane-sidebar') as any
  sidebar.subject = home
  sidebar.store = {
    fetcher: {
      load: vi.fn().mockResolvedValue(undefined),
      getState: vi.fn().mockReturnValue(undefined),
      unload: vi.fn()
    }
  }
  sidebar.resourceLogic = {
    getContainerMembers: (resource: any) => resource.sameTerm(home) ? [folder, file] : [],
    isHiddenFile: () => false,
    isContainer: (resource: any) => resource.sameTerm(folder),
    containerHasIndexDocument: () => false,
    getContainerIndexThing: () => undefined
  }
  document.body.append(sidebar)
  return sidebar
}

async function expectAxeClean (container: Element): Promise<void> {
  const results = await axe(container)
  expect(results.violations).toHaveLength(0)
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('Folder-pane accessibility', () => {
  it('keeps the populated navigation tree axe-clean and keyboard navigable', async () => {
    const sidebar = createSidebar()
    await sidebar.updateComplete

    const items = Array.from(
      sidebar.renderRoot.querySelectorAll<HTMLElement>('[role="treeitem"]')
    )
    expect(items).toHaveLength(3)
    expect(items.filter(item => item.tabIndex === 0)).toHaveLength(1)

    items[0].focus()
    items[0].dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true
    }))
    await sidebar.updateComplete
    expect(sidebar.renderRoot.activeElement).toBe(items[1])
    await expectAxeClean(sidebar)
  })

  it('keeps the storage header controls labelled and axe-clean', async () => {
    const header = document.createElement('folder-pane-storage-header') as any
    header.subject = home
    header.breadcrumbRoot = home
    header.selectedResource = home
    document.body.append(header)
    await header.updateComplete

    const controls = Array.from(header.renderRoot.querySelectorAll('button, input, solid-ui-button'))
    expect(controls.length).toBeGreaterThan(0)
    expect(controls.every(control => control.textContent?.trim() || control.getAttribute('aria-label'))).toBe(true)
    await expectAxeClean(header)
  })

  it('keeps the sidebar accessible when collapsed', async () => {
    const sidebar = createSidebar()
    await sidebar.updateComplete
    const view = document.createElement('folder-pane-view') as any
    document.body.append(view)
    await view.updateComplete

    const viewSidebar = view.querySelector('folder-pane-sidebar') as any
    viewSidebar.subject = home
    viewSidebar.store = sidebar.store
    viewSidebar.resourceLogic = sidebar.resourceLogic
    await viewSidebar.updateComplete
    expect(viewSidebar.renderRoot.querySelectorAll('[role="treeitem"]')).toHaveLength(3)
    sidebar.remove()

    const toggle = view.querySelector('button.folder-pane-sidebar-toggle') as HTMLElement
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    toggle.click()
    await view.updateComplete
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(view.querySelector('folder-pane-sidebar')?.getAttribute('aria-hidden')).toBe('true')
    await expectAxeClean(view)
  })
})
