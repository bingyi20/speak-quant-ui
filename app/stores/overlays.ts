import { defineStore } from 'pinia'
import { ref } from 'vue'
export const useOverlaysStore = defineStore('overlays', () => {
  const active = ref<'settings' | null>(null)
  return {
    active,
    openSettings: () => {
      active.value = 'settings'
    },
    close: () => {
      active.value = null
    },
  }
})
