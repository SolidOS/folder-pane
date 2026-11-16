// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FolderPaneView, {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  SIDEBAR_RESIZE_STEP
} from '../src/components/folder-pane-view/FolderPaneView'

describe('folder pane sidebar resizing', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200)
  })

  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  async function setup () {
    const view = document.createElement('folder-pane-view') as FolderPaneView
    document.body.append(view)
    await view.updateComplete
    await view.updateComplete
    const separator = view.querySelector<HTMLElement>('.folder-pane-sidebar-resize-handle')!
    let captured: number | undefined
    const capture = vi.fn((id: number) => { captured = id })
    const release = vi.fn(() => { captured = undefined })
    Object.assign(separator, {
      setPointerCapture: capture,
      hasPointerCapture: (id: number) => captured === id,
      releasePointerCapture: release
    })
    return { view, separator, capture, release }
  }

  function pointer (element: HTMLElement, type: string, options: {
    clientX?: number
    button?: number
    pointerId?: number
    isPrimary?: boolean
  } = {}) {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: options.clientX ?? 100,
      button: options.button ?? 0
    })
    Object.assign(event, {
      pointerId: options.pointerId ?? 1,
      isPrimary: options.isPrimary ?? true
    })
    element.dispatchEvent(event)
    return event
  }

  function key (element: HTMLElement, value: string) {
    const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })
    element.dispatchEvent(event)
    return event
  }

  it('reuses the divider with a focusable separator beside the collapse button', async () => {
    const { view, separator } = await setup()
    expect(view.querySelectorAll('.folder-pane-sidebar-resizer')).toHaveLength(1)
    expect(separator.getAttribute('role')).toBe('separator')
    expect(separator.getAttribute('aria-label')).toBe('Resize navigation sidebar')
    expect(separator.getAttribute('aria-orientation')).toBe('vertical')
    expect(separator.getAttribute('aria-valuemin')).toBe(String(MIN_SIDEBAR_WIDTH))
    expect(separator.getAttribute('aria-valuemax')).toBe(String(MAX_SIDEBAR_WIDTH))
    expect(separator.getAttribute('aria-valuenow')).toBe(String(DEFAULT_SIDEBAR_WIDTH))
    expect(separator.tabIndex).toBe(0)
    expect(separator.querySelector('button')).toBeNull()
    expect(separator.parentElement?.querySelector('.folder-pane-sidebar-toggle')).not.toBeNull()
  })

  it('captures the primary pointer and resizes from the starting width', async () => {
    const { view, separator, capture } = await setup()
    const event = pointer(separator, 'pointerdown')
    expect(event.defaultPrevented).toBe(true)
    expect(capture).toHaveBeenCalledWith(1)
    expect(document.activeElement).toBe(separator)
    await view.updateComplete
    expect(separator.parentElement?.dataset.resizing).toBe('true')
    pointer(separator, 'pointermove', { clientX: 150 })
    await view.updateComplete
    expect(separator.getAttribute('aria-valuenow')).toBe('306')
    expect(view.querySelector('.folder-pane-main-content')?.getAttribute('style'))
      .toContain('--folder-pane-sidebar-width: 306px')
    pointer(separator, 'pointermove', { clientX: 120 })
    await view.updateComplete
    expect(separator.getAttribute('aria-valuenow')).toBe('276')
  })

  it('ignores secondary buttons, non-primary pointers and unrelated pointer IDs', async () => {
    const { view, separator, capture } = await setup()
    expect(pointer(separator, 'pointerdown', { button: 2 }).defaultPrevented).toBe(false)
    pointer(separator, 'pointerdown', { isPrimary: false })
    expect(capture).not.toHaveBeenCalled()
    pointer(separator, 'pointerdown')
    pointer(separator, 'pointermove', { pointerId: 2, clientX: 500 })
    pointer(separator, 'pointerup', { pointerId: 2 })
    await view.updateComplete
    expect(separator.getAttribute('aria-valuenow')).toBe('256')
    expect(separator.parentElement?.dataset.resizing).toBe('true')
  })

  it('clamps pointer movement to both width limits', async () => {
    const { view, separator } = await setup()
    pointer(separator, 'pointerdown')
    pointer(separator, 'pointermove', { clientX: -1000 })
    await view.updateComplete
    expect(separator.getAttribute('aria-valuenow')).toBe('180')
    pointer(separator, 'pointermove', { clientX: 2000 })
    await view.updateComplete
    expect(separator.getAttribute('aria-valuenow')).toBe('480')
  })

  it.each(['pointerup', 'pointercancel', 'lostpointercapture'])('cleans up on %s', async type => {
    const { view, separator, release } = await setup()
    pointer(separator, 'pointerdown')
    pointer(separator, type)
    await view.updateComplete
    expect(release).toHaveBeenCalledWith(1)
    expect(separator.parentElement?.dataset.resizing).toBe('false')
    pointer(separator, 'pointermove', { clientX: 200 })
    await view.updateComplete
    expect(separator.getAttribute('aria-valuenow')).toBe('256')
  })

  it('supports ArrowLeft, ArrowRight, Home and End and updates ARIA values', async () => {
    const { view, separator } = await setup()
    for (const [value, width] of [
      ['ArrowLeft', DEFAULT_SIDEBAR_WIDTH - SIDEBAR_RESIZE_STEP],
      ['ArrowRight', DEFAULT_SIDEBAR_WIDTH],
      ['Home', MIN_SIDEBAR_WIDTH],
      ['End', MAX_SIDEBAR_WIDTH]
    ] as const) {
      expect(key(separator, value).defaultPrevented).toBe(true)
      await view.updateComplete
      expect(separator.getAttribute('aria-valuenow')).toBe(String(width))
    }
    expect(key(separator, 'Tab').defaultPrevented).toBe(false)
  })

  it('reserves the content minimum when reporting and applying the maximum', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(700)
    const { view, separator } = await setup()
    expect(separator.getAttribute('aria-valuemax')).toBe('380')
    key(separator, 'End')
    await view.updateComplete
    expect(separator.getAttribute('aria-valuenow')).toBe('380')
  })

  it('cancels a drag on collapse, transfers focus and disables resizing', async () => {
    const { view, separator, capture, release } = await setup()
    pointer(separator, 'pointerdown')
    view.querySelector('.folder-pane-main-content')!
      .dispatchEvent(new CustomEvent('folder-pane-toggle-sidebar', { bubbles: true }))
    await view.updateComplete
    expect(release).toHaveBeenCalledWith(1)
    expect(separator.hidden).toBe(true)
    expect(separator.hasAttribute('inert')).toBe(true)
    expect(separator.tabIndex).toBe(-1)
    const toggle = view.querySelector<HTMLButtonElement>('.folder-pane-sidebar-toggle')!
    expect(document.activeElement).toBe(toggle)
    pointer(separator, 'pointerdown')
    key(separator, 'End')
    await view.updateComplete
    expect(capture).toHaveBeenCalledTimes(1)
    expect(separator.getAttribute('aria-valuenow')).toBe('256')
    toggle.click()
    await view.updateComplete
    expect(separator.hidden).toBe(false)
    expect(separator.tabIndex).toBe(0)
  })

  it('keeps collapse-button events separate from resizing', async () => {
    const { view, capture } = await setup()
    const toggle = view.querySelector<HTMLButtonElement>('.folder-pane-sidebar-toggle')!
    pointer(toggle, 'pointerdown')
    key(toggle, 'ArrowRight')
    expect(capture).not.toHaveBeenCalled()
    toggle.click()
    await view.updateComplete
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('releases capture and ignores late events after disconnection', async () => {
    const { view, separator, release } = await setup()
    pointer(separator, 'pointerdown')
    view.remove()
    expect(release).toHaveBeenCalledWith(1)
    pointer(separator, 'pointermove', { clientX: 200 })
    pointer(separator, 'pointerdown')
    expect(separator.getAttribute('aria-valuenow')).toBe('256')
  })
})
