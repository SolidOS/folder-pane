import { describe, expect, it, vi } from 'vitest'
import { sym } from 'rdflib'
import { getContainerMemberCountLabel, getCreationDialogText, getCreationPanes, getIndexedApplicationSubject, getPaneLabel, getResourceAccessState, getResourcesForContainer, isAccessDeniedError, isContainerResource, readStoredWacAllow } from '../src/helpers'
import { isExtensionlessSourceFile } from '../src/mintPaneInstance'
import folderPane, { getCreationNoun } from '../src/folderPane'

vi.mock('solid-ui', () => ({
  utils: {
    label: resource => resource.uri.endsWith('AddressBook')
      ? 'Address Book'
      : resource.uri.endsWith('Issue') ? 'Issue' : resource.uri
  },
  ns: { ldp: value => sym(`http://www.w3.org/ns/ldp#${value}`), rdf: value => sym(`http://www.w3.org/1999/02/22-rdf-syntax-ns#${value}`) },
  icons: { iconBase: '' },
  aclControl: {},
  showDialog: vi.fn(),
  widgets: {}
}))
vi.mock('solid-logic', () => ({ authn: {} }))
vi.mock('../src/components/folder-pane-view', () => ({}))
vi.mock('../src/components/folder-pane-storage-header/FolderPaneCreateDialog', () => ({ default: class {} }))

const container = sym('https://example.test/')
const store = { each: () => [], holds: () => true }
const context = { session: { store } }
const resourceLogic = {
  isContainer: () => true,
  isHiddenFile: () => false,
  getContainerMembers: () => []
}

describe('JavaScript resource classification', () => {
  it.each(['file.js', 'module.mjs', 'module.cjs', 'script.JS?version=1#test'])('does not treat %s as a container despite erroneous RDF types', path => {
    const resource = sym(new URL(path, container.uri).href)
    expect(isContainerResource(resource, resourceLogic)).toBe(false)
    expect(folderPane.label(resource, context)).toBeNull()
    const resources = getResourcesForContainer(container, {
      ...resourceLogic,
      getContainerMembers: () => [resource]
    })

    expect(resources.get(resource.uri).isContainer).toBe(false)
  })

  it('preserves folders whose names end in .js and containers without RDF metadata', () => {
    const resource = sym('https://example.test/scripts.js/')
    expect(isContainerResource(resource, { ...resourceLogic, isContainer: () => false })).toBe(true)
    expect(folderPane.label(resource, context)).toBe('Container (0)')
  })

  it('filters a container index.ttl#this from resource targets', () => {
    const indexThing = sym('https://example.test/index.ttl#this')
    const child = sym('https://example.test/child.ttl')
    const resources = getResourcesForContainer(container, {
      ...resourceLogic,
      getContainerMembers: () => [indexThing, child]
    })

    expect(resources.has(indexThing.uri)).toBe(false)
    expect(resources.has(child.uri)).toBe(true)
  })

  it('deduplicates terms before sorting resources by their labels', () => {
    const duplicate = sym('https://example.test/Beta')
    const alpha = sym('https://example.test/alpha')
    const resources = getResourcesForContainer(container, {
      ...resourceLogic,
      getContainerMembers: () => [duplicate, alpha, sym(duplicate.uri)]
    })

    expect([...resources.keys()]).toEqual([
      'https://example.test/alpha',
      'https://example.test/Beta'
    ])
    expect(resources.size).toBe(2)
    expect(resources.get(duplicate.uri)).toMatchObject({
      id: duplicate.uri,
      parentId: container.value,
      isContainer: true
    })
  })
})

describe('indexed application subjects', () => {
  it('uses the schedule event subject for the schedule pane', () => {
    const indexedContainer = sym('https://pod.example/schedules/')

    expect(getIndexedApplicationSubject(indexedContainer, 'schedule'))
      .toBe('https://pod.example/schedules/details.ttl#event')
    expect(getIndexedApplicationSubject(indexedContainer, 'default'))
      .toBe('https://pod.example/schedules/index.ttl#this')
  })
})

describe('access denied errors', () => {
  it.each([
    { status: 401 },
    { status: 403 },
    { response: { status: 401 } },
    { response: { status: 403 } }
  ])('recognizes %j as access denied', error => {
    expect(isAccessDeniedError(error)).toBe(true)
  })

  describe('resource access metadata', () => {
    it('does not call missing WAC-Allow metadata private', () => {
      expect(getResourceAccessState({ isPublic: false, isPublicKnown: false })).toBe('unknown')
    })

    it('retains confirmed public and private states', () => {
      expect(getResourceAccessState({ isPublic: true, isPublicKnown: true })).toBe('public')
      expect(getResourceAccessState({ isPublic: false, isPublicKnown: true })).toBe('private')
    })

    it('reads access from a stored WAC-Allow header', () => {
      expect(readStoredWacAllow(['user="read write append control",public="read"']))
        .toEqual({ isPublic: true, canManageAccess: true })
      expect(readStoredWacAllow(['user="read",public=""']))
        .toEqual({ isPublic: false, canManageAccess: false })
    })

    it('combines split WAC-Allow header values', () => {
      expect(readStoredWacAllow(['user="read control"', 'public="read"']))
        .toEqual({ isPublic: true, canManageAccess: true })
    })

    it('reports no stored access when the header is missing', () => {
      expect(readStoredWacAllow(undefined)).toBeUndefined()
      expect(readStoredWacAllow([])).toBeUndefined()
    })
  })

  it('does not classify unrelated errors as access denied', () => {
    expect(isAccessDeniedError({ status: 500 })).toBe(false)
    expect(isAccessDeniedError(new Error('Forbidden'))).toBe(false)
    expect(isAccessDeniedError(null)).toBe(false)
  })
})

describe('creation nouns', () => {
  it('formats empty and singular container counts for both views', () => {
    expect(getContainerMemberCountLabel(0)).toBe('0 items')
    expect(getContainerMemberCountLabel(1)).toBe('1 item')
    expect(getContainerMemberCountLabel(2)).toBe('2 items')
  })

  it('only applies file-extension validation to Source pane file names', () => {
    const source = { name: 'source' }
    expect(isExtensionlessSourceFile(source, 'notes')).toBe(true)
    expect(isExtensionlessSourceFile(source, 'notes.txt')).toBe(false)
    expect(isExtensionlessSourceFile({ name: 'folder' }, 'notes')).toBe(false)
  })

  it('uses file wording for Source while retaining pane names for containers', () => {
    expect(getCreationNoun('source')).toBe('file')
    expect(getCreationNoun('Source')).toBe('file')
    expect(getCreationNoun('folder')).toBe('folder')
    expect(getCreationNoun()).toBe('item')
  })

  describe('creation pane candidates', () => {
    it('uses the exact creation dialog title and placeholder wording', () => {
      expect(getCreationDialogText('Tracker')).toEqual({
        title: 'New Tracker',
        placeholder: 'Enter Tracker name'
      })
    })

    it('uses mintClass labels and preserves pane-registry order', () => {
      const addressbook = { name: 'contact', mintClass: sym('http://www.w3.org/2006/vcard/ns#AddressBook'), mintNew: vi.fn() }
      const tracker = { name: 'issue', mintClass: sym('http://www.w3.org/2005/01/wot/track#Issue'), mintNew: vi.fn() }
      const contact = { name: 'contact', mintNew: vi.fn() }
      const notCreatable = { name: 'profile' }

      expect(getCreationPanes([addressbook, notCreatable, tracker, contact])).toEqual([
        addressbook, tracker, contact
      ])
      expect(getPaneLabel(addressbook)).toBe('Address Book')
      expect(getPaneLabel(tracker)).toBe('Issue')
      expect(getPaneLabel(contact)).toBe('Contact')
    })

    it('does not offer the deprecated short chat pane for creation', () => {
      const chat = { name: 'chat', mintNew: vi.fn() }
      const longChat = { name: 'long chat', mintNew: vi.fn() }

      expect(getCreationPanes([chat, longChat])).toEqual([longChat])
    })
  })
})

describe('resource creation contracts', () => {
  it('keeps folder minting container-shaped', async () => {
    const webOperation = vi.fn().mockResolvedValue(undefined)
    const store = {
      sym,
      fetcher: { webOperation }
    }
    const options = {
      newBase: 'https://example.test/new-folder/',
      newInstance: sym('https://example.test/new-folder')
    }

    const result = await folderPane.mintNew({ session: { store } }, options)

    expect(webOperation).toHaveBeenCalledWith('PUT', 'https://example.test/new-folder/')
    expect(result.newInstance.uri).toBe('https://example.test/new-folder/')
  })
})
