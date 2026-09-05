import { useAuthStore } from '~/features/auth'
import { safeReturnPath } from '~/lib/storage/safe-storage'
export default defineNuxtRouteMiddleware(async (to) => {
  // Scaffold pages intentionally remain accessible with no backend.
  if (import.meta.server || String(useRuntimeConfig().public.apiEnabled) !== 'true') return
  const auth = useAuthStore()
  if (auth.status === 'unknown' || auth.status === 'restoring') await useNuxtApp().$restoreAuth()
  if (!auth.isAuthenticated)
    return navigateTo({ path: '/login', query: { returnTo: safeReturnPath(to.fullPath) } })
})
