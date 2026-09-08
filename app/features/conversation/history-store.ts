import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useNuxtApp, useRuntimeConfig } from '#app'
import { useAuthStore } from '~/features/auth'
import { createConversationApi } from './api'
import { createHistoryState } from './history-state'

export const useConversationHistoryStore = defineStore('conversation-history', () => {
  const auth = useAuthStore()
  const enabled = String(useRuntimeConfig().public.apiEnabled) === 'true'
  const state = createHistoryState(createConversationApi(useNuxtApp().$http))
  const favoritesCollapsed = ref(false)
  const historyCollapsed = ref(false)
  let owner: string | null = null
  // Reset synchronously on logout/account changes so previous records cannot reappear.
  watch(
    () => [auth.user?.id, auth.isAuthenticated] as const,
    ([id, authenticated]) => {
      const next = authenticated && id ? id : null
      if (owner !== next) {
        state.reset()
        owner = next
      }
      if (import.meta.client && enabled && next) void state.ensureLoaded()
    },
    { immediate: true, flush: 'sync' },
  )
  async function toggleFavorite(id: string) {
    const changed = await state.toggleFavorite(id)
    if (changed) {
      if (state.items.value.find((item) => item.id === id)?.is_favorite)
        favoritesCollapsed.value = false
      else historyCollapsed.value = false
    }
    return changed
  }
  return {
    ...state,
    loadDetail: (id: string) => (enabled && owner ? state.loadDetail(id) : Promise.resolve()),
    enabled,
    favoritesCollapsed,
    historyCollapsed,
    toggleFavorite,
  }
})
