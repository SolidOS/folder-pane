// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { sym } from 'rdflib'
import '../src/components/folder-pane-container/FolderPaneContainer'

describe('folder pane container file drop', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('dispatches dropped files to the shared folder-pane upload flow', async () => {
    const container = document.createElement('folder-pane-container') as HTMLElement & {
      subject: ReturnType<typeof sym>
      resourceLogic: Record<string, unknown>
      canUpload: boolean
      updateComplete: Promise<void>
    }
    container.subject = sym('https://pod.example/files/')
    container.canUpload = true
    container.resourceLogic = {
      getContainerMembers: vi.fn(() => []),
      isHiddenFile: vi.fn(() => false),
      isContainer: vi.fn(() => false),
      containerHasIndexDocument: vi.fn(() => false),
      getContainerIndexThing: vi.fn(),
      uploadFiles: vi.fn()
    }
    document.body.append(container)
    await container.updateComplete
    await container.updateComplete

    const target = container.shadowRoot!.querySelector('.folder-pane-container-content')!
    const file = new File(['content'], 'file.txt', { type: 'text/plain' })
    const dataTransfer = { types: ['Files'], files: [file], dropEffect: 'none' }
    const dispatched: CustomEvent[] = []
    container.addEventListener('folder-pane-upload-files', event => dispatched.push(event as CustomEvent))

    const dragEnter = new Event('dragenter', { bubbles: true, cancelable: true })
    Object.defineProperty(dragEnter, 'dataTransfer', { value: dataTransfer })
    target.dispatchEvent(dragEnter)
    await container.updateComplete
    expect(target.getAttribute('data-drag-active')).toBe('true')

    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer })
    target.dispatchEvent(drop)
    await container.updateComplete

    expect(drop.defaultPrevented).toBe(true)
    expect(dispatched).toHaveLength(1)
    expect(dispatched[0].detail.files).toEqual([file])
    expect(target.getAttribute('data-drag-active')).toBe('false')
  })

  it('rejects dropped directories with a visible-error event', async () => {
    const container = document.createElement('folder-pane-container') as HTMLElement & {
      subject: ReturnType<typeof sym>
      resourceLogic: Record<string, unknown>
      canUpload: boolean
      updateComplete: Promise<void>
    }
    container.subject = sym('https://pod.example/files/')
    container.canUpload = true
    document.body.append(container)
    await container.updateComplete

    const target = container.shadowRoot!.querySelector('.folder-pane-container-content')!
    const rejected = vi.fn()
    container.addEventListener('folder-pane-upload-rejected', rejected)
    const directoryItem = {
      kind: 'file',
      webkitGetAsEntry: () => ({ isDirectory: true })
    }
    const dataTransfer = {
      types: ['Files'],
      files: [],
      items: [directoryItem],
      dropEffect: 'none'
    }
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer })
    target.dispatchEvent(drop)

    expect(drop.defaultPrevented).toBe(true)
    expect(rejected).toHaveBeenCalledWith(expect.objectContaining({
      detail: { message: 'Folder drops are not supported. Select files instead.' }
    }))
  })

  it('rejects drops while an upload is busy', async () => {
    const container = document.createElement('folder-pane-container') as HTMLElement & {
      subject: ReturnType<typeof sym>
      resourceLogic: Record<string, unknown>
      canUpload: boolean
      uploadBusy: boolean
      updateComplete: Promise<void>
    }
    container.subject = sym('https://pod.example/files/')
    container.canUpload = false
    container.uploadBusy = true
    document.body.append(container)
    await container.updateComplete

    const target = container.shadowRoot!.querySelector('.folder-pane-container-content')!
    const rejected = vi.fn()
    container.addEventListener('folder-pane-upload-rejected', rejected)
    const file = new File(['content'], 'file.txt', { type: 'text/plain' })
    const dataTransfer = { types: ['Files'], files: [file], items: [], dropEffect: 'none' }
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer })
    target.dispatchEvent(drop)

    expect(drop.defaultPrevented).toBe(true)
    expect(rejected).toHaveBeenCalledWith(expect.objectContaining({
      detail: { message: 'Please wait for the current upload or creation to finish.' }
    }))
  })
})
