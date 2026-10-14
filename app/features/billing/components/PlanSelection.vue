<script setup lang="ts">
import { formatDate, formatDecimal } from '~/lib/format'
import { planName } from '../catalog'
import { useBillingAction } from '../composables/useBillingAction'
import { isOrderTerminal, paymentUrl, providerDate } from '../payment'
import { useBillingStore } from '../stores/billing'
import type { BillingQuote, Plan, PlanCatalog, PlanCode, Subscription } from '../types'
import PlanCard from './PlanCard.vue'

const props = defineProps<{
  catalog: PlanCatalog
  subscription: Subscription | null | undefined
  controlsDisabled: boolean
  canUpgrade: boolean
  eligibilityPending?: boolean
}>()
const { t, locale } = useI18n()
const billing = useBillingStore()
const { active, run } = useBillingAction<PlanCode | 'upgrade-confirm'>()
const submittedQuote = shallowRef<BillingQuote | null>(null)
const plans = computed(() => [...props.catalog.plans].sort((a, b) => a.rank - b.rank))
const currentPlan = computed(() =>
  plans.value.find((plan) => plan.code === props.subscription?.plan_code),
)
const number = (value: string | undefined, digits = 0) => formatDecimal(value, locale.value, digits)
const upgradeQuote = computed(() =>
  active.value === 'upgrade-confirm'
    ? submittedQuote.value
    : billing.quote?.kind === 'upgrade'
      ? billing.quote
      : null,
)
watch(active, (target) => {
  if (target !== 'upgrade-confirm') submittedQuote.value = null
})
const quoteExpiry = computed(() =>
  upgradeQuote.value
    ? formatDate(new Date(providerDate(upgradeQuote.value.expires_at)).toISOString(), locale.value)
    : '',
)
function canResumePlan(plan: Plan) {
  const order = billing.activeOrder
  return (
    !!props.subscription &&
    order?.kind === 'upgrade' &&
    order.plan_code === plan.code &&
    !isOrderTerminal(order) &&
    !!paymentUrl(order.payment_action)
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
  return run(code, () => billing.purchasePlan(code))
}
function confirmUpgrade() {
  const quote = upgradeQuote.value
  if (quote && active.value === null) {
    submittedQuote.value = quote
    return run('upgrade-confirm', () => billing.payQuote(quote))
  }
}
</script>

<template>
  <section
    v-if="upgradeQuote"
    class="pricing-quote-confirm"
    aria-live="polite"
    :aria-label="t('billing.confirmUpgrade')"
  >
    <h3>{{ t('billing.upgradeQuoteTitle', { plan: planName(upgradeQuote.plan_code) }) }}</h3>
    <p class="pricing-quote-total">
      {{
        t('billing.upgradeTotal', {
          amount: number(upgradeQuote.amount_usd, 2),
          credits: number(upgradeQuote.credits),
        })
      }}
    </p>
    <ul>
      <li>{{ t('billing.upgradeFullPrice') }}</li>
      <li v-if="upgradeQuote.old_monthly_credits_will_expire">
        {{ t('billing.upgradeMonthlyExpires') }}
      </li>
      <li v-if="upgradeQuote.reset_billing_cycle">{{ t('billing.upgradeCycleReset') }}</li>
      <li v-if="upgradeQuote.signup_and_topup_preserved">
        {{ t('billing.upgradePreserved') }}
      </li>
    </ul>
    <p class="pricing-quote-expiry">
      {{ t('billing.quoteExpires', { date: quoteExpiry }) }}
    </p>
    <div class="pricing-quote-actions">
      <button
        type="button"
        class="pricing-button pricing-upgrade-confirm"
        :disabled="controlsDisabled || !canUpgrade || active !== null"
        :aria-label="
          t('billing.confirmPaymentAmount', { amount: number(upgradeQuote.amount_usd, 2) })
        "
        :aria-busy="active === 'upgrade-confirm'"
        :data-loading="active === 'upgrade-confirm'"
        @click="confirmUpgrade"
      >
        <span :class="{ invisible: active === 'upgrade-confirm' }">
          {{ t('billing.confirmPaymentAmount', { amount: number(upgradeQuote.amount_usd, 2) }) }}
        </span>
        <UIcon
          v-if="active === 'upgrade-confirm'"
          name="i-lucide-loader-circle"
          class="pricing-button-spinner spin"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="pricing-quote-dismiss"
        :disabled="billing.busy || active !== null"
        @click="billing.clearQuote()"
      >
        {{ t('common.cancel') }}
      </button>
    </div>
  </section>
  <div class="pricing-plan-grid">
    <PlanCard
      v-for="plan in plans"
      :key="plan.code"
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
