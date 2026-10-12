import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useNuxtApp, useRuntimeConfig } from '#app'
import { useAuthStore } from '~/features/auth'
import { createConversationApi } from './api'
import { createHistoryState } from './history-state'

export const useConversationHistoryStore = defineStore('conversation-history', () => {
  const auth = useAuthStore()
  const enabled = String(useRuntimeConfig().public.apiEnabled) === 'true'
  const state = createHistoryState(createConversationApi(useNuxtApp().$http))
  // Follow each group's records until the user explicitly chooses its state.
  const favoritesCollapsedOverride = ref<boolean | null>(null)
  const historyCollapsedOverride = ref<boolean | null>(null)
  const favoritesCollapsed = computed({
    get: () =>
      favoritesCollapsedOverride.value ??
      !(state.favorites.value.length || state.pages.favorite.error),
    set: (value: boolean) => (favoritesCollapsedOverride.value = value),
  })
  const historyCollapsed = computed({
    get: () =>
      historyCollapsedOverride.value ??
      !(state.history.value.length || state.pages.non_favorite.error),
    set: (value: boolean) => (historyCollapsedOverride.value = value),
  })
  let owner: string | null = null
  // Reset synchronously on logout/account changes so previous records cannot reappear.
  watch(
    () => [auth.user?.id, auth.isAuthenticated] as const,
    ([id, authenticated]) => {
      const next = authenticated && id ? id : null
      if (owner !== next) {
        state.reset()
        favoritesCollapsedOverride.value = null
        historyCollapsedOverride.value = null
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
