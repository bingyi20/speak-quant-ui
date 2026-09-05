import { usePreferencesStore } from '~/stores/preferences'
import type { ThemePreference } from '#shared/types/http'
export function useTheme() {
  const preferences = usePreferencesStore()
  const allowDark = String(useRuntimeConfig().public.enableDarkTheme) === 'true'
  return {
    preference: computed(() => preferences.theme),
    resolvedTheme: computed(() => preferences.resolvedTheme),
    allowDark,
    setTheme(value: ThemePreference) {
      preferences.theme = allowDark ? value : 'light'
    },
  }
}
