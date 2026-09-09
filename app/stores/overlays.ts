import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PricingTab } from '~/features/billing'
export const useOverlaysStore = defineStore('overlays', () => {
  const active = ref<'settings' | null>(null)
  const pricingTab = ref<PricingTab | null>(null)
  return {
    active,
    pricingTab,
    openPricing: (tab: PricingTab = 'plans') => {
      pricingTab.value = tab
    },
    closePricing: () => {
      pricingTab.value = null
    },
    openSettings: () => {
      active.value = 'settings'
    },
    close: () => {
      active.value = null
      pricingTab.value = null
    },
  }
})
