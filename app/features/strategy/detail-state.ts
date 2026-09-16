import { computed, ref, shallowRef } from 'vue'
import { ApiError } from '~/lib/http/error'
import type { StrategyApi } from './api'
import type { CurrentStrategy, StrategyNode, StrategyTab, StrategyVersion } from './types'

/** Local to one open asset panel. No cross-user or application-wide resource cache. */
export function createStrategyDetailState(api: StrategyApi) {
  const current = shallowRef<CurrentStrategy | null>(null)
  const node = shallowRef<StrategyNode | null>(null)
  const versions = shallowRef<StrategyVersion[]>([])
  const version = ref('current')
  const tab = ref<StrategyTab>('design')
  const allReplays = ref(false)
  const loading = ref(false)
  const error = ref('')
  const historyLoading = ref(false)
  const historyError = ref('')
  let request: AbortController | undefined
  let historyRequest: AbortController | undefined
  let nodeRequest: AbortController | undefined
  let conversationId = ''

  const detail = computed(() => (version.value === 'current' ? current.value : node.value))
  const selectedNodeId = computed(() =>
    version.value === 'current' ? (current.value?.current_node_id ?? null) : version.value,
  )
  const selectedReplays = computed(
    () =>
      (version.value === 'current' ? current.value?.replays : node.value?.replays)?.filter(
        (replay) => !!selectedNodeId.value && replay.strategy_node_id === selectedNodeId.value,
      ) ?? [],
  )
  const replays = computed(() =>
    [...(allReplays.value ? (current.value?.replays ?? []) : selectedReplays.value)].sort(
      (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
    ),
  )
  const versionNames = computed(() => {
    const names = new Map(versions.value.map((item) => [item.id, item.change_summary || item.name]))
    if (current.value?.current_node_id)
      names.set(current.value.current_node_id, current.value.change_summary || current.value.name)
    return names
  })
  function cancel() {
    request?.abort()
    historyRequest?.abort()
    nodeRequest?.abort()
    loading.value = false
    historyLoading.value = false
  }
  function reset() {
    cancel()
    current.value = null
    node.value = null
    versions.value = []
    version.value = 'current'
    allReplays.value = false
    error.value = ''
    historyError.value = ''
  }
  async function loadHistory() {
    if (!current.value) return
    historyRequest?.abort()
    const pending = new AbortController()
    historyRequest = pending
    historyLoading.value = true
    historyError.value = ''
    try {
      const rows = new Map<string, StrategyVersion>()
      let page = 1
      let totalPages = 1
      do {
        const result = await api.history(current.value.id, page, pending.signal)
        if (pending.signal.aborted) return
        result.items.forEach((item) => rows.set(item.id, item))
        totalPages = result.total_pages
        page++
      } while (page <= totalPages)
      versions.value = [...rows.values()]
    } catch {
      if (!pending.signal.aborted) historyError.value = 'strategy.historyFailed'
    } finally {
      if (!pending.signal.aborted) historyLoading.value = false
    }
  }
  async function selectVersion(id: string) {
    request?.abort()
    nodeRequest?.abort()
    version.value = id
    allReplays.value = false
    node.value = null
    error.value = ''
    if (id === 'current') {
      loading.value = false
      return
    }
    const pending = new AbortController()
    nodeRequest = pending
    loading.value = true
    try {
      const result = await api.node(id, pending.signal)
      if (!pending.signal.aborted) node.value = result
    } catch (cause) {
      if (!pending.signal.aborted)
        error.value =
          cause instanceof ApiError && cause.status === 404
            ? 'strategy.notFound'
            : 'strategy.loadFailed'
    } finally {
      if (!pending.signal.aborted) loading.value = false
    }
  }
  async function load(id = conversationId, preserve = false) {
    const previousVersion = preserve ? version.value : 'current'
    if (!preserve) reset()
    else cancel()
    conversationId = id
    const pending = new AbortController()
    request = pending
    loading.value = true
    error.value = ''
    try {
      const result = await api.current(id, pending.signal)
      if (pending.signal.aborted) return
      current.value = result
      await loadHistory()
      if (pending.signal.aborted) return
      if (previousVersion !== 'current') await selectVersion(previousVersion)
    } catch (cause) {
      if (!pending.signal.aborted)
        error.value =
          cause instanceof ApiError && cause.status === 404
            ? 'strategy.notFound'
            : 'strategy.loadFailed'
    } finally {
      if (!pending.signal.aborted) loading.value = false
    }
  }
  function selectTab(value: StrategyTab) {
    if (tab.value !== value) allReplays.value = false
    tab.value = value
  }
  return {
    current,
    node,
    versions,
    version,
    tab,
    allReplays,
    loading,
    error,
    historyLoading,
    historyError,
    detail,
    selectedNodeId,
    selectedReplays,
    replays,
    versionNames,
    load,
    loadHistory,
    selectVersion,
    selectTab,
    cancel,
    reset,
    retry: () =>
      version.value === 'current' ? load(conversationId, true) : selectVersion(version.value),
  }
}
export type StrategyDetailState = ReturnType<typeof createStrategyDetailState>
