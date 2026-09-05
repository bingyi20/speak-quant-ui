import { describe, expect, it, vi } from 'vitest'
import { createHttpClient } from '~/lib/http/client'
import { createAuthSession } from '~/lib/http/session'
import { ApiError } from '~/lib/http/error'
import { resolveApiUrl } from '~/lib/http/url'
const response = (data: unknown, status = 200, code = 0) =>
  new Response(
    JSON.stringify({
      code,
      data,
      message: 'result',
      request_id: 'r1',
      error: code ? { key: 'TEST_KEY', fields: { field: 'invalid' } } : undefined,
    }),
    { status, headers: { 'Content-Type': 'application/json' } },
  )
const config = { baseURL: 'http://127.0.0.1:6001/api' }
describe('HTTP contract', () => {
  it('unwraps once and sends credentials, language, query and request id', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, options) => {
      const headers = new Headers(options?.headers)
      expect(options?.credentials).toBe('include')
      expect(headers.get('Accept-Language')).toBe('en-US')
      expect(headers.get('X-Request-ID')).toBeTruthy()
      expect(String(_url)).toContain('/api/users/me?page=1')
      return response({ name: 'test' })
    })
    const client = createHttpClient({ ...config, fetch, locale: () => 'en-US' })
    expect(await client.requestJson('/users/me', { query: { page: 1 } })).toEqual({ name: 'test' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('preserves business error data, key, fields and request id', async () => {
    const client = createHttpClient({
      ...config,
      fetch: async () => response({ email: 'test@example.com' }, 409, 40910),
    })
    await expect(client.requestJson('/auth/google')).rejects.toMatchObject({
      status: 409,
      code: 40910,
      key: 'TEST_KEY',
      data: { email: 'test@example.com' },
      requestId: 'r1',
    })
  })
  it('rejects nonzero success-envelope codes and malformed envelopes', async () => {
    const client = createHttpClient({ ...config, fetch: async () => response(null, 200, 40000) })
    await expect(client.requestJson('/test')).rejects.toMatchObject({
      kind: 'business',
      code: 40000,
    })
    const malformed = createHttpClient({ ...config, fetch: async () => new Response('{}') })
    await expect(malformed.requestJson('/test')).rejects.toMatchObject({ kind: 'protocol' })
  })
  it('does not automatically retry failed writes', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response(null, 503, 50300))
    await expect(
      createHttpClient({ ...config, fetch }).requestJson('/tasks', { method: 'POST', body: {} }),
    ).rejects.toMatchObject({ status: 503 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('keeps one key and frozen payload across retries of one intent', async () => {
    const keys: string[] = []
    const bodies: unknown[] = []
    const fetch: typeof globalThis.fetch = async (_url, options) => {
      keys.push(new Headers(options?.headers).get('Idempotency-Key')!)
      bodies.push(options?.body)
      return response('ok')
    }
    const client = createHttpClient({ ...config, fetch })
    const body = { content: 'original' }
    const operation = client.operation('/tasks', { method: 'POST', body })
    body.content = 'changed'
    await operation.execute()
    await operation.execute()
    expect(keys[0]).toBe(keys[1])
    expect(bodies).toEqual(['{"content":"original"}', '{"content":"original"}'])
    expect(client.operation('/tasks', { body }).key).not.toBe(operation.key)
  })
  it('single-flights concurrent 40102 refresh and reuses a new token for late 401s', async () => {
    const refresh = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return { access_token: 'new', user: 'alice' }
    })
    const session = createAuthSession({ refresh, onUser: vi.fn(), onClear: vi.fn() })
    session.accept({ access_token: 'old', user: 'alice' })
    const fetch: typeof globalThis.fetch = async (_url, options) =>
      new Headers(options?.headers).get('Authorization') === 'Bearer old'
        ? response(null, 401, 40102)
        : response('done')
    const client = createHttpClient({ ...config, fetch, session })
    expect(await Promise.all([client.requestJson('/a'), client.requestJson('/b')])).toEqual([
      'done',
      'done',
    ])
    expect(refresh).toHaveBeenCalledTimes(1)
  })
  it('stops after one auth retry and invalidates the session', async () => {
    const clear = vi.fn()
    const session = createAuthSession({
      refresh: async () => ({ access_token: 'new', user: 'a' }),
      onUser: vi.fn(),
      onClear: clear,
    })
    session.accept({ access_token: 'old', user: 'a' })
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response(null, 401, 40102))
    await expect(
      createHttpClient({ ...config, fetch, session }).requestJson('/test'),
    ).rejects.toMatchObject({ status: 401 })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(clear).toHaveBeenCalledOnce()
  })
  it('cancels and times out callers waiting on a shared refresh', async () => {
    let finish!: (value: { access_token: string; user: string }) => void
    const session = createAuthSession({
      refresh: () =>
        new Promise((resolve) => {
          finish = resolve
        }),
      onUser: vi.fn(),
      onClear: vi.fn(),
    })
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response('ok'))
    const client = createHttpClient({ ...config, fetch, session })
    const cancelled = new AbortController()
    const first = client.requestJson('/a', { signal: cancelled.signal })
    cancelled.abort()
    await expect(first).rejects.toMatchObject({ kind: 'cancelled' })
    await expect(client.requestJson('/b', { timeoutMs: 5 })).rejects.toMatchObject({
      kind: 'timeout',
    })
    finish({ access_token: 'new', user: 'a' })
    expect(await client.requestJson('/c')).toBe('ok')
  })
  it('prevents session resurrection from late refresh responses', async () => {
    let finish!: (value: { access_token: string; user: string }) => void
    const onUser = vi.fn()
    const session = createAuthSession({
      refresh: () =>
        new Promise((resolve) => {
          finish = resolve
        }),
      onUser,
      onClear: vi.fn(),
    })
    const job = session.refresh()
    session.clear()
    finish({ access_token: 'late', user: 'a' })
    await expect(job).rejects.toMatchObject({ kind: 'cancelled' })
    expect(session.getToken()).toBeNull()
    expect(onUser).not.toHaveBeenCalled()
  })
  it('isolates token state between client instances and retains retry after network failure', async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('offline', { kind: 'network' }))
      .mockResolvedValue({ access_token: 'a', user: 'alice' })
    const a = createAuthSession({ refresh, onUser: vi.fn(), onClear: vi.fn() })
    const b = createAuthSession({ refresh, onUser: vi.fn(), onClear: vi.fn() })
    await expect(a.restore()).rejects.toMatchObject({ kind: 'network' })
    await a.restore()
    expect(a.getToken()).toBe('a')
    expect(b.getToken()).toBeNull()
  })
  it('resolves backend stream paths exactly once and rejects arbitrary origins/traversal', () => {
    expect(resolveApiUrl(config.baseURL, '/api/agent-runs/id/events')).toBe(
      'http://127.0.0.1:6001/api/agent-runs/id/events',
    )
    expect(resolveApiUrl('/api', '/users/me', 'https://example.com')).toBe(
      'https://example.com/api/users/me',
    )
    for (const path of ['https://evil.com/api/a', '../admin', '/api/../admin', '//evil.com/api/x'])
      expect(() => resolveApiUrl(config.baseURL, path)).toThrow()
  })
})

describe('request lifecycle', () => {
  it('public requests neither restore auth nor attach an access token', async () => {
    const refresh = vi.fn()
    const session = createAuthSession({ refresh, onUser: vi.fn(), onClear: vi.fn() })
    session.accept({ access_token: 'secret', user: 'a' })
    const fetch: typeof globalThis.fetch = async (_url, options) => {
      expect(new Headers(options?.headers).get('Authorization')).toBeNull()
      return response('public')
    }
    await createHttpClient({ ...config, fetch, session }).requestJson('/public', { auth: false })
    expect(refresh).not.toHaveBeenCalled()
  })
  it('cancels in-flight transport on session cleanup and allows later requests', async () => {
    const fetch: typeof globalThis.fetch = async (_url, options) => {
      if (String(_url).endsWith('/later')) return response('ok')
      return new Promise((_resolve, reject) =>
        options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
          once: true,
        }),
      )
    }
    const client = createHttpClient({ ...config, fetch })
    const request = client.requestJson('/slow')
    client.cancelAll()
    await expect(request).rejects.toMatchObject({ kind: 'cancelled' })
    expect(await client.requestJson('/later')).toBe('ok')
  })
  it('limits operation retry lifetime to the backend idempotency window', async () => {
    vi.useFakeTimers()
    try {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => response('ok'))
      const operation = createHttpClient({ ...config, fetch }).operation('/tasks', {
        method: 'POST',
      })
      vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000)
      await expect(operation.execute()).rejects.toMatchObject({ kind: 'protocol' })
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
