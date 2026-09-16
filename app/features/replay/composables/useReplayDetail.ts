import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useNuxtApp } from '#app'
import { useAuthStore } from '~/features/auth'
import { createReplayApi } from '../api'
import type { ReplayDetail } from '../types'

export function useReplayDetail(id: () => string | null, revision: () => number) {
  const api = createReplayApi(useNuxtApp().$http)
  const auth = useAuthStore()
  const detail = shallowRef<ReplayDetail | null>(null)
  const loading = ref(false)
  const error = ref('')
  let request: AbortController | undefined
  function reset() {
    request?.abort()
    detail.value = null
    error.value = ''
    loading.value = false
  }
  async function load() {
    reset()
    const replayId = id()
    if (!replayId || !auth.isAuthenticated) return
    const pending = new AbortController()
    request = pending
    loading.value = true
    try {
      const result = await api.detail(replayId, pending.signal)
      if (!pending.signal.aborted) detail.value = result
    } catch {
      if (!pending.signal.aborted) error.value = 'strategy.replayFailed'
    } finally {
      if (!pending.signal.aborted) loading.value = false
    }
  }
  watch([id, () => auth.user?.id, () => auth.isAuthenticated, revision], load, {
    immediate: true,
    flush: 'sync',
  })
  onBeforeUnmount(reset)
  return { detail, loading, error, load }
}
