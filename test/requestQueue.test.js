import { describe, expect, it } from 'vitest'
import { createRequestQueue, getRetryAfterMs, isNetworkFailureError, isRateLimitedError, RequestQueueClearedError } from '../src/requestQueue'

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

  it('keeps the queue paused when an exhausted task receives another 429', async () => {
    const releases = []
    const queue = createRequestQueue({
      concurrency: 1,
      maxRetries: 1,
      wait: () => new Promise(resolve => releases.push(resolve))
    })
    let firstAttempts = 0
    let secondAttempts = 0
    const first = queue.run(async () => {
      firstAttempts++
      throw rateLimited()
    })
    const second = queue.run(async () => {
      secondAttempts++
      return 'second'
    })
    const firstResult = expect(first).rejects.toMatchObject({ status: 429 })

    await flush()
    expect(releases).toHaveLength(1)
    releases.shift()()
    await flush()
    expect(firstAttempts).toBe(2)
    expect(secondAttempts).toBe(0)
    expect(releases).toHaveLength(1)
    await firstResult
    releases.shift()()
    await expect(second).resolves.toBe('second')
    expect(secondAttempts).toBe(1)
  })

  it('extends an active pause for a longer overlapping Retry-After', async () => {
    const releases = []
    const waits = []
    const queue = createRequestQueue({
      concurrency: 2,
      maxRetries: 0,
      wait: ms => {
        waits.push(ms)
        return new Promise(resolve => releases.push(resolve))
      }
    })
    let queuedAttempts = 0
    const first = queue.run(async () => { throw rateLimited('1') })
    const second = queue.run(async () => { throw rateLimited('60') })
    const queued = queue.run(async () => {
      queuedAttempts++
      return 'queued'
    })
    const firstResult = expect(first).rejects.toMatchObject({ status: 429 })
    const secondResult = expect(second).rejects.toMatchObject({ status: 429 })

    await flush()
    expect(waits).toEqual([1000, 60000])
    expect(queuedAttempts).toBe(0)

    releases.shift()()
    await flush()
    expect(queuedAttempts).toBe(0)

    releases.shift()()
    await expect(queued).resolves.toBe('queued')
    await firstResult
    await secondResult
  })

  it('backs off when a rate-limited CORS preflight surfaces as a network failure', async () => {
    const waits = []
    const queue = createRequestQueue({
      concurrency: 1,
      defaultRetryAfterMs: 5000,
      wait: ms => {
        waits.push(ms)
        return Promise.resolve()
      }
    })
    let attempts = 0
    const result = queue.run(async () => {
      if (attempts++ === 0) {
        // rdflib's shape after its no-credentials retry also fails
        throw Object.assign(new Error('Fetcher: TypeError: Failed to fetch'), { status: 999 })
      }
      return 'loaded'
    })

    await expect(result).resolves.toBe('loaded')
    expect(attempts).toBe(2)
    expect(waits).toEqual([5000])
  })

  it.each([
    [Object.assign(new Error('network failure: undefined'), { status: 999 })],
    [{ status: 998 }],
    [new TypeError('Failed to fetch')],
    [new TypeError('NetworkError when attempting to fetch resource.')],
    [new TypeError('Load failed')]
  ])('recognizes %j as a possible hidden 429', error => {
    expect(isNetworkFailureError(error)).toBe(true)
  })

  it('does not treat HTTP failures as network failures', () => {
    expect(isNetworkFailureError(Object.assign(new Error('Not Found'), { status: 404 }))).toBe(false)
    expect(isNetworkFailureError({ response: { status: 500 } })).toBe(false)
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
