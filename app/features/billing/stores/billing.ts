import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAuthStore } from '~/features/auth'
import { safeReturnPath } from '~/lib/storage/safe-storage'
import { savePaymentReturn } from '../return-context'
import { ApiError } from '~/lib/http/error'
import { createBillingApi } from '../api'
import { isOrderTerminal, paymentUrl, providerDate } from '../payment'
import { validateTopUpAmount } from '../catalog'
import type {
  BillingAccount,
  BillingOrder,
  BillingQuote,
  CreditBalance,
  OrderPage,
  PaymentAction,
  PlanCatalog,
  PlanCode,
  Subscription,
} from '../types'

type OperationKind = 'order' | 'quote' | 'subscription' | 'portal'
interface BillingOperation {
  path: string
  body?: Record<string, string>
  key: string
  kind: OperationKind
}
const allowedOperations: Record<string, OperationKind> = {
  '/billing/checkouts/subscription': 'order',
  '/billing/checkouts/topup': 'order',
  '/billing/subscription/upgrade': 'order',
  '/billing/topup-quotes': 'quote',
  '/billing/subscription/upgrade-preview': 'quote',
  '/billing/subscription/cancel': 'subscription',
  '/billing/subscription/resume': 'subscription',
  '/billing/portal-sessions': 'portal',
}
function isOperation(value: unknown): value is BillingOperation {
  if (!value || typeof value !== 'object') return false
  const op = value as BillingOperation
  return (
    allowedOperations[op.path] === op.kind &&
    typeof op.key === 'string' &&
    /^[\x21-\x7e]{1,255}$/.test(op.key) &&
    (op.body === undefined ||
      (typeof op.body === 'object' &&
        op.body !== null &&
        Object.values(op.body).every((v) => typeof v === 'string')))
  )
}

export const useBillingStore = defineStore('billing', () => {
  const app = useNuxtApp()
  const auth = useAuthStore()
  const router = useRouter()
  const api = createBillingApi(app.$http)
  const catalog = ref<PlanCatalog | null>(null)
  const account = ref<BillingAccount | null>(null)
  const balance = ref<CreditBalance | null>(null)
  const orders = ref<OrderPage | null>(null)
  const activeOrder = ref<BillingOrder | null>(null)
  const quote = ref<BillingQuote | null>(null)
  const quotingTopUp = ref(false)
  const topUpQuoteError = ref<string | null>(null)
  const loading = ref(false)
  const catalogLoading = ref(false)
  const catalogError = ref<string | null>(null)
  const actionError = ref<string | null>(null)
  const entitlementError = ref<string | null>(null)
  const orderError = ref<string | null>(null)
  const error = computed(() => actionError.value ?? entitlementError.value ?? orderError.value)
  const busy = ref(false)
  const operation = ref<BillingOperation | null>(null)
  const retryAvailable = computed(() => operation.value !== null && !busy.value)
  let owner: string | null = null
  let generation = 0
  let controller = new AbortController()
  let refreshPromise: Promise<void> | null = null
  let initializePromise: Promise<void> | null = null
  let orderPromise: Promise<void> | null = null
  let requestedOrderId: string | null = null
  let catalogPromise: Promise<void> | null = null
  let topUpQuoteSequence = 0
  let topUpQuoteController: AbortController | null = null
  const t = (key: string) => app.$i18n.t(`billing.errors.${key}`)
  const storageKey = () => (owner ? `speakquant-billing:${owner}` : null)

  function message(value: unknown) {
    const e = value instanceof ApiError ? value : null
    const keys: Record<string, string> = {
      BILLING_NOT_CONFIGURED: 'notConfigured',
      BILLING_RECONCILIATION_PENDING: 'reconciliation',
      TOPUP_NOT_ELIGIBLE: 'notEligible',
      SUBSCRIPTION_ALREADY_EXISTS: 'alreadySubscribed',
      SUBSCRIPTION_DOWNGRADE_NOT_ALLOWED: 'notEligible',
      SUBSCRIPTION_UPGRADE_IN_PROGRESS: 'inProgress',
      QUOTE_STALE: 'quoteStale',
      BILLING_PAYMENT_MISMATCH: 'paymentMismatch',
      CREDITS_RISK_BLOCKED: 'restricted',
    }
    return t(
      e?.key && keys[e.key]
        ? keys[e.key]!
        : !e || ['network', 'timeout'].includes(e.kind)
          ? 'network'
          : 'generic',
    )
  }
  function persist() {
    const key = storageKey()
    if (!import.meta.client || !key) return
    try {
      if (operation.value || (activeOrder.value && !isOrderTerminal(activeOrder.value))) {
        localStorage.setItem(
          key,
          JSON.stringify({
            operation: operation.value,
            orderId:
              activeOrder.value && !isOrderTerminal(activeOrder.value)
                ? activeOrder.value.id
                : null,
          }),
        )
      } else localStorage.removeItem(key)
    } catch {
      /* State remains recoverable through authenticated order history. */
    }
  }
  function reset() {
    generation++
    controller.abort()
    controller = new AbortController()
    owner = null
    account.value = null
    balance.value = null
    orders.value = null
    activeOrder.value = null
    clearQuote()
    operation.value = null
    actionError.value = null
    entitlementError.value = null
    orderError.value = null
    requestedOrderId = null
    loading.value = false
    busy.value = false
    refreshPromise = initializePromise = orderPromise = null
  }
  function ensureOwner() {
    if (!import.meta.client || !auth.isAuthenticated || !auth.user) return false
    if (owner !== auth.user.id) {
      reset()
      owner = auth.user.id
    }
    return true
  }
  async function requireAuth() {
    if (ensureOwner()) return true
    if (import.meta.client) {
      await app.runWithContext(() =>
        navigateTo({
          path: '/login',
          query: { returnTo: useRouter().currentRoute.value.fullPath },
        }),
      )
    }
    return false
  }
  async function loadCatalog() {
    if (catalog.value) return
    if (catalogPromise) return catalogPromise
    catalogLoading.value = true
    catalogError.value = null
    catalogPromise = (async () => {
      try {
        catalog.value = await api.plans()
      } catch (e) {
        catalogError.value = message(e)
      } finally {
        catalogLoading.value = false
        catalogPromise = null
      }
    })()
    return catalogPromise
  }
  async function refreshEntitlements(afterMutation = false): Promise<void> {
    if (!ensureOwner()) return
    if (refreshPromise) {
      if (!afterMutation) return refreshPromise
      const scope = generation
      await refreshPromise
      if (scope !== generation) return
      return refreshEntitlements()
    }
    const scope = generation
    loading.value = true
    refreshPromise = (async () => {
      const results = await Promise.allSettled([
        api.account(controller.signal),
        api.balance(controller.signal),
      ])
      if (scope !== generation) return
      const [a, b] = results
      if (a.status === 'fulfilled') account.value = a.value
      if (b.status === 'fulfilled') balance.value = b.value
      if (a.status === 'rejected' || b.status === 'rejected') {
        const cause = a.status === 'rejected' ? a.reason : b.status === 'rejected' ? b.reason : null
        if (!(cause instanceof ApiError && cause.kind === 'cancelled'))
          entitlementError.value = message(cause)
      } else entitlementError.value = null
    })().finally(() => {
      if (scope === generation) {
        loading.value = false
        refreshPromise = null
      }
    })
    return refreshPromise
  }
  async function refreshOrders() {
    if (!ensureOwner()) return
    const scope = generation
    try {
      const result = await api.orders(controller.signal)
      if (scope === generation) orders.value = result
    } catch {
      /* An existing order can still be queried independently. */
    }
  }
  async function acceptOrder(value: BillingOrder) {
    activeOrder.value = value
    persist()
    if (isOrderTerminal(value)) {
      await Promise.all([refreshEntitlements(true), refreshOrders()])
    }
  }
  async function refreshOrder(id?: string) {
    if (!ensureOwner()) return
    if (orderPromise) {
      if (!id || id === requestedOrderId) return orderPromise
      const scope = generation
      await orderPromise
      if (scope !== generation) return
      return refreshOrder(id)
    }
    const orderId = id ?? activeOrder.value?.id
    if (!orderId) {
      await refreshEntitlements()
      return
    }
    const scope = generation
    requestedOrderId = orderId
    orderPromise = (async () => {
      try {
        const result = await api.order(orderId, controller.signal)
        if (scope !== generation) return
        orderError.value = null
        await acceptOrder(result)
      } catch (e) {
        if (scope !== generation) return
        if (e instanceof ApiError && e.status === 404) {
          // pending_order_id can refer to a renewal-setting operation, not an order.
          if (account.value?.pending_order_id !== orderId) orderError.value = message(e)
          if (activeOrder.value?.id === orderId) activeOrder.value = null
          persist()
          await refreshEntitlements()
        } else {
          orderError.value = message(e)
        }
      }
    })().finally(() => {
      if (scope === generation) {
        orderPromise = null
        requestedOrderId = null
      }
    })
    return orderPromise
  }
  async function initialize() {
    if (!ensureOwner()) return
    if (initializePromise) return initializePromise
    const scope = generation
    initializePromise = (async () => {
      let savedOrderId: string | null = null
      try {
        const raw = localStorage.getItem(storageKey()!)
        const saved = raw ? JSON.parse(raw) : null
        if (isOperation(saved?.operation)) operation.value = saved.operation
        if (typeof saved?.orderId === 'string') savedOrderId = saved.orderId
      } catch {
        /* Invalid browser persistence is ignored. */
      }
      await Promise.all([refreshEntitlements(), refreshOrders()])
      if (scope !== generation) return
      const candidate =
        savedOrderId ??
        account.value?.pending_order_id ??
        orders.value?.items.find((item) => !isOrderTerminal(item))?.id
      if (candidate) {
        await refreshOrder(candidate)
      }
      if (operation.value) actionError.value = t('reconciliation')
    })().finally(() => {
      if (scope === generation) initializePromise = null
    })
    return initializePromise
  }
  function redirect(action: PaymentAction | null, order?: BillingOrder) {
    const url = paymentUrl(action)
    if (!url || !import.meta.client) return false
    if (order && owner) {
      try {
        savePaymentReturn(sessionStorage, {
          owner,
          orderId: order.id,
          path: safeReturnPath(router.currentRoute.value.fullPath, '/pricing'),
        })
      } catch {
        /* Payment can still return to pricing when browser storage is unavailable. */
      }
    }
    window.location.assign(url)
    return true
  }
  function startOperation(path: string, kind: OperationKind, body?: Record<string, string>) {
    clearQuote()
    operation.value = { path, kind, body, key: crypto.randomUUID() }
    persist()
  }
  async function execute() {
    const op = operation.value
    if (!op || busy.value || !ensureOwner()) {
      return
    }
    const scope = generation
    busy.value = true
    actionError.value = null
    try {
      // Billing keys have no client-side 24-hour expiry. Persist the exact request before transport.
      const result = await app.$http.requestJson<
        | BillingOrder
        | BillingQuote
        | { subscription: Subscription }
        | { payment_action: PaymentAction }
      >(op.path, {
        method: 'POST',
        body: op.body,
        idempotencyKey: op.key,
        signal: controller.signal,
      })
      if (scope !== generation) {
        return
      }
      operation.value = null
      if (op.kind === 'order') {
        quote.value = null
        const order = result as BillingOrder
        await acceptOrder(order)
        if (scope !== generation) {
          return
        }
        if (!isOrderTerminal(order) && redirect(order.payment_action, order)) return true
        await refreshEntitlements()
      } else if (op.kind === 'quote') {
        quote.value = result as BillingQuote
      } else if (op.kind === 'portal') {
        redirect((result as { payment_action: PaymentAction }).payment_action)
      } else {
        await refreshEntitlements(true)
      }
      persist()
    } catch (e) {
      if (scope !== generation) return
      actionError.value = message(e)
      const uncertain =
        !(e instanceof ApiError) ||
        ['network', 'timeout'].includes(e.kind) ||
        e.status === 503 ||
        e.key === 'BILLING_RECONCILIATION_PENDING'
      if (!uncertain) operation.value = null
      if (e instanceof ApiError && e.key === 'QUOTE_STALE') clearQuote()
      persist()
      await Promise.all([refreshEntitlements(), refreshOrders()])
    } finally {
      if (scope === generation) busy.value = false
    }
  }
  function clearQuote() {
    topUpQuoteSequence++
    topUpQuoteController?.abort()
    topUpQuoteController = null
    quotingTopUp.value = false
    topUpQuoteError.value = null
    quote.value = null
    // Never discard an uncertain mutation when closing the dialog or editing a quote.
  }
  async function purchasePlan(code: PlanCode) {
    if (!(await requireAuth()) || busy.value) return
    if (!account.value) {
      await refreshEntitlements()
      if (!account.value) return
    }
    if (
      account.value.subscription &&
      activeOrder.value?.kind === 'upgrade' &&
      activeOrder.value.plan_code === code &&
      !isOrderTerminal(activeOrder.value) &&
      paymentUrl(activeOrder.value.payment_action)
    ) {
      return resumePayment()
    }
    if (operation.value || (account.value.subscription && account.value.pending_order_id)) {
      actionError.value = t('inProgress')
      return
    }
    const subscription = account.value.subscription
    if (subscription) {
      const current = catalog.value?.plans.find((p) => p.code === subscription.plan_code)
      const target = catalog.value?.plans.find((p) => p.code === code)
      if (!account.value.topup_eligible || !current || !target || target.rank <= current.rank) {
        actionError.value = t('notEligible')
        return
      }
      startOperation('/billing/subscription/upgrade-preview', 'quote', { plan_code: code })
      return execute()
    } else {
      startOperation('/billing/checkouts/subscription', 'order', { plan_code: code })
      return execute()
    }
  }
  async function quoteTopUp(amount: string) {
    clearQuote()
    if (
      !ensureOwner() ||
      busy.value ||
      operation.value ||
      !account.value?.topup_eligible ||
      account.value.pending_order_id ||
      !catalog.value
    )
      return
    const normalized = validateTopUpAmount(amount)
    if (!normalized) return
    const scope = generation
    const user = owner
    const sequence = topUpQuoteSequence
    const request = new AbortController()
    topUpQuoteController = request
    quotingTopUp.value = true
    actionError.value = null
    const current = () =>
      !request.signal.aborted &&
      sequence === topUpQuoteSequence &&
      scope === generation &&
      auth.isAuthenticated &&
      auth.user?.id === user
    try {
      // A superseded quote moves no money; only the latest visible amount may receive it.
      const result = await api.topUpQuote(normalized, crypto.randomUUID(), request.signal)
      if (!current()) return
      if (
        result.kind !== 'topup' ||
        result.currency !== 'USD' ||
        result.plan_code !== account.value?.subscription?.plan_code ||
        result.plan_version !== account.value?.subscription?.plan_version ||
        typeof result.quote_id !== 'string' ||
        !result.quote_id ||
        !/^\d+$/.test(result.credits) ||
        !Number.isFinite(providerDate(result.expires_at)) ||
        providerDate(result.expires_at) <= Date.now() ||
        validateTopUpAmount(result.amount_usd) !== normalized
      )
        throw new ApiError('Mismatched top-up quote', { kind: 'protocol' })
      if (account.value?.topup_eligible && !account.value.pending_order_id) quote.value = result
    } catch (e) {
      if (current()) topUpQuoteError.value = message(e)
    } finally {
      if (current()) {
        quotingTopUp.value = false
        topUpQuoteController = null
      }
    }
  }
  async function payQuote(value: BillingQuote) {
    if (!(await requireAuth()) || busy.value || operation.value) return
    if (
      !Number.isFinite(providerDate(value.expires_at)) ||
      providerDate(value.expires_at) <= Date.now() ||
      value.quote_id !== quote.value?.quote_id
    ) {
      clearQuote()
      actionError.value = t('quoteStale')
      return
    }
    startOperation(
      value.kind === 'topup' ? '/billing/checkouts/topup' : '/billing/subscription/upgrade',
      'order',
      { quote_id: value.quote_id },
    )
    return execute()
  }
  async function retryOperation() {
    if (!ensureOwner() || busy.value || !operation.value) return
    return execute()
  }
  async function resumePayment() {
    if (!ensureOwner() || !activeOrder.value || busy.value) return
    actionError.value = null
    await refreshOrder()
    if (orderError.value) {
      return
    }
    if (!activeOrder.value || isOrderTerminal(activeOrder.value)) {
      return
    }
    return redirect(activeOrder.value.payment_action, activeOrder.value)
  }
  async function openPortal() {
    if (!(await requireAuth()) || busy.value || operation.value) return
    startOperation('/billing/portal-sessions', 'portal')
    await execute()
  }
  async function changeRenewal(resume: boolean) {
    if (!ensureOwner() || busy.value || operation.value || account.value?.pending_order_id) return
    startOperation(`/billing/subscription/${resume ? 'resume' : 'cancel'}`, 'subscription')
    await execute()
  }
  return {
    catalog,
    account,
    balance,
    orders,
    activeOrder,
    quote,
    quotingTopUp,
    topUpQuoteError,
    loading,
    catalogLoading,
    catalogError,
    error,
    busy,
    retryAvailable,
    loadCatalog,
    refreshEntitlements,
    refreshOrders,
    initialize,
    refreshOrder,
    purchasePlan,
    quoteTopUp,
    payQuote,
    clearQuote,
    retryOperation,
    resumePayment,
    openPortal,
    cancelRenewal: () => changeRenewal(false),
    resumeRenewal: () => changeRenewal(true),
    reset,
  }
})
