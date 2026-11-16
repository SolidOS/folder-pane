import { describe, expect, it } from 'vitest'
import { createAccessCache } from '../src/accessCache'

describe('resource access cache', () => {
  const uri = 'https://alice.example/public/file.txt'

  function cacheAt (start = 0) {
    const clock = { time: start }
    const cache = createAccessCache({ ttlMs: 1000, maxEntries: 2, now: () => clock.time })
    return { cache, clock }
  }

  it('reuses a confirmed answer for the same viewer until it expires', () => {
    const { cache, clock } = cacheAt()
    cache.set('https://alice.example/profile/card#me', uri, { state: 'public', canManageAccess: true })

    clock.time = 999
    expect(cache.get('https://alice.example/profile/card#me', uri)).toEqual({ state: 'public', canManageAccess: true })
    clock.time = 1000
    expect(cache.get('https://alice.example/profile/card#me', uri)).toBeUndefined()
  })

  it('keeps answers separate per viewer, including logged out', () => {
    const { cache } = cacheAt()
    cache.set('https://alice.example/profile/card#me', uri, { state: 'private', canManageAccess: true })

    expect(cache.get('https://bob.example/profile/card#me', uri)).toBeUndefined()
    expect(cache.get(undefined, uri)).toBeUndefined()
  })

  it('does not keep unknown or failed answers and forgets the previous answer', () => {
    const { cache } = cacheAt()
    cache.set(undefined, uri, { state: 'public', canManageAccess: false })
    cache.set(undefined, uri, { state: 'error', canManageAccess: false })

    expect(cache.get(undefined, uri)).toBeUndefined()
  })

  it('forgets a resource for every viewer and can be cleared', () => {
    const { cache } = cacheAt()
    const other = 'https://alice.example/public/other.txt'
    cache.set(undefined, uri, { state: 'public', canManageAccess: false })
    cache.set('https://alice.example/profile/card#me', uri, { state: 'public', canManageAccess: true })

    cache.delete(uri)
    expect(cache.get(undefined, uri)).toBeUndefined()
    expect(cache.get('https://alice.example/profile/card#me', uri)).toBeUndefined()

    cache.set(undefined, other, { state: 'private', canManageAccess: false })
    cache.clear()
    expect(cache.get(undefined, other)).toBeUndefined()
  })

  it('drops the oldest entries beyond its size limit', () => {
    const { cache } = cacheAt()
    cache.set(undefined, 'https://a.example/1', { state: 'public', canManageAccess: false })
    cache.set(undefined, 'https://a.example/2', { state: 'public', canManageAccess: false })
    cache.set(undefined, 'https://a.example/3', { state: 'public', canManageAccess: false })

    expect(cache.get(undefined, 'https://a.example/1')).toBeUndefined()
    expect(cache.get(undefined, 'https://a.example/3')).toBeDefined()
  })
})
