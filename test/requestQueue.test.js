import { describe, expect, it } from 'vitest'
import { createRequestQueue, getRetryAfterMs, isRateLimitedError, RequestQueueClearedError } from '../src/requestQueue'

function deferred () {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function rateLimited (retryAfter) {
  const error = new Error('Fetcher: HTTP error for https://pod.example/a/: 429 Too Many Requests')
  error.status = 429
  error.response = { status: 429, headers: new Headers(retryAfter ? { 'retry-after': retryAfter } : {}) }
  return error
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('folder-pane request queue', () => {
  it('runs at most `concurrency` tasks at once, in order', async () => {
    const queue = createRequestQueue({ concurrency: 2 })
    const tasks = [deferred(), deferred(), deferred(), deferred()]
    const started = []
    const results = tasks.map((task, index) => queue.run(() => {
      started.push(index)
      return task.promise
    }))

    await flush()
    expect(started).toEqual([0, 1])

    tasks[0].resolve('a')
    await flush()
    expect(started).toEqual([0, 1, 2])

    tasks[1].resolve('b')
    tasks[2].resolve('c')
    tasks[3].resolve('d')
    await expect(Promise.all(results)).resolves.toEqual(['a', 'b', 'c', 'd'])
  })

  it('pauses all requests for Retry-After after a 429, then retries', async () => {
    const waits = []
    let release
    const queue = createRequestQueue({
      concurrency: 1,
      wait: ms => {
        waits.push(ms)
        return new Promise(resolve => { release = resolve })
      }
    })
    let attempts = 0
    const calls = []
    const first = queue.run(async () => {
      calls.push('first')
      if (attempts++ === 0) throw rateLimited('3')
      return 'first'
    })
    const second = queue.run(async () => {
      calls.push('second')
      return 'second'
    })

    await flush()
    expect(waits).toEqual([3000])
    expect(calls).toEqual(['first'])

    release()
    await expect(first).resolves.toBe('first')
    await expect(second).resolves.toBe('second')
    expect(calls).toEqual(['first', 'first', 'second'])
  })

  it('gives up after maxRetries rate-limited attempts', async () => {
    const queue = createRequestQueue({ maxRetries: 1, wait: () => Promise.resolve() })
    let attempts = 0
    const result = queue.run(async () => {
      attempts++
      throw rateLimited()
    })

    await expect(result).rejects.toMatchObject({ status: 429 })
    expect(attempts).toBe(2)
  })

  it('does not retry other failures', async () => {
    const queue = createRequestQueue({ wait: () => Promise.resolve() })
    let attempts = 0
    const error = Object.assign(new Error('Forbidden'), { status: 403 })

    await expect(queue.run(async () => {
      attempts++
      throw error
    })).rejects.toBe(error)
    expect(attempts).toBe(1)
  })

  it('rejects queued tasks without running them when cleared', async () => {
    const queue = createRequestQueue({ concurrency: 1 })
    const running = deferred()
    let queuedRan = false
    const first = queue.run(() => running.promise)
    const queued = queue.run(async () => { queuedRan = true })

    queue.clear()
    running.resolve('done')

    await expect(first).resolves.toBe('done')
    await expect(queued).rejects.toBeInstanceOf(RequestQueueClearedError)
    expect(queuedRan).toBe(false)
  })

  it('does not resume a pause from before it was cleared', async () => {
    let releaseOldPause
    const queue = createRequestQueue({
      concurrency: 1,
      wait: () => new Promise(resolve => { releaseOldPause = resolve })
    })
    const stale = queue.run(async () => { throw rateLimited() })
    await flush()
    queue.clear()
    await expect(stale).rejects.toBeInstanceOf(RequestQueueClearedError)

    const fresh = queue.run(async () => 'fresh')
    await expect(fresh).resolves.toBe('fresh')
    releaseOldPause()
  })
})

describe('rate limit detection', () => {
  it('recognises rdflib and solid-logic 429 errors', () => {
    expect(isRateLimitedError(rateLimited())).toBe(true)
    expect(isRateLimitedError({ response: { status: 429 } })).toBe(true)
    expect(isRateLimitedError(new Error('HTTP error on HEAD! Status: 429'))).toBe(true)
    expect(isRateLimitedError(new Error('HTTP error on HEAD! Status: 4290'))).toBe(false)
    expect(isRateLimitedError({ status: 403 })).toBe(false)
    expect(isRateLimitedError(undefined)).toBe(false)
  })

  it('reads Retry-After as seconds or an HTTP date', () => {
    const now = Date.parse('2026-10-24T12:00:00Z')
    expect(getRetryAfterMs(rateLimited('10'), 1, now)).toBe(10_000)
    expect(getRetryAfterMs(rateLimited('Sat, 24 Oct 2026 12:00:05 GMT'), 1, now)).toBe(5000)
    expect(getRetryAfterMs(rateLimited('soon'), 1234, now)).toBe(1234)
    expect(getRetryAfterMs(rateLimited(), 1234, now)).toBe(1234)
    expect(getRetryAfterMs(new Error('HTTP error on HEAD! Status: 429'), 1234, now)).toBe(1234)
  })
})
