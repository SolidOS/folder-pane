import { describe, expect, it, vi } from 'vitest'
import { folderViewFor } from '../src/folderPane'

vi.mock('solid-ui', () => ({ icons: { iconBase: '' }, ns: {} }))
vi.mock('../src/components/folder-pane-view', () => ({}))

describe('folder views', () => {
  it('uses the view it is asked for', () => {
    expect(folderViewFor({ folderView: 'storage', solo: true })).toBe('storage')
    expect(folderViewFor({ folderView: 'explorer', fullView: true })).toBe('explorer')
    expect(folderViewFor({ folderView: 'container' })).toBe('container')
  })

  it('shows the container alone for a solo or full view, as before', () => {
    expect(folderViewFor({ solo: true })).toBe('container')
    expect(folderViewFor({ fullView: true })).toBe('container')
  })

  it('shows the whole explorer otherwise, or for an unknown view', () => {
    expect(folderViewFor({})).toBe('explorer')
    expect(folderViewFor({ folderView: 'other', solo: false })).toBe('explorer')
  })
})
