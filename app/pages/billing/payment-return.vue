<script setup lang="ts">
import { useBillingStore } from '~/features/billing/stores/billing'
import { useAuthStore } from '~/features/auth'
import { isOrderTerminal } from '~/features/billing/payment'
import { clearPaymentReturn, readPaymentReturn } from '~/features/billing/return-context'
definePageMeta({ layout: false })
defineI18nRoute(false)
const app = useNuxtApp()
const route = useRoute()
const router = useRouter()
const billing = useBillingStore()
const auth = useAuthStore()
const { t } = useI18n()
const localePath = useLocalePath()
const controller = new AbortController()
usePageSeo(
  () => t('billing.returnTitle'),
  () => t('common.loading'),
  false,
)
onBeforeUnmount(() => controller.abort())
function pause() {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer)
      controller.signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, 1000)
    controller.signal.addEventListener('abort', done, { once: true })
  })
}
onMounted(async () => {
  // Compatibility with previously-created Checkout sessions. Returning is not cancellation.
  if (route.query.cancelled === 'true') {
    await router.replace(localePath('/pricing'))
    return
  }
  const orderId = typeof route.query.order_id === 'string' ? route.query.order_id : ''
  if (!orderId) {
    await router.replace(localePath('/pricing'))
    return
  }
  if (auth.status === 'unknown' || auth.status === 'restoring') await app.$restoreAuth()
  if (controller.signal.aborted) return
  if (!auth.isAuthenticated || !auth.user) {
    await router.replace({ path: '/login', query: { returnTo: route.fullPath } })
    return
  }
  const owner = auth.user.id
  let context = null
  try {
    context = readPaymentReturn(sessionStorage, owner, orderId)
  } catch {
    /* optional storage */
  }
  // Reconcile only while returning from Stripe, never poll the original pricing/workspace page.
  for (let attempt = 0; attempt < 15 && !controller.signal.aborted; attempt++) {
    await billing.refreshOrder(orderId)
    if (controller.signal.aborted || auth.user?.id !== owner) return
    const order = billing.activeOrder?.id === orderId ? billing.activeOrder : null
    if (!order || isOrderTerminal(order)) break
    await pause()
  }
  await billing.refreshEntitlements(true)
  if (controller.signal.aborted || auth.user?.id !== owner) return
  try {
    clearPaymentReturn(sessionStorage, owner)
  } catch {
    /* optional storage */
  }
  // A fresh document reloads entitlements and opens the source without any payment UI.
  window.location.replace(context?.path ?? localePath('/pricing'))
})
</script>
<template>
  <div
    class="payment-return-loading"
    role="status"
  >
    {{ $t('common.loading') }}
  </div>
</template>
<style scoped>
.payment-return-loading {
  display: grid;
  min-height: 100dvh;
  place-items: center;
  color: var(--color-text-secondary);
  font-size: 14px;
}
</style>
