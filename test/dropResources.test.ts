import { describe, expect, it } from 'vitest'
import { extractDroppedResourceUrl, hasDroppedResourceUrl } from '../src/dropResources'

function transfer (types: string[], values: Record<string, string>) {
  return { types, getData: (type: string) => values[type] ?? '' }
}

describe('dropped resource URL extraction', () => {
  it('extracts a non-comment URI-list entry', () => {
    expect(extractDroppedResourceUrl(transfer(['text/uri-list'], {
      'text/uri-list': '# browser metadata\nhttps://pod.example/a%20file.txt\n'
    }))).toBe('https://pod.example/a%20file.txt')
  })

  it('accepts one validated plain-text URL but rejects arbitrary text', () => {
    expect(extractDroppedResourceUrl(transfer(['text/plain'], {
      'text/plain': ' https://pod.example/file.txt '
    }))).toBe('https://pod.example/file.txt')
    expect(extractDroppedResourceUrl(transfer(['text/plain'], {
      'text/plain': 'not a URL'
    }))).toBeUndefined()
  })

  it('recognizes URL data types independently of whether their value validates', () => {
    expect(hasDroppedResourceUrl({ types: ['text/plain'] })).toBe(true)
    expect(hasDroppedResourceUrl({ types: ['Files'] })).toBe(false)
  })
})
