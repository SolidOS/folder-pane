const URL_SCHEMES = new Set(['http:', 'https:'])

function validResourceUrl (value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('#')) return undefined
  try {
    const url = new URL(trimmed)
    return URL_SCHEMES.has(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}

/**
 * Extract one resource URL from a browser drop. Files are deliberately handled
 * by the caller first: a browser may expose both Files and URI data.
 */
export function extractDroppedResourceUrl (dataTransfer: Pick<DataTransfer, 'types' | 'getData'> | null | undefined): string | undefined {
  if (!dataTransfer) return undefined
  const types = Array.from(dataTransfer.types ?? [])
  if (types.includes('text/uri-list')) {
    const url = dataTransfer.getData('text/uri-list')
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(line => line && !line.startsWith('#'))
    const valid = url && validResourceUrl(url)
    if (valid) return valid
  }
  if (types.includes('text/plain')) {
    const lines = dataTransfer.getData('text/plain').trim().split(/\r?\n/).filter(Boolean)
    if (lines.length === 1) return validResourceUrl(lines[0])
  }
  return undefined
}

export function hasDroppedResourceUrl (dataTransfer: Pick<DataTransfer, 'types'> | null | undefined): boolean {
  const types = Array.from(dataTransfer?.types ?? [])
  return types.includes('text/uri-list') || types.includes('text/plain')
}

