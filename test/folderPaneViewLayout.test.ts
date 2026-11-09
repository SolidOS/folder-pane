// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { namedNode } from 'rdflib'
import FolderPaneView, {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_CONTENT_WIDTH,
  MIN_SIDEBAR_WIDTH
} from '../src/components/folder-pane-view/FolderPaneView'
import '../src/components/folder-pane-storage-header/FolderPaneStorageHeader'
import type FolderPaneContainer from '../src/components/folder-pane-container/FolderPaneContainer'

describe('folder pane layout state', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('uses the default width and expanded state', async () => {
    const view = document.createElement('folder-pane-view') as FolderPaneView & {
      sidebarWidth: number
      sidebarCollapsed: boolean
    }
    document.body.append(view)
    await view.updateComplete

    const shell = view.querySelector('.folder-pane-main-content')!
    expect(view.sidebarWidth).toBe(DEFAULT_SIDEBAR_WIDTH)
    expect(view.sidebarCollapsed).toBe(false)
    expect(shell.dataset.sidebarCollapsed).toBe('false')
    expect(shell.getAttribute('style')).toContain(`--folder-pane-sidebar-width: ${DEFAULT_SIDEBAR_WIDTH}px`)
    expect(view.querySelectorAll('folder-pane-storage-header')).toHaveLength(1)
    expect(view.querySelectorAll('folder-pane-sidebar')).toHaveLength(1)
  })

  it('shows the storage toolbar above a standalone container without a sidebar or file-explorer header', async () => {
    const view = document.createElement('folder-pane-view') as FolderPaneView
    view.fullView = true
    view.subject = namedNode('http://localhost:3100/sharon/public/')
    document.body.append(view)
    await view.updateComplete
    view['renderContainerView'](view.subject)
    await view.updateComplete

    const header = view.querySelector('folder-pane-storage-header')!
    const container = view.querySelector('folder-pane-container') as FolderPaneContainer
    expect(header).toBeTruthy()
    expect(header.compareDocumentPosition(container) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.subject?.sameTerm(view.subject)).toBe(true)
    expect(view.querySelector('folder-pane-sidebar')).toBeNull()
    expect(view.querySelector('.folder-pane-sidebar-resizer')).toBeNull()
    expect(view.querySelector('solid-ui-file-explorer-header')).toBeNull()
    expect(view.querySelector('.folder-pane-status')).toBeTruthy()

    header.dispatchEvent(new CustomEvent('folder-pane-change-view', {
      detail: { view: 'list' },
      bubbles: true
    }))
    await view.updateComplete
    expect(container.view).toBe('list')
    expect(view.containerView).toBe('list')

    header.dispatchEvent(new CustomEvent('folder-pane-search', {
      detail: { query: 'notes' },
      bubbles: true
    }))
    await view.updateComplete
    expect(container.searchQuery).toBe('notes')
    expect(view.searchQuery).toBe('notes')

    header.dispatchEvent(new CustomEvent('folder-pane-change-view', {
      detail: { view: 'grid' },
      bubbles: true
    }))
    await view.updateComplete
    expect(container.view).toBe('grid')
  })

  it('labels a top-level folder by name and navigates to it from breadcrumbs', async () => {
    const header = document.createElement('folder-pane-storage-header') as
      HTMLElement & {
        subject: ReturnType<typeof namedNode>
        breadcrumbRoot: ReturnType<typeof namedNode>
        selectedResource: ReturnType<typeof namedNode>
        updateComplete: Promise<void>
        renderRoot: ParentNode
      }
    const podRoot = namedNode('https://pod.example/')
    const publicFolder = namedNode('https://pod.example/public/')
    const nestedFolder = namedNode('https://pod.example/public/inside/')
    header.subject = podRoot
    header.breadcrumbRoot = podRoot
    header.selectedResource = nestedFolder
    document.body.append(header)
    await header.updateComplete

    const root = header.renderRoot
    const buttons = Array.from(root.querySelectorAll('button'))
    expect(buttons.map(button => button.textContent?.trim())).toContain('public')

    const selectResource = vi.fn()
    header.addEventListener('folder-pane-select-resource', selectResource)
    buttons.find(button => button.textContent?.trim() === 'public')?.click()

    expect(selectResource).toHaveBeenCalledOnce()
    expect(selectResource.mock.calls[0][0].detail.resource.sameTerm(publicFolder)).toBe(true)
  })

  it('does not add a storage toolbar to standalone content that is not a container listing', async () => {
    const view = document.createElement('folder-pane-view') as FolderPaneView
    view.fullView = true
    document.body.append(view)
    await view.updateComplete

    expect(view.querySelector('folder-pane-storage-header')).toBeNull()
    expect(view.querySelector('folder-pane-sidebar')).toBeNull()
  })

  it('clamps widths to the minimum, maximum, and content minimum', () => {
    expect(clampSidebarWidth(10, 1200)).toBe(MIN_SIDEBAR_WIDTH)
    expect(clampSidebarWidth(999, 1200)).toBe(MAX_SIDEBAR_WIDTH)
    expect(clampSidebarWidth(999, 800)).toBe(800 - MIN_CONTENT_WIDTH)
  })

  it('uses the default for invalid widths or when no usable width is available', () => {
    expect(clampSidebarWidth(Number.NaN, 1200)).toBe(DEFAULT_SIDEBAR_WIDTH)
    expect(clampSidebarWidth(Number.POSITIVE_INFINITY, 1200)).toBe(DEFAULT_SIDEBAR_WIDTH)
    expect(clampSidebarWidth(300, Number.NaN)).toBe(DEFAULT_SIDEBAR_WIDTH)
    expect(clampSidebarWidth(300, MIN_CONTENT_WIDTH + MIN_SIDEBAR_WIDTH - 1)).toBe(DEFAULT_SIDEBAR_WIDTH)
  })

  it('keeps selection and the sidebar element when the width changes', async () => {
    const view = document.createElement('folder-pane-view') as FolderPaneView & {
      sidebarWidth: number
      selectedResource: ReturnType<typeof namedNode>
    }
    const selected = namedNode('https://example.test/selected')
    view.selectedResource = selected
    document.body.append(view)
    await view.updateComplete
    const sidebar = view.querySelector('folder-pane-sidebar')

    view.sidebarWidth = 360
    await view.updateComplete

    expect(view.selectedResource).toBe(selected)
    expect(view.querySelector('folder-pane-sidebar')).toBe(sidebar)
    expect(view.querySelector('.folder-pane-main-content')?.getAttribute('style'))
      .toContain('--folder-pane-sidebar-width: 360px')
  })

  it('keeps the parent selected after deleting a nested resource', async () => {
    const view = document.createElement('folder-pane-view') as FolderPaneView & {
      selectedResource: ReturnType<typeof namedNode>
      renderGeneration: number
      renderContainerView: (resource: ReturnType<typeof namedNode>) => void
      handleResourceDeleted: (event: Event) => void
    }
    const parent = namedNode('https://example.test/parent/')
    const resource = namedNode('https://example.test/parent/file.txt')
    view.subject = namedNode('https://example.test/')
    document.body.append(view)
    await view.updateComplete
    view.selectedResource = resource

    const renderContainerView = vi.spyOn(view as unknown as {
      renderContainerView: (resource: ReturnType<typeof namedNode>) => void
    }, 'renderContainerView')
    const generation = view.renderGeneration
    view.handleResourceDeleted(new CustomEvent('solid-resource-deleted', {
      detail: { resource }
    }))

    expect(view.renderGeneration).toBe(generation + 1)
    expect(view.selectedResource?.sameTerm(parent)).toBe(true)
    expect(renderContainerView).toHaveBeenCalledWith(parent)
  })

  it('toggles navigation with an action-oriented accessible name', async () => {
    const view = document.createElement('folder-pane-view') as FolderPaneView & {
      sidebarCollapsed: boolean
    }
    document.body.append(view)
    await view.updateComplete
    const toggle = view.querySelector('button.folder-pane-sidebar-toggle') as HTMLElement
    expect(toggle.getAttribute('aria-label')).toBe('Collapse navigation')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    toggle.click()
    await view.updateComplete
    expect(view.sidebarCollapsed).toBe(true)
    expect(toggle.getAttribute('aria-label')).toBe('Expand navigation')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(view.querySelector('.folder-pane-main-content')?.dataset.sidebarCollapsed).toBe('true')
    expect(view.querySelector('folder-pane-sidebar')?.getAttribute('aria-hidden')).toBe('true')
    expect(view.querySelector('.folder-pane-sidebar-resizer')?.hasAttribute('hidden')).toBe(false)
    expect(toggle.closest('.folder-pane-sidebar-resizer')).toBeTruthy()

    toggle.dispatchEvent(new CustomEvent('folder-pane-toggle-sidebar', { bubbles: true, composed: true }))
    await view.updateComplete
    expect(view.sidebarCollapsed).toBe(false)
    expect(document.activeElement).not.toBe(toggle)
  })

  it('moves tree focus to the toggle when collapsing navigation', async () => {
    const view = document.createElement('folder-pane-view') as FolderPaneView & {
      sidebarCollapsed: boolean
    }
    document.body.append(view)
    await view.updateComplete
    const sidebar = view.querySelector('folder-pane-sidebar') as any
    const toggle = view.querySelector('button.folder-pane-sidebar-toggle') as HTMLElement
    sidebar.tabIndex = 0
    sidebar.focus()

    toggle.dispatchEvent(new CustomEvent('folder-pane-toggle-sidebar', { bubbles: true, composed: true }))
    await view.updateComplete
    expect(view.sidebarCollapsed).toBe(true)
    expect(document.activeElement).toBe(toggle)
  })
})
