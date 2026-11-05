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
})
