import { describe, expect, it } from 'vitest'
import { invalidateRenderRequest, isCurrentRenderRequest } from '../src/components/folder-pane-view/renderRequest'

describe('folder-pane render requests', () => {
  it('rejects an older indexed navigation after a newer selection starts', () => {
    const context = {}
    const requestA = { generation: 1, subjectUri: 'https://pod.example/a/', context }

    expect(isCurrentRenderRequest(requestA, 2, 'https://pod.example/b/', context)).toBe(false)
    expect(isCurrentRenderRequest(requestA, 2, 'https://pod.example/a/', context)).toBe(false)
  })

  it('rejects a request from a replaced browser context', () => {
    const contextA = {}
    const contextB = {}
    const request = { generation: 3, subjectUri: 'https://pod.example/a/', context: contextA }

    expect(isCurrentRenderRequest(request, 3, 'https://pod.example/a/', contextB)).toBe(false)
    expect(isCurrentRenderRequest(request, 3, 'https://pod.example/a/', contextA)).toBe(true)
  })

  it('rejects metadata and discovery results after the active context changes', () => {
    const oldContext = {}
    const newContext = {}
    const request = {
      generation: 8,
      subjectUri: 'https://pod.example/old/',
      context: oldContext
    }

    expect(isCurrentRenderRequest(request, 8, request.subjectUri, oldContext)).toBe(true)
    expect(isCurrentRenderRequest(request, 9, request.subjectUri, oldContext)).toBe(false)
    expect(isCurrentRenderRequest(request, 8, request.subjectUri, newContext)).toBe(false)
    expect(isCurrentRenderRequest(request, 8, 'https://pod.example/new/', oldContext)).toBe(false)
  })

  it('invalidates a pending request when the view disconnects', () => {
    const context = {}
    const request = { generation: 4, subjectUri: 'https://pod.example/a/', context }
    const disconnectedGeneration = invalidateRenderRequest(request.generation)

    expect(isCurrentRenderRequest(request, disconnectedGeneration, request.subjectUri, context)).toBe(false)
  })
})
