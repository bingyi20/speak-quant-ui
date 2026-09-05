import { usePreferencesStore } from '~/stores/preferences'
import { readStorage, writeStorage } from '~/lib/storage/safe-storage'
import type { Locale, ThemePreference } from '#shared/types/http'
export default defineNuxtPlugin(async (nuxtApp) => {
  const preferences = usePreferencesStore()
  const config = useRuntimeConfig()
  const allowDark = String(config.public.enableDarkTheme) === 'true'
  const themeCookie = useCookie<ThemePreference>('trade-theme', {
    default: () => 'light',
    maxAge: 31536000,
    sameSite: 'lax',
    path: '/',
  })
  const localeCookie = useCookie<Locale>('trade-locale', {
    maxAge: 31536000,
    sameSite: 'lax',
    path: '/',
  })
  const validLocale = (value: unknown): value is Locale => value === 'zh-CN' || value === 'en-US'
  const requestLanguage = import.meta.server
    ? useRequestHeaders(['accept-language'])['accept-language']
    : navigator.language
  preferences.locale = validLocale(localeCookie.value)
    ? localeCookie.value
    : requestLanguage?.startsWith('en')
      ? 'en-US'
      : 'zh-CN'
  preferences.theme =
    allowDark && ['light', 'dark', 'system'].includes(themeCookie.value)
      ? themeCookie.value
      : 'light'
  if (nuxtApp.$i18n.locale.value !== preferences.locale)
    await nuxtApp.$i18n.setLocale(preferences.locale)
  preferences.resolvedTheme = preferences.theme === 'dark' ? 'dark' : 'light'
  if (import.meta.client) {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      preferences.resolvedTheme =
        allowDark &&
        (preferences.theme === 'dark' || (preferences.theme === 'system' && media.matches))
          ? 'dark'
          : 'light'
      document.documentElement.dataset.theme = preferences.resolvedTheme
      document.documentElement.classList.toggle('dark', preferences.resolvedTheme === 'dark')
    }
    apply()
    media.addEventListener('change', apply)
    preferences.sidebarCollapsed =
      readStorage(localStorage, 'trade-sidebar', (v): v is boolean => typeof v === 'boolean') ??
      false
    watch(
      () => preferences.theme,
      (value) => {
        themeCookie.value = value
        apply()
      },
    )
    watch(
      () => preferences.locale,
      async (value) => {
        localeCookie.value = value
        await nuxtApp.$i18n.setLocale(value)
      },
    )
    watch(
      () => preferences.sidebarCollapsed,
      (value) => writeStorage(localStorage, 'trade-sidebar', value),
    )
    if (import.meta.hot) import.meta.hot.dispose(() => media.removeEventListener('change', apply))
  }
  useHead({
    htmlAttrs: {
      lang: () => preferences.locale,
      'data-theme': () => preferences.resolvedTheme,
      class: () => (preferences.resolvedTheme === 'dark' ? 'dark' : ''),
    },
    script: [
      { src: '/theme-init.js', 'data-dark-enabled': String(allowDark), tagPosition: 'head' },
    ],
  })
})
