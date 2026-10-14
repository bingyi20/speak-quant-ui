import { useAuthStore } from '~/features/auth'
import { useBillingStore } from '~/features/billing/stores/billing'
import { clearPaymentReturn } from '~/features/billing/return-context'

export default defineNuxtPlugin(() => {
  const auth = useAuthStore()
  const billing = useBillingStore()
  const router = useRouter()
  watch(
    () => (auth.isAuthenticated ? auth.user?.id : null),
    (id) => {
      billing.reset()
      if (id) void billing.initialize()
    },
    { immediate: true },
  )
  let ready = false
  function clearCancelledReturn() {
    if (!ready) return
    const route = router.currentRoute.value
    if (
      !/^\/(?:zh-CN\/)?pricing$/.test(route.path) ||
      !(route.query.payment_cancelled === 'true' || route.query.cancelled === 'true')
    )
      return
    const query = { ...route.query }
    delete query.payment_cancelled
    delete query.cancelled
    delete query.order_id
    if (auth.user) {
      try {
        clearPaymentReturn(sessionStorage, auth.user.id)
      } catch {
        /* optional storage */
      }
    }
    void router.replace({ path: route.path, query, hash: route.hash })
    void billing.refreshEntitlements()
  }
  watch(() => router.currentRoute.value.fullPath, clearCancelledReturn)
  onNuxtReady(() => {
    ready = true
    clearCancelledReturn()
  })
  const refresh = () => {
    if (!document.hidden && auth.isAuthenticated) void billing.refreshEntitlements()
  }
  window.addEventListener('focus', refresh)
  document.addEventListener('visibilitychange', refresh)
  if (import.meta.hot)
    import.meta.hot.dispose(() => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      billing.reset()
    })
})
