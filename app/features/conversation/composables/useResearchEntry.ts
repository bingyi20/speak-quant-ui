import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useNuxtApp, useRoute, useRouter, useRuntimeConfig, useState } from '#app'
import { useResearchDraft } from './useResearchDraft'
import { useAuthStore } from '~/features/auth'
import { createConversationApi } from '../api'
import { useConversationHistoryStore } from '../history-store'
import { writeStorage } from '~/lib/storage/safe-storage'
import { ApiError } from '~/lib/http/error'
import {
  readSubmission,
  saveSubmission,
  submissionExpired,
  type PendingSubmission,
} from '../submission'

export function useResearchEntry() {
  const draft = useResearchDraft()
  const auth = useAuthStore()
  const { $http, $restoreAuth } = useNuxtApp()
  const api = createConversationApi($http)
  const history = useConversationHistoryStore()
  const router = useRouter()
  const route = useRoute()
  const enabled = String(useRuntimeConfig().public.apiEnabled) === 'true'
  const busyKey = useState('research-entry-busy-key', () => '')
  const busy = computed(() => !!busyKey.value)
  const draftState = useState<Record<string, string>>('research-drafts', () => ({}))
  const intent = useState<PendingSubmission | null>('research-entry-intent', () => null)
  const error = ref('')
  const canEdit = computed(
    () =>
      !!intent.value &&
      (intent.value.rejected || intent.value.phase === 'ready' || submissionExpired(intent.value)),
  )
  const owner = () => auth.user?.id ?? 'anonymous'
  let controller: AbortController | undefined
  let alive = true
  const blocked = computed(
    () => busy.value || !!intent.value || ['unknown', 'restoring'].includes(auth.status),
  )
  function persist(value: PendingSubmission | null) {
    intent.value = value
    saveSubmission(owner(), value)
  }
  async function execute() {
    const pending = intent.value
    if (!pending || busy.value || pending.owner !== owner()) return
    if (pending.kind === 'message') {
      await router.push(`/conversations/${encodeURIComponent(pending.conversationId!)}`)
      return
    }
    if (!auth.isAuthenticated) {
      persist({ ...pending, phase: 'ready', autoContinue: true })
      await router.push({ path: '/login', query: { returnTo: '/new-task' } })
      return
    }
    if (!pending.acceptedConversationId && submissionExpired(pending)) {
      error.value = 'chat.expiredSubmission'
      return
    }
    busyKey.value = pending.key
    error.value = ''
    controller = new AbortController()
    const signal = controller.signal
    try {
      let id = pending.acceptedConversationId
      if (!id) {
        persist({ ...pending, phase: 'sending', autoContinue: false })
        const result = await api.create(pending.body.content!, pending.key).execute(signal)
        if (signal.aborted || !alive || owner() !== pending.owner) return
        id = result.id
        persist({ ...pending, phase: 'accepted', acceptedConversationId: id })
        void history.refresh()
      }
      const nextDraft = draft.value
      if (nextDraft) {
        const targetKey = `trade-research-draft:${pending.owner}:${id}`
        draftState.value[targetKey] = nextDraft
        try {
          writeStorage(sessionStorage, targetKey, nextDraft)
        } catch {
          /* optional storage */
        }
      }
      await router.push(`/conversations/${encodeURIComponent(id)}`)
      if (owner() === pending.owner && draft.value === nextDraft) draft.value = ''
    } catch (cause) {
      if (signal.aborted || !alive || owner() !== pending.owner) return
      persist({
        ...intent.value!,
        phase: intent.value?.acceptedConversationId ? 'accepted' : 'failed',
        rejected:
          cause instanceof ApiError && [400, 403, 404, 409, 422].includes(cause.status ?? 0),
      })
      error.value =
        cause instanceof ApiError && cause.status === 422
          ? 'chat.invalidContent'
          : 'chat.createFailed'
    } finally {
      if (busyKey.value === pending.key) busyKey.value = ''
    }
  }
  async function submit() {
    if (blocked.value || !draft.value.trim()) return
    if (!enabled) {
      error.value = 'research.notConnected'
      return
    }
    if ([...draft.value.trim()].length > 20000) {
      error.value = 'chat.invalidContent'
      return
    }
    if (auth.status === 'unavailable') {
      await $restoreAuth()
      if (auth.status === 'unavailable') {
        error.value = 'chat.createFailed'
        return
      }
    }
    const value: PendingSubmission = {
      key: crypto.randomUUID(),
      owner: owner(),
      kind: 'create',
      body: { content: draft.value.trim() },
      display: draft.value.trim(),
      createdAt: Date.now(),
      phase: 'ready',
      autoContinue: !auth.isAuthenticated,
    }
    persist(value)
    draft.value = ''
    if (!auth.isAuthenticated) {
      await router.push({ path: '/login', query: { returnTo: '/new-task' } })
    } else await execute()
  }
  function dismiss() {
    if (busy.value || !canEdit.value) return
    if (intent.value?.body.content)
      draft.value = [intent.value.body.content, draft.value].filter(Boolean).join('\n\n')
    persist(null)
    error.value = ''
  }
  onMounted(() => {
    const saved = readSubmission(owner())
    intent.value = saved
    if (!intent.value) return
    if (intent.value.kind === 'message') {
      error.value = 'chat.pendingElsewhere'
      return
    }
    if (intent.value.phase === 'accepted') void execute()
    else if (
      intent.value.phase === 'ready' &&
      route.path === '/new-task' &&
      intent.value.autoContinue &&
      auth.isAuthenticated
    )
      void execute()
    else
      error.value = submissionExpired(intent.value)
        ? 'chat.expiredSubmission'
        : 'chat.pendingCreate'
  })
  watch(
    () => auth.user?.id,
    () => {
      controller?.abort()
      intent.value = null
      error.value = ''
      busyKey.value = ''
    },
    { flush: 'sync' },
  )
  onBeforeUnmount(() => {
    alive = false
    controller?.abort()
  })
  return { draft, error, busy, intent, canEdit, blocked, submit, retry: execute, dismiss }
}
