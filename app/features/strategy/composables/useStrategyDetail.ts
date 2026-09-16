import { onBeforeUnmount, watch } from 'vue'
import { useNuxtApp, useRuntimeConfig } from '#app'
import { useAuthStore } from '~/features/auth'
import { createStrategyApi } from '../api'
import { createStrategyDetailState } from '../detail-state'

export function useStrategyDetail(
  conversationId: () => string,
  active: () => boolean,
  revision: () => number,
  selection: () => number,
) {
  const { $http } = useNuxtApp()
  const auth = useAuthStore()
  const enabled = String(useRuntimeConfig().public.apiEnabled) === 'true'
  const state = createStrategyDetailState(createStrategyApi($http))
  watch(
    [active, conversationId, () => auth.user?.id, () => auth.isAuthenticated, selection],
    ([open, id, owner, authenticated]) => {
      state.reset()
      if (open && owner && authenticated && enabled) void state.load(id)
    },
    { immediate: true, flush: 'sync' },
  )
  watch(revision, () => {
    if (active() && auth.isAuthenticated && enabled) void state.load(conversationId(), true)
  })
  onBeforeUnmount(state.reset)
  return state
}
