<script setup lang="ts">
import { formatDecimal } from '~/lib/format'
import { planName } from '../catalog'
import { providerDate } from '../payment'
import type { BillingQuote } from '../types'

const props = defineProps<{
  quote: BillingQuote | null
  returnFocus?: HTMLElement | null
  pending?: 'pay' | 'other' | 'retry' | 'refresh' | null
  disabled?: boolean
  error?: string | null
  canRetry?: boolean
  canRefreshQuote?: boolean
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  confirm: []
  otherPayment: []
  retry: []
  refreshQuote: []
}>()
const { t, locale } = useI18n()
const number = (value: string | undefined, digits = 0) => formatDecimal(value, locale.value, digits)
const busy = computed(() => !!props.pending)
const card = computed(() => {
  const method = props.quote?.payment_method
  if (method?.type !== 'card' || !method.brand || !/^\d{4}$/.test(method.last4)) return null
  const brands: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    discover: 'Discover',
    diners: 'Diners Club',
    jcb: 'JCB',
    unionpay: 'UnionPay',
  }
  return `${brands[method.brand] || method.brand}*${method.last4}`
})
const nextBillingDate = computed(() => {
  const endsAt = props.quote?.billing_period_preview?.ends_at
  const timestamp = endsAt ? providerDate(endsAt) : NaN
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat(locale.value, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(timestamp)
    : null
})
const creditTerms = computed(() =>
  [
    props.quote?.old_monthly_credits_will_expire ? t('billing.upgradeMonthlyExpires') : null,
    props.quote?.signup_and_topup_preserved ? t('billing.upgradePreserved') : null,
  ]
    .filter(Boolean)
    .join(' '),
)
function close() {
  if (!busy.value) open.value = false
}
function restoreFocus(event: Event) {
  event.preventDefault()
  if (props.returnFocus?.isConnected) props.returnFocus.focus({ preventScroll: true })
}
</script>

<template>
  <UModal
    :open="open"
    :title="t('billing.upgradeDialogTitle')"
    :dismissible="!busy"
    :content="{ onCloseAutoFocus: restoreFocus }"
    :ui="{ overlay: 'z-[60]', content: 'pricing-upgrade-modal z-[61] divide-y-0 ring-0' }"
    @update:open="!$event && close()"
  >
    <template #content>
      <header class="pricing-upgrade-header">
        <h2>{{ t('billing.upgradeDialogTitle') }}</h2>
        <UiIconButton
          :label="t('common.close')"
          :disabled="busy"
          class="pricing-upgrade-close"
          @click="close"
        >
          <UIcon name="i-lucide-x" />
        </UiIconButton>
      </header>
      <div
        v-if="quote"
        class="pricing-upgrade-body"
      >
        <section
          class="pricing-upgrade-summary"
          :aria-label="t('billing.upgradeComparison')"
        >
          <div class="pricing-upgrade-plans">
            <div>
              <p class="pricing-upgrade-eyebrow">{{ t('billing.currentPlan') }}</p>
              <h3>{{ quote.current_plan ? planName(quote.current_plan.code) : '—' }}</h3>
              <p class="pricing-upgrade-credits">
                {{
                  t('billing.upgradeMonthlyCredits', {
                    count: number(quote.current_plan?.monthly_credits),
                  })
                }}
              </p>
            </div>
            <UIcon
              name="i-lucide-arrow-right"
              class="pricing-upgrade-arrow"
              aria-hidden="true"
            />
            <div>
              <p class="pricing-upgrade-eyebrow">{{ t('billing.upgradeNewPlan') }}</p>
              <h3>{{ planName(quote.plan_code) }}</h3>
              <p class="pricing-upgrade-credits">
                {{ t('billing.upgradeMonthlyCredits', { count: number(quote.credits) }) }}
              </p>
            </div>
          </div>
          <div class="pricing-upgrade-terms">
            <p>
              {{ t('billing.upgradePaymentTerms') }}
              <span
                v-if="nextBillingDate"
                class="pricing-upgrade-period"
              >
                {{ t('billing.upgradeNextBillingDate', { date: nextBillingDate }) }}
              </span>
            </p>
            <p v-if="creditTerms">{{ creditTerms }}</p>
          </div>
        </section>

        <dl class="pricing-upgrade-amounts">
          <div class="pricing-upgrade-line-item">
            <dt>{{ t('billing.upgradeMonthlyPlan', { plan: planName(quote.plan_code) }) }}</dt>
            <dd>${{ number(quote.amount_usd, 2) }}</dd>
          </div>
          <div class="pricing-upgrade-total">
            <dt>{{ t('billing.upgradeTotalDue') }}</dt>
            <dd><span>USD</span> ${{ number(quote.amount_usd, 2) }}</dd>
          </div>
        </dl>

        <div class="pricing-upgrade-payment">
          <span>{{ t('billing.upgradePaymentMethod') }}</span>
          <div class="pricing-upgrade-payment-detail">
            <p :class="{ 'is-unavailable': !card }">
              {{ card || t('billing.upgradePaymentMethodUnknown') }}
            </p>
            <button
              type="button"
              class="pricing-upgrade-other"
              :disabled="busy || disabled || canRetry || canRefreshQuote"
              :aria-busy="pending === 'other'"
              @click="emit('otherPayment')"
            >
              <UIcon
                v-if="pending === 'other'"
                name="i-lucide-loader-circle"
                class="spin"
                aria-hidden="true"
              />
              {{ t('billing.upgradeOtherPayment') }}
            </button>
          </div>
        </div>

        <div
          v-if="error"
          class="pricing-upgrade-error pricing-feedback-error"
          role="alert"
        >
          <p>{{ error }}</p>
          <button
            v-if="canRetry"
            type="button"
            class="pricing-operation-retry"
            :disabled="busy"
            :aria-busy="pending === 'retry'"
            @click="emit('retry')"
          >
            <UIcon
              v-if="pending === 'retry'"
              name="i-lucide-loader-circle"
              class="spin"
              aria-hidden="true"
            />
            {{ t('billing.retryOriginalOperation') }}
          </button>
          <button
            v-else-if="canRefreshQuote"
            type="button"
            class="pricing-operation-retry pricing-upgrade-refresh-quote"
            :disabled="busy"
            :aria-busy="pending === 'refresh'"
            @click="emit('refreshQuote')"
          >
            <UIcon
              v-if="pending === 'refresh'"
              name="i-lucide-loader-circle"
              class="spin"
              aria-hidden="true"
            />
            {{ t('billing.upgradeRefreshQuote') }}
          </button>
        </div>

        <footer class="pricing-upgrade-actions">
          <button
            type="button"
            class="pricing-upgrade-cancel"
            :disabled="busy"
            @click="close"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="pricing-button pricing-upgrade-confirm"
            :disabled="busy || disabled || canRetry || canRefreshQuote"
            :aria-label="t('billing.upgradePayNow')"
            :aria-busy="pending === 'pay'"
            :data-loading="pending === 'pay'"
            @click="emit('confirm')"
          >
            <span :class="{ invisible: pending === 'pay' }">{{ t('billing.upgradePayNow') }}</span>
            <UIcon
              v-if="pending === 'pay'"
              name="i-lucide-loader-circle"
              class="pricing-button-spinner spin"
              aria-hidden="true"
            />
          </button>
        </footer>
      </div>
    </template>
  </UModal>
</template>
