// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { namedNode } from 'rdflib'
import FolderPaneView, {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_CONTENT_WIDTH,
  MIN_SIDEBAR_WIDTH
} from '../src/components/folder-pane-view/FolderPaneView'
import '../src/components/folder-pane-storage-header/FolderPaneStorageHeader'

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
