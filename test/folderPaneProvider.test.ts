import { describe, expect, it } from 'vitest'
import { sym } from 'rdflib'
import FolderPaneProvider from '../src/components/folder-pane-provider/FolderPaneProvider'

describe('FolderPaneProvider', () => {
  it('publishes the current read-only folder snapshot', () => {
    const rootResource = sym('https://pod.example/root/')
    const displayedResource = sym('https://pod.example/root/item.ttl')
    const activeContainer = sym('https://pod.example/root/')
    const provider = new FolderPaneProvider()

    provider.rootResource = rootResource
    provider.displayedResource = displayedResource
    provider.activeContainer = activeContainer
    provider.view = 'list'
    provider.searchQuery = 'item'
    provider.canCreate = true
    Object.getPrototypeOf(provider).willUpdate.call(provider, new Map([
      ['rootResource', undefined],
      ['displayedResource', undefined],
      ['activeContainer', undefined],
      ['view', undefined],
      ['searchQuery', undefined],
      ['canCreate', undefined]
    ]))

    expect(provider.contextValue).toEqual({
      rootResource,
      displayedResource,
      activeContainer,
      view: 'list',
      searchQuery: 'item',
      canCreate: true
    })
  })

  it('renders only its child slot', () => {
    const provider = new FolderPaneProvider()
    expect(provider.render().strings.join('')).toContain('<slot></slot>')
  })
})
