import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ConversationSummary } from './types'

export const useConversationHistoryStore = defineStore('conversation-history', () => {
  const items = ref<ConversationSummary[]>([])
  const favoritesCollapsed = ref(false)
  const historyCollapsed = ref(false)
  const initialized = ref(false)
  const sorted = computed(() =>
    [...items.value].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  )
  const favorites = computed(() => sorted.value.filter((item) => item.is_favorite))
  const history = computed(() => sorted.value.filter((item) => !item.is_favorite))

  async function initializePreview() {
    if (initialized.value) return
    initialized.value = true
    if (import.meta.dev) {
      const { createMockHistory } = await import('./mock-history')
      items.value = createMockHistory()
    }
  }
  function toggleFavorite(id: string) {
    const item = items.value.find((item) => item.id === id)
    if (!item) return
    item.is_favorite = !item.is_favorite
    item.updated_at = new Date().toISOString()
    if (item.is_favorite) favoritesCollapsed.value = false
    else historyCollapsed.value = false
  }
  function rename(id: string, title: string) {
    const item = items.value.find((item) => item.id === id)
    if (!item || !title.trim()) return
    item.title = title.trim()
    item.updated_at = new Date().toISOString()
  }
  function remove(id: string) {
    items.value = items.value.filter((item) => item.id !== id)
  }
  return {
    items,
    favorites,
    history,
    favoritesCollapsed,
    historyCollapsed,
    initializePreview,
    toggleFavorite,
    rename,
    remove,
  }
})
