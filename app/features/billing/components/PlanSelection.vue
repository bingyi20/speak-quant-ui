<script setup lang="ts">
import { useAuthStore } from '~/features/auth'
import { planName } from '../catalog'
import { useBillingAction } from '../composables/useBillingAction'
import { canResumeOrderPayment, isOrderSettled } from '../payment'
import { useBillingStore } from '../stores/billing'
import type { BillingQuote, Plan, PlanCatalog, PlanCode, Subscription } from '../types'
import PlanCard from './PlanCard.vue'
import UpgradeConfirmationModal from './UpgradeConfirmationModal.vue'

const props = defineProps<{
  catalog: PlanCatalog
  subscription: Subscription | null | undefined
  controlsDisabled: boolean
  canUpgrade: boolean
  eligibilityPending?: boolean
}>()
const emit = defineEmits<{ confirmationChange: [open: boolean] }>()
const { t } = useI18n()
const auth = useAuthStore()
const billing = useBillingStore()
const { active, run } = useBillingAction<
  PlanCode | 'upgrade-confirm' | 'upgrade-other' | 'upgrade-retry' | 'upgrade-refresh'
>()
const confirmationOpen = ref(false)
const confirmationQuote = shallowRef<BillingQuote | null>(null)
const confirmationTrigger = shallowRef<HTMLElement | null>(null)
const planGrid = shallowRef<HTMLElement | null>(null)
const localError = ref<string | null>(null)
let mounted = true
const confirmationPending = computed(() => {
  if (active.value === 'upgrade-confirm') return 'pay'
  if (active.value === 'upgrade-other') return 'other'
  if (active.value === 'upgrade-retry') return 'retry'
  if (active.value === 'upgrade-refresh') return 'refresh'
  return null
})
const confirmationError = computed(() => localError.value || billing.error)
const canRefreshQuote = computed(
  () => !!confirmationError.value && !billing.quote && !billing.retryAvailable && props.canUpgrade,
)
watch(confirmationOpen, (open) => {
  emit('confirmationChange', open)
  if (!open) billing.clearQuote()
})
watch(
  () => billing.quote,
  (quote) => {
    if (!mounted || !auth.isAuthenticated || quote?.kind !== 'upgrade' || !props.subscription)
      return
    confirmationQuote.value = quote
    if (!confirmationTrigger.value?.isConnected)
      confirmationTrigger.value =
        planGrid.value?.querySelector<HTMLButtonElement>(
          `[data-plan-code="${quote.plan_code}"] button`,
        ) ?? null
    localError.value = null
    confirmationOpen.value = true
  },
)
watch(
  () => auth.user?.id,
  () => {
    confirmationOpen.value = false
    confirmationQuote.value = null
    localError.value = null
  },
)
onBeforeUnmount(() => {
  mounted = false
})
const plans = computed(() => [...props.catalog.plans].sort((a, b) => a.rank - b.rank))
const currentPlan = computed(() =>
  plans.value.find((plan) => plan.code === props.subscription?.plan_code),
)
function canResumePlan(plan: Plan) {
  const order = billing.activeOrder
  return (
    !!props.subscription &&
    order?.kind === 'upgrade' &&
    order.plan_code === plan.code &&
    canResumeOrderPayment(order)
  )
}
function disabledPlan(plan: Plan) {
  return (
    props.controlsDisabled ||
    active.value !== null ||
    (!!props.subscription &&
      !canResumePlan(plan) &&
      (!props.canUpgrade || !currentPlan.value || plan.rank <= currentPlan.value.rank))
  )
}
function planButtonLabel(plan: Plan) {
  if (canResumePlan(plan)) return t('billing.continuePayment')
  if (props.subscription && currentPlan.value && plan.rank < currentPlan.value.rank)
    return t('billing.downgradeUnavailable')
  if (props.subscription && props.canUpgrade)
    return t('billing.upgradePlan', { plan: planName(plan.code) })
  return t('billing.choosePlan', { plan: planName(plan.code) })
}
function selectPlan(code: PlanCode) {
  confirmationTrigger.value = document.activeElement as HTMLElement | null
  return run(code, () => billing.purchasePlan(code))
}
function payNow() {
  return submitUpgrade('upgrade-confirm', (quote) => billing.payQuote(quote, 'saved_method'))
}
function payWithOtherMethod() {
  return submitUpgrade('upgrade-other', (quote) => billing.payQuote(quote, 'stripe_page'))
}
function retryUpgrade() {
  return submitUpgrade('upgrade-retry', () => billing.retryOperation())
}
async function submitUpgrade(
  action: 'upgrade-confirm' | 'upgrade-other' | 'upgrade-retry',
  request: (quote: BillingQuote) => Promise<unknown>,
) {
  const quote = confirmationQuote.value
  if (
    !quote ||
    active.value !== null ||
    (action !== 'upgrade-retry' && (props.controlsDisabled || !props.canUpgrade))
  )
    return
  const user = auth.user?.id
  localError.value = null
  return run(action, async () => {
    const previousOrder = billing.activeOrder
    const redirected = (await request(quote)) === true
    if (!mounted || user !== auth.user?.id || confirmationQuote.value !== quote) return redirected
    if (redirected) return true
    const order = billing.activeOrder
    if (
      order !== previousOrder &&
      order?.kind === 'upgrade' &&
      order.plan_code === quote.plan_code &&
      isOrderSettled(order)
    ) {
      // An entitlement refresh failure does not undo a confirmed payment.
      confirmationOpen.value = false
    } else if (!billing.error) {
      localError.value = t('billing.errors.reconciliation')
    }
    // Keep the quote visible on errors; never create a second operation to recover a payment.
  })
}
function refreshQuote() {
  if (!confirmationQuote.value || !canRefreshQuote.value || active.value !== null) return
  localError.value = null
  return run('upgrade-refresh', () => billing.purchasePlan(confirmationQuote.value!.plan_code))
}
</script>

<template>
  <UpgradeConfirmationModal
    v-model:open="confirmationOpen"
    :quote="confirmationQuote"
    :return-focus="confirmationTrigger"
    :pending="confirmationPending"
    :disabled="controlsDisabled || !canUpgrade"
    :error="confirmationError"
    :can-retry="billing.retryAvailable && !billing.retryBlocked"
    :can-refresh-quote="canRefreshQuote"
    @confirm="payNow"
    @retry="retryUpgrade"
    @other-payment="payWithOtherMethod"
    @refresh-quote="refreshQuote"
  />
  <div
    ref="planGrid"
    class="pricing-plan-grid"
  >
    <PlanCard
      v-for="plan in plans"
      :key="plan.code"
      :data-plan-code="plan.code"
      :plan="plan"
      :catalog="catalog"
      :current="plan.code === subscription?.plan_code"
      :disabled="disabledPlan(plan)"
      :loading="active === plan.code"
      :eligibility-pending="eligibilityPending"
      :button-label="planButtonLabel(plan)"
      @select="selectPlan"
    />
  </div>
</template>
