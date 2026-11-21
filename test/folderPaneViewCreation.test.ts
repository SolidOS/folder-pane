// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { namedNode } from 'rdflib'
import type { DataBrowserContext, PaneDefinition } from 'pane-registry'
import FolderPaneView from '../src/components/folder-pane-view/FolderPaneView'

describe('folder pane creation navigation', () => {
  it('passes an indexed Pad subject unchanged to the created pane', () => {
    const view = new FolderPaneView()
    const createdSubject = namedNode('https://pod.example/pad/index.ttl#this')
    const render = vi.fn().mockReturnValue(document.createElement('div'))
    const pane = {
      name: 'pad',
      render
    } as unknown as PaneDefinition
    const context = {
      session: {
        paneRegistry: {
          byName: vi.fn().mockReturnValue(pane)
        }
      }
    } as unknown as DataBrowserContext

    view.browserContext = context
    vi.spyOn(
      view as unknown as {
        showResourceInContentView: (
          subject: ReturnType<typeof namedNode>,
          pane?: PaneDefinition
        ) => Promise<void>
      },
      'showResourceInContentView'
    ).mockImplementation(async (subject, selectedPane) => {
      selectedPane?.render(subject, context)
    })

    view.openCreatedResource(createdSubject, pane)

    expect(render).toHaveBeenCalledWith(createdSubject, context)
    expect(render.mock.calls[0][0].uri).toBe(createdSubject.uri)
  })
})
