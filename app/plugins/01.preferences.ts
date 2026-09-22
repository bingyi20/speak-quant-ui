import { usePreferencesStore } from '~/stores/preferences'
import { readStorage, writeStorage } from '~/lib/storage/safe-storage'
import type { Locale, ThemePreference } from '#shared/types/http'
import { isLocale, MANUAL_LOCALE_COOKIE, publicLocale } from '#shared/public-site'
import { useAuthStore } from '~/features/auth'
export default defineNuxtPlugin({
  name: 'preferences',
  dependsOn: ['i18n:plugin:route-locale-detect'],
  setup(nuxtApp) {
    const preferences = usePreferencesStore()
    const config = useRuntimeConfig()
    const allowDark = String(config.public.enableDarkTheme) === 'true'
    const themeCookie = useCookie<ThemePreference>('trade-theme', {
      default: () => 'light',
      maxAge: 31536000,
      sameSite: 'lax',
      path: '/',
    })
    const localeCookie = useCookie<Locale>(MANUAL_LOCALE_COOKIE, {
      maxAge: 31536000,
      sameSite: 'lax',
      path: '/',
    })
    const auth = useAuthStore()
    const applyLanguage = (path: string) => {
      const publicLanguage = publicLocale(path)
      const selected =
        publicLanguage ??
        (isLocale(localeCookie.value)
          ? localeCookie.value
          : (auth.user?.locale ?? preferences.locale))
      preferences.locale = selected
      nuxtApp.$i18n.locale.value = selected
    }
    applyLanguage(useRoute().path)
    addRouteMiddleware(
      'preferred-language',
      (to) => {
        if (to.path === '/' && localeCookie.value === 'zh-CN') {
          return navigateTo(
            { path: '/zh-CN', query: to.query, hash: to.hash },
            { redirectCode: 302 },
          )
        }
        applyLanguage(to.path)
      },
      { global: true },
    )
    preferences.theme =
      allowDark && ['light', 'dark', 'system'].includes(themeCookie.value)
        ? themeCookie.value
        : 'light'
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
        () => preferences.sidebarCollapsed,
        (value) => writeStorage(localStorage, 'trade-sidebar', value),
      )
      if (import.meta.hot) import.meta.hot.dispose(() => media.removeEventListener('change', apply))
    }
    useHead({
      htmlAttrs: {
        lang: () => nuxtApp.$i18n.locale.value,
        'data-theme': () => preferences.resolvedTheme,
        class: () => (preferences.resolvedTheme === 'dark' ? 'dark' : ''),
      },
      script: [
        { src: '/theme-init.js', 'data-dark-enabled': String(allowDark), tagPosition: 'head' },
      ],
    })
  },
})
