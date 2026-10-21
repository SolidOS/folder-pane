export const invalidCreationNameMessage =
  'Names must not be empty, "." or "..", and must not contain path separators.'

/**
 * Creation names are one URI path segment.  Keeping this rule at the
 * operation boundary prevents callers other than the dialog from bypassing
 * the dialog's validation.
 */
export function normalizeCreationName (value: string): string {
  const name = value.trim()
  if (!name || name === '.' || name === '..' || /[\\/\u0000-\u001f\u007f]/.test(name)) {
    throw new Error(invalidCreationNameMessage)
  }
  return name
}

export function isSafeCreationName (value: string): boolean {
  try {
    normalizeCreationName(value)
    return true
  } catch {
    return false
  }
}
