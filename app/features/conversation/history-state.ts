import { computed, reactive, ref } from 'vue'
import { ApiError } from '~/lib/http/error'
import type { ConversationApi } from './api'
import type { ConversationScope, ConversationSummary, ConversationUpdate } from './types'

type HistoryScope = Exclude<ConversationScope, 'all'>
const scopes: HistoryScope[] = ['favorite', 'non_favorite']
const emptyPage = () => ({
  rows: [] as ConversationSummary[],
  page: 0,
  hasMore: false,
  loading: false,
  error: '',
})
function errorKey(error: unknown) {
  if (error instanceof ApiError) {
    if (error.kind === 'cancelled' || error.kind === 'auth') return ''
    if (error.status === 404) return 'history.notFound'
    if (error.status === 422) return 'history.invalidTitle'
  }
  return 'history.requestFailed'
}
function unique(rows: ConversationSummary[]) {
  const byId = new Map<string, ConversationSummary>()
  for (const row of rows) {
    const current = byId.get(row.id)
    if (!current || row.updated_at >= current.updated_at) byId.set(row.id, row)
  }
  return [...byId.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

/** Instance-local requests are never serialized into Pinia or persisted. */
export function createHistoryState(
  api: Pick<ConversationApi, 'list' | 'detail' | 'update' | 'remove'>,
) {
  const pages = reactive({ favorite: emptyPage(), non_favorite: emptyPage() })
  const pendingId = ref('')
  const actionError = ref('')
  const detail = ref<ConversationSummary | null>(null)
  const items = computed(() =>
    unique([
      ...pages.non_favorite.rows,
      ...pages.favorite.rows,
      ...(detail.value ? [detail.value] : []),
    ]),
  )
  const favorites = computed(() => pages.favorite.rows)
  const history = computed(() => pages.non_favorite.rows)
  const requests = new Map<HistoryScope, AbortController>()
  const deletes = new Map<string, ReturnType<ConversationApi['remove']>>()
  let mutation: AbortController | undefined
  let detailRequest: AbortController | undefined
  let generation = 0

  function cancelReads() {
    for (const controller of requests.values()) controller.abort()
    requests.clear()
    for (const scope of scopes) pages[scope].loading = false
  }
  function reset() {
    generation++
    cancelReads()
    mutation?.abort()
    detailRequest?.abort()
    deletes.clear()
    for (const scope of scopes) Object.assign(pages[scope], emptyPage())
    detail.value = null
    pendingId.value = ''
    actionError.value = ''
  }
  async function load(scope: HistoryScope, refresh = false) {
    const state = pages[scope]
    if (state.loading) return
    const controller = new AbortController()
    requests.set(scope, controller)
    state.loading = true
    state.error = ''
    const start = refresh ? 1 : state.page + 1
    const end = refresh ? Math.max(1, state.page) : start
    let rows = refresh ? [] : [...state.rows]
    let lastPage = state.page
    let hasMore = state.hasMore
    try {
      // Re-fetch the loaded prefix after writes: offset pages shift when updated_at changes.
      for (let page = start; page <= end; page++) {
        const result = await api.list({ scope, page, size: 20 }, controller.signal)
        if (requests.get(scope) !== controller) return
        rows = unique([...rows, ...result.items])
        lastPage = result.page
        hasMore = result.page < result.total_pages
        if (!hasMore) break
      }
      state.rows = rows
      state.page = lastPage
      state.hasMore = hasMore
    } catch (error) {
      if (requests.get(scope) === controller) state.error = errorKey(error)
    } finally {
      if (requests.get(scope) === controller) {
        requests.delete(scope)
        state.loading = false
      }
    }
  }
  async function ensureLoaded() {
    await Promise.all(
      scopes
        .filter((scope) => !pages[scope].page && !pages[scope].error)
        .map((scope) => load(scope)),
    )
  }
  async function refresh() {
    cancelReads()
    await Promise.all(scopes.map((scope) => load(scope, true)))
  }
  async function loadMore(scope: HistoryScope) {
    if (pendingId.value || !pages[scope].hasMore) return
    await load(scope)
  }
  async function retry(scope: HistoryScope) {
    if (pendingId.value) return
    await load(scope, true)
  }
  async function refreshDetail(id: string, signal?: AbortSignal) {
    detailRequest?.abort()
    const controller = new AbortController()
    detailRequest = controller
    const current = generation
    const result = await api.detail(
      id,
      signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
    )
    if (
      !controller.signal.aborted &&
      !signal?.aborted &&
      detailRequest === controller &&
      generation === current
    )
      detail.value = result.conversation
    return result.conversation
  }
  async function loadDetail(id: string) {
    if (!id || items.value.some((item) => item.id === id)) return
    try {
      await refreshDetail(id)
    } catch {
      /* Page controller displays detail errors. */
    }
  }
  function replace(item: ConversationSummary) {
    for (const scope of scopes) {
      pages[scope].rows = pages[scope].rows.filter((row) => row.id !== item.id)
      if (scope === (item.is_favorite ? 'favorite' : 'non_favorite'))
        pages[scope].rows = unique([item, ...pages[scope].rows])
    }
    if (detail.value?.id === item.id) detail.value = item
  }
  async function write(id: string, change?: ConversationUpdate) {
    if (pendingId.value) return false
    const current = generation
    pendingId.value = id
    detailRequest?.abort()
    actionError.value = ''
    cancelReads()
    const controller = new AbortController()
    mutation = controller
    try {
      if (change) {
        const item = await api.update(id, change, controller.signal)
        if (generation !== current) return false
        replace(item)
      } else {
        let operation = deletes.get(id)
        if (!operation) {
          operation = api.remove(id)
          deletes.set(id, operation)
        }
        const result = await operation.execute(controller.signal)
        if (generation !== current) return false
        if (!result.deleted || result.conversation_id !== id)
          throw new ApiError('Invalid deletion response', { kind: 'protocol' })
        deletes.delete(id)
        for (const scope of scopes)
          pages[scope].rows = pages[scope].rows.filter((row) => row.id !== id)
        if (detail.value?.id === id) detail.value = null
      }
      await refresh()
      return generation === current
    } catch (error) {
      if (generation === current) actionError.value = errorKey(error)
      return false
    } finally {
      if (generation === current) {
        pendingId.value = ''
        mutation = undefined
      }
    }
  }
  function rename(id: string, value: string) {
    const title = value.trim()
    if (!title || [...title].length > 200) {
      actionError.value = 'history.invalidTitle'
      return Promise.resolve(false)
    }
    return write(id, { title })
  }
  function toggleFavorite(id: string) {
    const item = items.value.find((row) => row.id === id)
    return item ? write(id, { is_favorite: !item.is_favorite }) : Promise.resolve(false)
  }
  return {
    pages,
    items,
    favorites,
    history,
    pendingId,
    actionError,
    ensureLoaded,
    refresh,
    loadMore,
    retry,
    reset,
    loadDetail,
    refreshDetail,
    rename,
    toggleFavorite,
    remove: (id: string) => write(id),
  }
}
