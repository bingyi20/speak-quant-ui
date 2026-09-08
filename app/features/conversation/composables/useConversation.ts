import { computed, onBeforeUnmount, onMounted, ref, watch, toRaw } from 'vue'
import { useNuxtApp, useRuntimeConfig } from '#app'
import { useAuthStore } from '~/features/auth'
import { ApiError } from '~/lib/http/error'
import { createConversationApi } from '../api'
import { useConversationHistoryStore } from '../history-store'
import { emptyRun, mergeHistory, projectMessages } from '../message-state'
import {
  readSubmission,
  saveSubmission,
  submissionExpired,
  type PendingSubmission,
} from '../submission'
import { useResearchDraft } from './useResearchDraft'
import { clearClarificationDrafts } from './useClarification'
import { useAgentRun } from './useAgentRun'
import type {
  ConversationAssets,
  ConversationMessage,
  DisplayMessage,
  MessageSubmission,
} from '../types'

export function useConversation(id: string) {
  const { $http } = useNuxtApp()
  const api = createConversationApi($http)
  const auth = useAuthStore()
  const historyStore = useConversationHistoryStore()
  const enabled = String(useRuntimeConfig().public.apiEnabled) === 'true'
  const draft = useResearchDraft(id)
  const history = ref<ConversationMessage[]>([])
  const loading = ref(true)
  const loadError = ref('')
  const hasMore = ref(false)
  const before = ref<number | null>(null)
  const loadingMore = ref(false)
  const moreError = ref('')
  const pending = ref<PendingSubmission | null>(null)
  const otherPending = ref<string | null>(null)
  const canEditPending = computed(
    () => !!pending.value && (pending.value.rejected || submissionExpired(pending.value)),
  )
  const submitting = ref(false)
  const sendError = ref('')
  const localFailed = ref(false)
  const assets = ref<ConversationAssets | null>(null)
  const assetsLoading = ref(false)
  const assetsError = ref('')
  const controller = new AbortController()
  let alive = true
  const owner = auth.user?.id
  let moreController: AbortController | undefined
  const valid = () =>
    alive && !controller.signal.aborted && auth.user?.id === owner && auth.isAuthenticated
  const run = useAgentRun(
    api,
    id,
    () => history.value,
    async () => {
      await syncHistory()
      if (!valid()) return
      Object.assign(run.state, { messages: new Map(), lengths: new Map(), tools: new Map() })
      void historyStore.refreshDetail(id, controller.signal).catch(() => {})
      void historyStore.refresh()
      if (assets.value) void loadAssets()
    },
  )
  const pendingMessage = computed<DisplayMessage | null>(() =>
    pending.value
      ? {
          id: pending.value.key,
          role: 'user',
          status: 'completed',
          content: pending.value.display,
          cards: [],
          localFailure: localFailed.value,
          localPending: true,
        }
      : null,
  )
  const messages = computed(() => projectMessages(history.value, run.state, pendingMessage.value))
  const blocked = computed(
    () =>
      !enabled ||
      loading.value ||
      !!loadError.value ||
      submitting.value ||
      run.active.value ||
      !!pending.value ||
      !!otherPending.value,
  )
  const waiting = computed(
    () =>
      run.active.value &&
      !run.reconnecting.value &&
      !run.error.value &&
      ![...run.state.messages.values()].some((m) => m.content || m.cards.length) &&
      !run.state.tools.size,
  )

  async function syncHistory() {
    moreController?.abort()
    loadingMore.value = false
    const oldest = history.value[0]?.sequence
    let result = await api.messages(id, undefined, controller.signal)
    let rows = result.items
    const activeRun = result.active_run
    while (
      result.has_more &&
      result.next_before_sequence !== null &&
      oldest !== undefined &&
      (rows[0]?.sequence ?? Infinity) > oldest
    ) {
      result = await api.messages(id, result.next_before_sequence, controller.signal)
      rows = [...result.items, ...rows]
    }
    if (!valid()) return null
    // Refetch pages to cover the loaded range without inserting older, unrequested messages.
    const fetchedEarlier = oldest !== undefined && rows.some((message) => message.sequence < oldest)
    if (oldest !== undefined) rows = rows.filter((message) => message.sequence >= oldest)
    history.value = mergeHistory(history.value, rows)
    hasMore.value = result.has_more || fetchedEarlier
    before.value = fetchedEarlier ? (oldest ?? null) : result.next_before_sequence
    return activeRun
  }
  async function load() {
    if (!enabled) {
      loading.value = false
      loadError.value = 'research.notConnected'
      return
    }
    loading.value = true
    loadError.value = ''
    try {
      const [, activeRun] = await Promise.all([
        historyStore.refreshDetail(id, controller.signal),
        syncHistory(),
      ])
      if (!valid()) return
      loading.value = false
      if (activeRun) void run.connect(activeRun)
    } catch (cause) {
      if (!valid()) return
      loadError.value =
        cause instanceof ApiError && cause.status === 404 ? 'chat.notFound' : 'chat.loadFailed'
    } finally {
      if (valid()) loading.value = false
    }
  }
  async function loadMore() {
    if (!valid() || loadingMore.value || !hasMore.value || before.value === null) return
    const request = new AbortController()
    moreController = request
    loadingMore.value = true
    moreError.value = ''
    try {
      const page = await api.messages(
        id,
        before.value,
        AbortSignal.any([request.signal, controller.signal]),
      )
      if (!valid() || request.signal.aborted) return
      history.value = mergeHistory(history.value, page.items)
      hasMore.value = page.has_more
      before.value = page.next_before_sequence
    } catch {
      if (valid() && !request.signal.aborted) moreError.value = 'chat.loadFailed'
    } finally {
      if (moreController === request) loadingMore.value = false
    }
  }
  function persist(value: PendingSubmission | null) {
    pending.value = value
    if (owner) saveSubmission(owner, value)
  }
  async function deliver() {
    const intent = pending.value
    if (!intent || submitting.value || !valid()) return
    if (submissionExpired(intent)) {
      sendError.value = 'chat.expiredSubmission'
      return
    }
    // An uncertain request is retried with its original body/key even if its Run is already active.
    submitting.value = true
    localFailed.value = false
    sendError.value = ''
    persist({ ...intent, phase: 'sending' })
    try {
      const response = await api.send(id, toRaw(intent.body), intent.key).execute(controller.signal)
      if (!valid()) return
      history.value = mergeHistory(history.value, [
        response.user_message,
        ...response.updated_messages,
      ])
      for (const message of response.updated_messages)
        clearClarificationDrafts(owner!, id, message.id)
      persist(null)
      Object.assign(run.state, emptyRun())
      void historyStore.refresh()
      void run.connect(response.agent_run)
    } catch (cause) {
      if (!valid()) return
      persist({
        ...intent,
        phase: 'failed',
        rejected:
          cause instanceof ApiError && [400, 403, 404, 409, 422].includes(cause.status ?? 0),
      })
      localFailed.value = true
      sendError.value =
        cause instanceof ApiError && [400, 422].includes(cause.status ?? 0)
          ? 'chat.invalidAnswer'
          : cause instanceof ApiError && cause.status === 409
            ? 'chat.conflict'
            : 'chat.sendFailed'
      if (cause instanceof ApiError && cause.status === 409) {
        const activeRun = await syncHistory().catch(() => null)
        if (activeRun && valid()) void run.connect(activeRun)
      }
    } finally {
      if (valid()) submitting.value = false
    }
  }
  function send(body?: MessageSubmission, display?: string) {
    if (blocked.value || !valid()) return
    const content = draft.value.trim()
    if (!body && !content) return
    if (!body && Array.from(content).length > 20000) {
      sendError.value = 'chat.invalidContent'
      return
    }
    persist({
      key: crypto.randomUUID(),
      owner: owner!,
      kind: 'message',
      conversationId: id,
      body: structuredClone(toRaw(body ?? { content })),
      display: display ?? content,
      createdAt: Date.now(),
      phase: 'ready',
    })
    if (!body) draft.value = ''
    void deliver()
  }
  function dismissPending() {
    if (submitting.value || !canEditPending.value) return
    if (pending.value?.body.content)
      draft.value = [pending.value.body.content, draft.value].filter(Boolean).join('\n\n')
    persist(null)
    sendError.value = ''
    localFailed.value = false
  }
  async function loadAssets(page = 1) {
    if (!valid() || assetsLoading.value) return
    assetsLoading.value = true
    assetsError.value = ''
    try {
      const result = await api.assets(id, page, controller.signal)
      if (!valid()) return
      if (page > 1 && assets.value) {
        const rows = new Map(
          [...assets.value.replays.items, ...result.replays.items].map((r) => [r.id, r]),
        )
        result.replays.items = [...rows.values()]
      }
      assets.value = result
    } catch {
      if (valid()) assetsError.value = 'chat.assetsFailed'
    } finally {
      if (valid()) assetsLoading.value = false
    }
  }
  onMounted(() => {
    if (owner) {
      const saved = readSubmission(owner)
      if (saved?.kind === 'message' && saved.conversationId === id) {
        pending.value = saved
        localFailed.value = true
        sendError.value = submissionExpired(saved)
          ? 'chat.expiredSubmission'
          : 'chat.pendingMessage'
      } else if (saved?.kind === 'create' && saved.acceptedConversationId === id)
        saveSubmission(owner, null)
      else if (saved) {
        otherPending.value =
          saved.kind === 'message'
            ? `/conversations/${encodeURIComponent(saved.conversationId!)}`
            : '/new-task'
        sendError.value = 'chat.pendingElsewhere'
      }
    }
    void load()
  })
  function dispose() {
    controller.abort()
    moreController?.abort()
    run.reset()
    history.value = []
    assets.value = null
    pending.value = null
    otherPending.value = null
  }
  watch(
    () => [auth.user?.id, auth.isAuthenticated],
    () => {
      if (auth.user?.id !== owner || !auth.isAuthenticated) dispose()
    },
    { flush: 'sync' },
  )
  onBeforeUnmount(() => {
    alive = false
    dispose()
  })
  return {
    draft,
    messages,
    loading,
    loadError,
    load,
    hasMore,
    loadingMore,
    moreError,
    loadMore,
    blocked,
    waiting,
    run,
    send,
    sendError,
    submitting,
    pending,
    otherPending,
    canEditPending,
    retrySend: deliver,
    dismissPending,
    assets,
    assetsLoading,
    assetsError,
    loadAssets,
  }
}
