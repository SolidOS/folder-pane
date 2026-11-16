import { describe, expect, it, vi } from 'vitest'
import { graph, sym } from 'rdflib'
import folderPane, { folderViewFor } from '../src/folderPane'

vi.mock('solid-ui', async () => {
  const { Namespace } = await import('rdflib')
  return {
    icons: { iconBase: '' },
    ns: {
      ldp: Namespace('http://www.w3.org/ns/ldp#'),
      rdf: Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#')
    }
  }
})
vi.mock('../src/components/folder-pane-view', () => ({}))

describe('folder views', () => {
  const contextFor = store => ({
    session: {
      store,
      logic: {
        resource: {
          isContainer: subject => subject.uri.endsWith('/') ||
            store.holds(subject, sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), sym('http://www.w3.org/ns/ldp#BasicContainer')),
          getContainerMemberCount: subject => store.each(subject, sym('http://www.w3.org/ns/ldp#contains')).length
        }
      }
    }
  })

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

  it('is relevant for an empty folder URL without containment or type triples', () => {
    expect(folderPane.label(sym('https://pod.example/empty/'), contextFor(graph())))
      .toBe('Contents (0)')
  })

  it('is relevant for an explicitly typed BasicContainer', () => {
    const store = graph()
    const subject = sym('https://pod.example/container')
    store.add(subject, sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), sym('http://www.w3.org/ns/ldp#BasicContainer'))
    expect(folderPane.label(subject, contextFor(store))).toBe('Contents (0)')
  })

  it('does not claim ordinary files or application subjects', () => {
    const context = contextFor(graph())
    expect(folderPane.label(sym('https://pod.example/note.txt'), context)).toBeNull()
    expect(folderPane.label(sym('https://pod.example/contacts/index.ttl#this'), context)).toBeNull()
  })
})
