/**
 * Limits how many advisory requests (member counts, access indicators) a
 * folder view sends at once, and backs off when the server answers 429 or the
 * request fails at the network level (see isNetworkFailureError).
 *
 * Opening a folder used to fetch every child immediately. Each browser request
 * also needs a CORS preflight, so a folder with a few dozen children could
 * exceed per-IP rate limits such as Cloudflare's and leave counts missing.
 */

export class RequestQueueClearedError extends Error {
  constructor () {
    super('Request queue was cleared')
    this.name = 'RequestQueueClearedError'
  }
}

type RequestQueueOptions = {
  concurrency?: number
  maxRetries?: number
  defaultRetryAfterMs?: number
  wait?: (ms: number) => Promise<void>
}

type PendingTask = {
  task: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
  retries: number
}

export type RequestQueue = {
  run: <T>(task: () => Promise<T>) => Promise<T>
  clear: () => void
}

type ErrorWithResponse = {
  status?: number
  headers?: Headers
  response?: { status?: number, headers?: Headers }
}

function getErrorResponse (error: unknown): ErrorWithResponse | undefined {
  return typeof error === 'object' && error !== null ? error as ErrorWithResponse : undefined
}

function isRateLimitedError (error: unknown): boolean {
  const response = getErrorResponse(error)
  if (response?.status === 429 || response?.response?.status === 429) return true
  // solid-logic's metadata HEAD reports failures only in the message.
  return error instanceof Error && /\bStatus: 429\b/.test(error.message)
}

const NETWORK_FAILURE_STATUSES = new Set([998, 999])
const NETWORK_FAILURE_MESSAGE = /Failed to fetch|NetworkError|Load failed|network failure/i

/**
 * A rate limiter in front of a cross-origin pod (such as Cloudflare) answers
 * the CORS preflight with a 429 that carries no CORS headers. The browser then
 * hides the status and reports a network error, which rdflib turns into a
 * fake 999 status, so such failures have to be treated as possible 429s.
 */
function isNetworkFailureError (error: unknown): boolean {
  const response = getErrorResponse(error)
  const status = response?.status ?? response?.response?.status
  if (status !== undefined && NETWORK_FAILURE_STATUSES.has(status)) return true
  return error instanceof Error && NETWORK_FAILURE_MESSAGE.test(error.message)
}

function shouldBackOff (error: unknown): boolean {
  return isRateLimitedError(error) || isNetworkFailureError(error)
}

/**
 * Returns the delay requested by a 429's Retry-After header (seconds or an
 * HTTP date), or `fallbackMs` when it is missing or unreadable.
 */
function getRetryAfterMs (error: unknown, fallbackMs: number, now = Date.now()): number {
  const response = getErrorResponse(error)
  const headers = response?.headers ?? response?.response?.headers
  const value = typeof headers?.get === 'function' ? headers.get('retry-after') : null
  if (!value) return fallbackMs
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isNaN(date) ? fallbackMs : Math.max(0, date - now)
}

function createRequestQueue ({
  concurrency = 4,
  maxRetries = 2,
  defaultRetryAfterMs = 10_000,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms))
}: RequestQueueOptions = {}): RequestQueue {
  let pending: PendingTask[] = []
  let active = 0
  let pausedUntil: Promise<void> | undefined
  let pauseDeadline = 0
  let pauseToken = 0
  let generation = 0

  function pump () {
    if (pausedUntil) return
    while (active < concurrency && pending.length > 0) {
      const item = pending.shift()!
      active++
      void execute(item, generation)
    }
  }

  async function execute (item: PendingTask, taskGeneration: number) {
    try {
      item.resolve(await item.task())
    } catch (error) {
      if (taskGeneration === generation && shouldBackOff(error)) {
        pause(getRetryAfterMs(error, defaultRetryAfterMs))
        if (item.retries < maxRetries) {
          item.retries++
          // Retry first so it is not overtaken by tasks queued after it.
          pending.unshift(item)
        } else {
          item.reject(error)
        }
      } else {
        item.reject(error)
      }
    } finally {
      active--
      pump()
    }
  }

  function pause (ms: number) {
    const pauseGeneration = generation
    const requestedDeadline = Date.now() + ms
    if (requestedDeadline <= pauseDeadline) return
    pauseDeadline = requestedDeadline
    const token = ++pauseToken
    pausedUntil = wait(ms).then(() => {
      if (pauseGeneration !== generation || token !== pauseToken) return
      pausedUntil = undefined
      pauseDeadline = 0
      pump()
    })
  }

  return {
    run<T> (task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        pending.push({ task, resolve: resolve as (value: unknown) => void, reject, retries: 0 })
        pump()
      })
    },
    clear () {
      generation++
      pausedUntil = undefined
      pauseDeadline = 0
      pauseToken++
      const cleared = pending
      pending = []
      for (const item of cleared) item.reject(new RequestQueueClearedError())
    }
  }
}

export { createRequestQueue, getRetryAfterMs, isNetworkFailureError, isRateLimitedError }
