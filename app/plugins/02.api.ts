import { disableGoogleAutoSelect } from '~/features/auth/google'
import { createHttpClient } from '~/lib/http/client'
import { createAuthSession } from '~/lib/http/session'
import { createAuthApi } from '~/features/auth/api'
import { useAuthStore } from '~/features/auth'
import type { User } from '~/features/auth'
import type { AuthResponse } from '~/features/auth/types'
import { usePreferencesStore } from '~/stores/preferences'
export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const auth = useAuthStore()
  const router = useRouter()
  const preferences = usePreferencesStore()
  const localePreference = useCookie('trade-locale')
  const enabled = String(config.public.apiEnabled) === 'true'
  const baseURL = import.meta.server ? config.apiBase : config.public.apiBase
  const origin = import.meta.client ? location.origin : config.public.siteUrl
  const locale = () => preferences.locale
  const publicHttp = createHttpClient({ baseURL, origin, locale })
  const authApi = createAuthApi(publicHttp)
  const session = createAuthSession<User>({
    refresh: authApi.refresh,
    onUser: (user) => {
      auth.setUser(user)
      if (!localePreference.value) preferences.locale = user.locale
    },
    onClear: () => {
      const previousUser = auth.user
      auth.clear()
      http.cancelAll()
      if (import.meta.client) {
        clearNuxtData((key) => key.startsWith('private:'))
        if (
          previousUser &&
          /^\/(new-task|conversations)(?:\/|$)/.test(router.currentRoute.value.path)
        ) {
          void nuxtApp.runWithContext(() =>
            navigateTo({ path: '/login', query: { returnTo: router.currentRoute.value.fullPath } }),
          )
        }
      }
    },
  })
  const http = createHttpClient({ baseURL, origin, locale, session })
  async function restoreAuth() {
    if (!enabled || import.meta.server) return
    auth.status = 'restoring'
    try {
      await session.restore()
      if (!session.getToken()) auth.clear()
    } catch {
      if (auth.status === 'restoring') auth.status = 'unavailable'
    }
  }
  function acceptAuth(result: AuthResponse) {
    if (import.meta.server) throw new Error('Browser authentication cannot be accepted during SSR')
    http.cancelAll()
    clearNuxtData((key) => key.startsWith('private:'))
    session.accept(result)
  }
  async function logout() {
    // Clear browser state only after backend revocation succeeds; failures remain retryable.
    if (enabled && auth.isAuthenticated) await createAuthApi(http).logout()
    session.clear()
    if (import.meta.client) disableGoogleAutoSelect()
  }
  if (import.meta.client) {
    if (enabled) void restoreAuth()
    else auth.clear()
  }
  return { provide: { http, restoreAuth, logout, acceptAuth } }
})
