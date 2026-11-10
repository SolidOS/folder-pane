// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FolderPaneCopyCollisionDialog,
  requestCopyCollision
} from '../src/components/folder-pane-view/FolderPaneCopyCollisionDialog'

describe('folder pane copy collision dialog', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  async function createDialog (isContainer) {
    const dialog = document.createElement('folder-pane-copy-collision-dialog')
    dialog.isContainer = isContainer
    dialog.resourceName = isContainer ? 'projects' : 'notes.txt'
    document.body.append(dialog)
    await dialog.updateComplete
    return dialog
  }

  it('offers the three exact file collision choices and returns the selected choice', async () => {
    const dialog = await createDialog(false)
    const buttons = Array.from(dialog.shadowRoot.querySelectorAll('solid-ui-button'))

    expect(buttons.map(button => button.textContent.trim())).toEqual([
      'Replace existing file',
      'Keep both files',
      'Cancel'
    ])

    const close = vi.spyOn(dialog, 'close')
    buttons[0].click()
    expect(close).toHaveBeenCalledWith('replace')
    buttons[1].click()
    expect(close).toHaveBeenLastCalledWith('keep-both')
    buttons[2].click()
    expect(close).toHaveBeenLastCalledWith('cancel')
  })

  it('offers only keep-both and cancel for folders and explains that folders cannot be merged', async () => {
    const dialog = await createDialog(true)
    const buttons = Array.from(dialog.shadowRoot.querySelectorAll('solid-ui-button'))

    expect(buttons.map(button => button.textContent.trim())).toEqual([
      'Keep both folders',
      'Cancel'
    ])
    expect(dialog.shadowRoot.textContent).toContain('Folders cannot be merged.')
    expect(dialog.shadowRoot.querySelector('[data-copy-choice="replace"]')).toBeNull()

    const close = vi.spyOn(dialog, 'close')
    buttons[0].click()
    expect(close).toHaveBeenCalledWith('keep-both')
    buttons[1].click()
    expect(close).toHaveBeenLastCalledWith('cancel')
  })

  it('passes the supplied collision classification to the dialog and resolves its choice', async () => {
    let shownDialog
    document.addEventListener('solid-ui:show-dialog', event => {
      shownDialog = event.dialog
    }, { once: true })

    const choice = requestCopyCollision({
      source: 'https://pod.example/source.txt',
      destination: 'https://pod.example/destination/notes.txt',
      isContainer: false
    })

    expect(shownDialog.element).toBeInstanceOf(FolderPaneCopyCollisionDialog)
    expect(shownDialog.element.isContainer).toBe(false)
    expect(shownDialog.element.resourceName).toBe('notes.txt')
    shownDialog.closed('replace')
    await expect(choice).resolves.toBe('replace')
  })

  it('treats dialog dismissal as cancel', async () => {
    let shownDialog
    document.addEventListener('solid-ui:show-dialog', event => {
      shownDialog = event.dialog
    }, { once: true })

    const choice = requestCopyCollision({
      source: 'https://pod.example/source/',
      destination: 'https://pod.example/destination/source/',
      isContainer: true
    })

    expect(shownDialog.element.isContainer).toBe(true)
    shownDialog.closed()
    await expect(choice).resolves.toBe('cancel')
  })
})
