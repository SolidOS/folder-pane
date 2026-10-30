/**
 * Short-lived memory of the public/private indicator for listed resources, so
 * revisiting a folder does not send a HEAD (and CORS preflight) per file again.
 *
 * Entries are per viewer because access depends on who is asking. Only
 * confirmed public/private answers are kept; content is never cached here.
 */
export type CachedResourceAccess = {
  state: 'public' | 'private'
  canManageAccess: boolean
}

type AccessCacheOptions = {
  ttlMs?: number
  maxEntries?: number
  now?: () => number
}

export const ACCESS_CACHE_TTL_MS = 60_000

export function createAccessCache ({
  ttlMs = ACCESS_CACHE_TTL_MS,
  maxEntries = 500,
  now = Date.now
}: AccessCacheOptions = {}) {
  const entries = new Map<string, { value: CachedResourceAccess, expiresAt: number }>()
  const keyFor = (viewer: string | undefined, uri: string) => `${viewer ?? ''}\n${uri}`

  return {
    get (viewer: string | undefined, uri: string): CachedResourceAccess | undefined {
      const key = keyFor(viewer, uri)
      const entry = entries.get(key)
      if (!entry) return undefined
      if (entry.expiresAt <= now()) {
        entries.delete(key)
        return undefined
      }
      return entry.value
    },

    set (viewer: string | undefined, uri: string, value: { state: string, canManageAccess: boolean }) {
      const key = keyFor(viewer, uri)
      entries.delete(key)
      if (value.state !== 'public' && value.state !== 'private') return
      entries.set(key, {
        value: { state: value.state, canManageAccess: value.canManageAccess },
        expiresAt: now() + ttlMs
      })
      while (entries.size > maxEntries) {
        entries.delete(entries.keys().next().value!)
      }
    },

    delete (uri: string) {
      for (const key of [...entries.keys()]) {
        if (key.endsWith(`\n${uri}`)) entries.delete(key)
      }
    },

    clear () {
      entries.clear()
    }
  }
}

export const resourceAccessCache = createAccessCache()
