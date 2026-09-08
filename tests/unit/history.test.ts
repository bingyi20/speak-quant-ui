import { describe, expect, it, vi } from 'vitest'
import { createHistoryState } from '~/features/conversation/history-state'
import type { ConversationApi } from '~/features/conversation/api'
import type { ConversationSummary } from '~/features/conversation/types'
import { createConversationApi } from '~/features/conversation/api'
import { createHttpClient } from '~/lib/http/client'

function row(id: string, favorite = false, time = '2026-09-01T00:00:00Z'): ConversationSummary {
  return {
    id,
    title: id,
    is_favorite: favorite,
    status: 'researching',
    created_at: time,
    updated_at: time,
    last_message_at: time,
  }
}
function page(items: ConversationSummary[], number = 1, totalPages = 1) {
  return { items, page: number, size: 20, total: items.length, total_pages: totalPages }
}
function setup() {
  const api = {
    list: vi.fn().mockResolvedValue(page([])),
    update: vi.fn(),
    detail: vi.fn(),
    remove: vi.fn(),
    create: vi.fn(),
  } as unknown as ConversationApi
  return { api, state: createHistoryState(api) }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('research history state', () => {
  it('paginates favorite and non_favorite independently without scanning all pages', async () => {
    const { api, state } = setup()
    vi.mocked(api.list).mockImplementation(async ({ scope, page: number } = {}) => {
      if (scope === 'favorite') return page([row('favorite', true)], 1, 5)
      return number === 1
        ? page([row('recent-history')], 1, 2)
        : page([row('older-history'), row('recent-history')], 2, 2)
    })
    await Promise.all([state.ensureLoaded(), state.ensureLoaded()])
    expect(api.list).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.list).mock.calls.map(([query]) => query?.scope)).toEqual([
      'favorite',
      'non_favorite',
    ])
    expect(state.favorites.value.map((item) => item.id)).toEqual(['favorite'])
    expect(state.history.value.map((item) => item.id)).toEqual(['recent-history'])
    expect(state.pages.favorite.hasMore).toBe(true)
    expect(state.pages.non_favorite.hasMore).toBe(true)
    await state.loadMore('non_favorite')
    expect(state.history.value).toHaveLength(2)
    expect(state.pages.non_favorite.hasMore).toBe(false)
    expect(state.pages.favorite.page).toBe(1)
  })
  it('moves records between groups on pin and unpin even if list refresh fails', async () => {
    const { api, state } = setup()
    vi.mocked(api.list).mockImplementation(async ({ scope } = {}) =>
      page(scope === 'favorite' ? [] : [row('one')]),
    )
    await state.ensureLoaded()
    vi.mocked(api.list).mockRejectedValue(new Error('offline'))
    vi.mocked(api.update)
      .mockResolvedValueOnce(row('one', true))
      .mockResolvedValueOnce(row('one', false))
    expect(await state.toggleFavorite('one')).toBe(true)
    expect(state.favorites.value.map((item) => item.id)).toEqual(['one'])
    expect(state.history.value).toEqual([])
    expect(await state.toggleFavorite('one')).toBe(true)
    expect(state.favorites.value).toEqual([])
    expect(state.history.value.map((item) => item.id)).toEqual(['one'])
  })
  it('does not replace saved titles on a failed write, and retries with the original draft', async () => {
    const { api, state } = setup()
    vi.mocked(api.list).mockResolvedValue(page([row('original')]))
    await state.ensureLoaded()
    vi.mocked(api.update)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        ...row('original', false, '2026-09-08T00:00:00Z'),
        title: 'new title',
      })
    expect(await state.rename('original', 'new title')).toBe(false)
    expect(state.items.value[0]!.title).toBe('original')
    expect(state.actionError.value).toBe('history.requestFailed')
    vi.mocked(api.list).mockResolvedValue(page([{ ...row('original'), title: 'new title' }]))
    expect(await state.rename('original', 'new title')).toBe(true)
    expect(state.items.value[0]!.title).toBe('new title')
  })
  it('ignores late reads and writes after an account reset', async () => {
    const { api, state } = setup()
    const list = deferred<ReturnType<typeof page>>()
    vi.mocked(api.list).mockReturnValue(list.promise)
    const loading = state.ensureLoaded()
    state.reset()
    list.resolve(page([row('previous-user')]))
    await loading
    expect(state.items.value).toEqual([])
    const update = deferred<ConversationSummary>()
    vi.mocked(api.update).mockReturnValue(update.promise)
    const saving = state.rename('previous-user', 'private title')
    state.reset()
    update.resolve({ ...row('previous-user'), title: 'private title' })
    expect(await saving).toBe(false)
    expect(state.items.value).toEqual([])
  })
  it('reuses the delete operation after a network error and rejects double submission', async () => {
    const { api, state } = setup()
    const result = deferred<{ deleted: boolean; conversation_id: string }>()
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockReturnValueOnce(result.promise)
    vi.mocked(api.remove).mockReturnValue({ key: 'same-key', execute })
    expect(await state.remove('one')).toBe(false)
    const retry = state.remove('one')
    expect(await state.remove('one')).toBe(false)
    result.resolve({ deleted: true, conversation_id: 'one' })
    expect(await retry).toBe(true)
    expect(api.remove).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledTimes(2)
  })
  it('retains loaded data when refresh fails and recovers via retry', async () => {
    const { api, state } = setup()
    vi.mocked(api.list).mockResolvedValue(page([row('one')]))
    await state.ensureLoaded()
    vi.mocked(api.list).mockRejectedValue(new Error('offline'))
    await state.refresh()
    expect(state.items.value).toHaveLength(1)
    expect(state.pages.non_favorite.error).toBe('history.requestFailed')
    vi.mocked(api.list).mockResolvedValue(page([row('two')]))
    await state.retry('non_favorite')
    expect(state.pages.non_favorite.error).toBe('')
    expect(state.pages.non_favorite.rows[0]!.id).toBe('two')
  })
  it('re-fetches loaded offset pages after a mutation changes sorting', async () => {
    const { api, state } = setup()
    vi.mocked(api.list).mockImplementation(async ({ page: number } = {}) =>
      page([row(`page-${number}`)], number, 3),
    )
    await state.ensureLoaded()
    await state.loadMore('non_favorite')
    vi.mocked(api.list).mockClear()
    vi.mocked(api.update).mockResolvedValue(row('page-2', true))
    await state.toggleFavorite('page-2')
    expect(vi.mocked(api.list).mock.calls.map(([query]) => [query?.scope, query?.page])).toEqual(
      expect.arrayContaining([
        ['non_favorite', 1],
        ['non_favorite', 2],
        ['favorite', 1],
      ]),
    )
  })
})

it('conversation transport sends exact scope, PATCH body and permanent DELETE headers with a stable key', async () => {
  const calls: { url: string; method: string; headers: Headers; body: string }[] = []
  const fetch = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    calls.push({
      url: String(url),
      method: String(options?.method),
      headers: new Headers(options?.headers),
      body: String(options?.body),
    })
    return new Response(
      JSON.stringify({ code: 0, data: { deleted: true, conversation_id: 'record' } }),
      { status: 200 },
    )
  }) as typeof globalThis.fetch
  const api = createConversationApi(
    createHttpClient({ baseURL: 'http://localhost:6001/api', fetch }),
  )
  await api.list({ scope: 'favorite', page: 2, size: 20 })
  await api.update('record', { is_favorite: true })
  const deletion = api.remove('record')
  await deletion.execute()
  await deletion.execute()
  expect(new URL(calls[0]!.url).searchParams.get('scope')).toBe('favorite')
  expect(calls[1]!.method).toBe('PATCH')
  expect(JSON.parse(calls[1]!.body)).toEqual({ is_favorite: true })
  expect(calls[2]!.headers.get('X-Confirm-Delete')).toBe('permanent')
  expect(calls[2]!.headers.get('Idempotency-Key')).toBe(calls[3]!.headers.get('Idempotency-Key'))
})
