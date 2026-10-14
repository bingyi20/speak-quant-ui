import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useAuthStore } from '~/features/auth'
import { createBillingApi } from '../api'
import type { CreditLedgerPage } from '../types'

export function useCreditHistory() {
  const auth = useAuthStore()
  const { t } = useI18n()
  const api = createBillingApi(useNuxtApp().$http)
  const owner = computed(() => (auth.isAuthenticated ? (auth.user?.id ?? null) : null))
  const ledger = shallowRef<CreditLedgerPage | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let requestedPage = 1
  let ledgerSequence = 0
  let ledgerController: AbortController | null = null

  async function loadPage(page = requestedPage) {
    const user = owner.value
    if (!user || !Number.isInteger(page) || page < 1) return
    const sequence = ++ledgerSequence
    ledgerController?.abort()
    const controller = new AbortController()
    ledgerController = controller
    requestedPage = page
    loading.value = true
    error.value = null
    try {
      const result = await api.ledger(page, 20, controller.signal)
      if (!controller.signal.aborted && sequence === ledgerSequence && owner.value === user) {
        ledger.value = result
      }
    } catch {
      if (!controller.signal.aborted && sequence === ledgerSequence && owner.value === user) {
        error.value = t('settings.usageLoadError')
      }
    } finally {
      if (sequence === ledgerSequence) loading.value = false
    }
  }

  function reset() {
    ledgerSequence++
    ledgerController?.abort()
    ledgerController = null
    ledger.value = null
    loading.value = false
    error.value = null
    requestedPage = 1
  }

  watch(
    owner,
    (user) => {
      reset()
      if (user) void loadPage(1)
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(reset)

  return {
    ledger,
    loading,
    error,
    loadPage,
  }
}
