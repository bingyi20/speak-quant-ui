import { MANUAL_LOCALE_COOKIE, publicLocale } from '#shared/public-site'
import type { Locale } from '#shared/types/http'
import { usePreferencesStore } from '~/stores/preferences'

export function useLanguage() {
  const preferences = usePreferencesStore()
  const route = useRoute()
  const { locale, setLocale } = useI18n()
  const cookie = useCookie<Locale>(MANUAL_LOCALE_COOKIE, {
    maxAge: 31536000,
    sameSite: 'lax',
    path: '/',
  })
  const language = computed<Locale>({
    get: () => preferences.locale,
    set: (value) => {
      cookie.value = value
      preferences.locale = value
      if (publicLocale(route.path)) void setLocale(value)
      else locale.value = value
    },
  })
  return { language }
}
