import { ofetch } from 'ofetch'
import type { ApiEnvelope } from '#shared/types/http'
import type { AuthSession } from './session'
import { ApiError, normalizeError, responseError } from './error'
import { waitWithSignal } from './abort'
import { resolveApiUrl } from './url'

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  headers?: HeadersInit
  auth?: boolean
  signal?: AbortSignal
  timeoutMs?: number
  idempotencyKey?: string
}
export interface HttpClientOptions {
  baseURL: string
  origin?: string
  locale?: () => string
  session?: AuthSession
  fetch?: typeof globalThis.fetch
}
export function createHttpClient(config: HttpClientOptions) {
  // ofetch performs transport only. Explicit response parsing allows JSON, SSE and files.
  const transport = ofetch.create(
    { retry: 0, ignoreResponseError: true, responseType: 'stream' },
    { fetch: config.fetch },
  )
  let lifecycle = new AbortController()
  async function withResponse<T>(
    path: string,
    options: RequestOptions,
    consume: (response: Response) => Promise<T>,
  ): Promise<T> {
    const timeout = new AbortController()
    const duration = options.timeoutMs ?? 30_000
    const timer =
      duration > 0
        ? setTimeout(() => timeout.abort(new DOMException('Timeout', 'TimeoutError')), duration)
        : undefined
    const signal = AbortSignal.any([
      lifecycle.signal,
      timeout.signal,
      ...(options.signal ? [options.signal] : []),
    ])
    const requestId = crypto.randomUUID()
    try {
      if (options.auth !== false && config.session)
        await waitWithSignal(config.session.ensureReady(), signal)
      signal.throwIfAborted()
      const url = new URL(resolveApiUrl(config.baseURL, path, config.origin))
      for (const [key, value] of Object.entries(options.query ?? {}))
        if (value !== undefined) url.searchParams.set(key, String(value))
      for (let attempt = 0; attempt < 2; attempt++) {
        signal.throwIfAborted()
        const usedToken = options.auth !== false ? config.session?.getToken() : null
        const headers = new Headers(options.headers)
        headers.set('Accept-Language', config.locale?.() ?? 'zh-CN')
        headers.set('X-Request-ID', requestId)
        if (!headers.has('Accept')) headers.set('Accept', 'application/json')
        // Callers cannot supply stale or third-party credentials.
        headers.delete('Authorization')
        if (usedToken) headers.set('Authorization', `Bearer ${usedToken}`)
        if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey)
        if (options.body !== undefined) headers.set('Content-Type', 'application/json')
        const response = await transport.raw(url.href, {
          method: options.method ?? 'GET',
          headers,
          credentials: 'include',
          signal,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          redirect: 'error',
        })
        if (!response.ok) {
          const value = await response.json().catch(() => null)
          const error = responseError(response.status, value, requestId)
          if (options.auth !== false && config.session && response.status === 401) {
            if (error.code === 40102 && attempt === 0) {
              // A late 401 from the old token must not cause another refresh.
              if (config.session.getToken() === usedToken)
                await waitWithSignal(config.session.refresh(), signal)
              continue
            }
            config.session.clear()
          }
          throw error
        }
        return await consume(response)
      }
      throw new ApiError('Authentication retry exhausted', { kind: 'auth' })
    } catch (error) {
      throw normalizeError(error, signal)
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return withResponse(path, options, async (response) => {
      let value: ApiEnvelope<T>
      try {
        value = (await response.json()) as ApiEnvelope<T>
      } catch {
        throw new ApiError('Invalid JSON response', { kind: 'protocol' })
      }
      if (!value || typeof value.code !== 'number' || !('data' in value))
        throw new ApiError('Invalid API envelope', { kind: 'protocol' })
      if (value.code !== 0) throw responseError(response.status, value)
      return value.data
    })
  }
  return {
    requestJson,
    withResponse,
    cancelAll() {
      lifecycle.abort()
      lifecycle = new AbortController()
    },
    /** One handle per user intent. Calling execute again preserves body and key. */
    operation<T>(
      path: string,
      options: Omit<RequestOptions, 'signal'>,
      key: string = crypto.randomUUID(),
    ) {
      const snapshot = structuredClone({ ...options, headers: undefined })
      const headers = new Headers(options.headers)
      const createdAt = Date.now()
      return {
        key,
        execute: (signal?: AbortSignal) => {
          if (Date.now() - createdAt >= 24 * 60 * 60 * 1000)
            return Promise.reject(
              new ApiError('Operation expired; reconcile resource state before retrying', {
                kind: 'protocol',
              }),
            )
          return requestJson<T>(path, { ...snapshot, headers, signal, idempotencyKey: key })
        },
      }
    },
  }
}
export type HttpClient = ReturnType<typeof createHttpClient>
