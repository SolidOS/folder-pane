import type { NamedNode } from 'rdflib'

type Fetcher = {
  getState: (uri: string) => string | undefined
  unload: (resource: NamedNode) => void
}

export function clearFailedResource (fetcher: Fetcher, resource: NamedNode): boolean {
  if (fetcher.getState(resource.value) !== 'failed') return false
  fetcher.unload(resource)
  return true
}
