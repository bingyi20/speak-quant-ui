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
  initialNode: () => string | null = () => null,
) {
  const { $http } = useNuxtApp()
  const auth = useAuthStore()
  const enabled = String(useRuntimeConfig().public.apiEnabled) === 'true'
  const state = createStrategyDetailState(createStrategyApi($http))
  let generation = 0
  watch(
    [
      active,
      conversationId,
      () => auth.user?.id,
      () => auth.isAuthenticated,
      selection,
      initialNode,
    ],
    ([open, id, owner, authenticated]) => {
      const ticket = ++generation
      state.reset()
      if (open && owner && authenticated && enabled) {
        const node = initialNode()
        void state.load(id).then(() => {
          if (ticket === generation && node) void state.selectVersion(node)
        })
      }
    },
    { immediate: true, flush: 'sync' },
  )
  watch(revision, () => {
    if (active() && auth.isAuthenticated && enabled) void state.load(conversationId(), true)
  })
  onBeforeUnmount(state.reset)
  return state
}
