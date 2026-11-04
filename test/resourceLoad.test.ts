import { describe, expect, it, vi } from 'vitest'
import type { NamedNode } from 'rdflib'
import { clearFailedResource } from '../src/components/folder-pane-view/resourceLoad'

describe('resource loading', () => {
  it('unloads a cached failure so a retry can issue a fresh request', () => {
    const resource = { value: 'https://pod.example/events/' }
    const fetcher = {
      getState: vi.fn().mockReturnValue('failed'),
      unload: vi.fn()
    }

    expect(clearFailedResource(fetcher, resource as unknown as NamedNode)).toBe(true)
    expect(fetcher.unload).toHaveBeenCalledWith(resource)
  })

  it('leaves resources with another state untouched', () => {
    const resource = { value: 'https://pod.example/events/' }
    const fetcher = {
      getState: vi.fn().mockReturnValue('fetched'),
      unload: vi.fn()
    }

    expect(clearFailedResource(fetcher, resource as unknown as NamedNode)).toBe(false)
    expect(fetcher.unload).not.toHaveBeenCalled()
  })
})
