export type RenderRequest = {
  generation: number
  subjectUri: string
  context: object | undefined
}

export function invalidateRenderRequest (generation: number): number {
  return generation + 1
}

export function isCurrentRenderRequest (
  request: RenderRequest,
  generation: number,
  subjectUri: string | undefined,
  context: object | undefined
): boolean {
  return request.generation === generation &&
    request.subjectUri === subjectUri &&
    request.context === context
}
