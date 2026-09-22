import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Locale, ThemePreference } from '#shared/types/http'
export const usePreferencesStore = defineStore('preferences', () => {
  const theme = ref<ThemePreference>('light')
  const resolvedTheme = ref<'light' | 'dark'>('light')
  const locale = ref<Locale>('en-US')
  const sidebarCollapsed = ref(false)
  return { theme, resolvedTheme, locale, sidebarCollapsed }
})
