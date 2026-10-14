<script setup lang="ts">
import { formatDecimal, formatQuantity } from '~/lib/format'
import Decimal from 'decimal.js'
import {
  planName,
  TOP_UP_MIN_USD,
  TOP_UP_AMOUNTS,
  topUpRatePer1000,
  validateTopUpAmount,
} from '../catalog'
import { providerDate } from '../payment'
import type { BillingQuote, Plan, PlanCatalog } from '../types'

const props = defineProps<{
  plan: Plan
  catalog: PlanCatalog
  quote: BillingQuote | null
  active: boolean
  disabled?: boolean
  loading?: boolean
  quoting?: boolean
  quoteError?: string | null
}>()
const emit = defineEmits<{
  requestQuote: [amount: string]
  confirm: [quote: BillingQuote]
  invalidate: []
}>()
const { t, locale } = useI18n()
const inputId = useId()
const amount = ref(TOP_UP_MIN_USD)
const submittedQuote = shallowRef<BillingQuote | null>(null)
const debouncing = ref(false)
let mounted = false
let debounceTimer: ReturnType<typeof setTimeout> | undefined
let expiryTimer: ReturnType<typeof setTimeout> | undefined
const displayedQuote = computed(() => props.quote ?? (props.loading ? submittedQuote.value : null))
const normalizedAmount = computed(() => validateTopUpAmount(amount.value))
const confirmedQuote = computed(() =>
  displayedQuote.value?.kind === 'topup' &&
  displayedQuote.value.plan_code === props.plan.code &&
  displayedQuote.value.plan_version === props.plan.version &&
  (props.loading || providerDate(displayedQuote.value.expires_at) > Date.now()) &&
  normalizedAmount.value === validateTopUpAmount(displayedQuote.value.amount_usd)
    ? displayedQuote.value
    : null,
)
const presets = TOP_UP_AMOUNTS
const quotedRate = computed(() => {
  const quote = confirmedQuote.value
  if (quote?.monthly_price_cents && quote.monthly_credits && quote.markup_bps) {
    return new Decimal(quote.monthly_price_cents)
      .div(100)
      .div(quote.monthly_credits)
      .times(1000)
      .times(new Decimal(quote.markup_bps).div(10000).plus(1))
      .toString()
  }
  return topUpRatePer1000(props.plan, props.catalog)
})
const number = (value: string, digits = 0) => formatDecimal(value, locale.value, digits)
const buttonLabel = computed(() =>
  t('billing.payTopUpAmount', {
    amount: normalizedAmount.value ? number(normalizedAmount.value, 2) : '—',
  }),
)
const quotePending = computed(() => debouncing.value || !!props.quoting)
function clearTimers() {
  clearTimeout(debounceTimer)
  clearTimeout(expiryTimer)
  debounceTimer = undefined
  expiryTimer = undefined
  debouncing.value = false
}
function scheduleQuote(invalidate = true) {
  clearTimers()
  if (!mounted) return
  if (invalidate) {
    submittedQuote.value = null
    emit('invalidate')
  }
  if (!props.active || props.disabled || props.loading || !normalizedAmount.value) return
  debouncing.value = true
  debounceTimer = setTimeout(() => {
    debounceTimer = undefined
    debouncing.value = false
    if (props.active && !props.disabled && !props.loading && normalizedAmount.value) {
      emit('requestQuote', normalizedAmount.value)
    }
  }, 400)
}
function watchExpiry() {
  clearTimeout(expiryTimer)
  expiryTimer = undefined
  const current = props.quote
  if (
    mounted &&
    props.active &&
    !props.loading &&
    current?.kind === 'topup' &&
    providerDate(current.expires_at) <= Date.now()
  ) {
    scheduleQuote()
    return
  }
  const quote = confirmedQuote.value
  if (!mounted || !props.active || props.loading || !quote) return
  const delay = providerDate(quote.expires_at) - Date.now()
  expiryTimer = setTimeout(
    () => {
      expiryTimer = undefined
      if (providerDate(quote.expires_at) <= Date.now()) scheduleQuote()
      else watchExpiry()
    },
    Math.min(Math.max(0, delay), 2_147_483_647),
  )
}
watch(
  [amount, () => props.active, () => props.plan.code, () => props.plan.version],
  (_, previous) => {
    if (props.active || previous[1]) scheduleQuote()
    else clearTimers()
  },
  { flush: 'sync' },
)
watch(
  () => props.quote,
  (quote, previous) => {
    watchExpiry()
    if (!quote && previous && !props.loading) scheduleQuote(false)
  },
)
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) clearTimers()
    else if (!confirmedQuote.value && !props.quoting) scheduleQuote(false)
    else watchExpiry()
  },
)
watch(
  () => props.loading,
  (loading) => {
    if (loading) clearTimers()
    else {
      submittedQuote.value = null
      if (!confirmedQuote.value && !props.quoting) scheduleQuote(false)
      else watchExpiry()
    }
  },
)
onMounted(() => {
  mounted = true
  if (props.active) scheduleQuote()
})
onBeforeUnmount(() => {
  mounted = false
  clearTimers()
  if (props.active) emit('invalidate')
})
function submit() {
  if (!props.active || props.disabled || props.loading || quotePending.value) return
  const quote = confirmedQuote.value
  if (quote) {
    if (providerDate(quote.expires_at) <= Date.now()) {
      scheduleQuote()
      return
    }
    submittedQuote.value = quote
    emit('confirm', quote)
  }
}
</script>

<template>
  <form
    class="pricing-topup"
    novalidate
    @submit.prevent="submit"
  >
    <div class="pricing-topup-heading">
      <p>{{ t('billing.currentMembership') }}</p>
      <h3>{{ planName(plan.code) }}</h3>
    </div>
    <div class="pricing-amount-label">
      <label :for="inputId">{{ t('billing.topUpAmount') }}</label>
      <span :id="`${inputId}-hint`">{{
        t('billing.amountHint', {
          min: formatQuantity(TOP_UP_MIN_USD, locale),
        })
      }}</span>
    </div>
    <div
      class="pricing-amount-field"
      :class="{ 'is-invalid': !normalizedAmount }"
    >
      <span aria-hidden="true">$</span>
      <input
        :id="inputId"
        v-model="amount"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        :disabled="disabled || loading"
        :aria-invalid="!normalizedAmount"
        :aria-describedby="`${inputId}-hint${!normalizedAmount ? ` ${inputId}-error` : ''}`"
      />
    </div>
    <p
      :id="`${inputId}-error`"
      :class="{ 'is-clear': !!normalizedAmount }"
      :aria-hidden="!!normalizedAmount"
      class="pricing-error"
      role="alert"
    >
      {{
        t('billing.invalidAmount', {
          min: formatQuantity(TOP_UP_MIN_USD, locale),
        })
      }}
    </p>
    <div
      class="pricing-presets"
      role="group"
      :aria-label="t('billing.presetAmounts')"
    >
      <button
        v-for="preset in presets"
        :key="preset"
        type="button"
        :disabled="disabled || loading"
        :aria-pressed="normalizedAmount === `${preset}.00`"
        @click="amount = String(preset)"
      >
        ${{ number(String(preset)) }}
      </button>
    </div>
    <div
      class="pricing-topup-result"
      :class="{ 'pricing-topup-quote': confirmedQuote }"
      :aria-busy="quotePending"
      aria-live="polite"
      aria-atomic="true"
    >
      <div>
        <p>{{ t('billing.quotedCredits') }}</p>
        <strong>
          <UIcon
            v-if="quotePending"
            name="i-lucide-loader-circle"
            class="pricing-topup-spinner spin"
            :aria-label="t('common.loading')"
            role="status"
          />
          <template v-else>{{ confirmedQuote ? number(confirmedQuote.credits) : '—' }}</template>
          <span>{{ t('billing.credits') }}</span>
        </strong>
      </div>
      <div class="pricing-topup-rate">
        <p>{{ t('billing.unitPrice', { price: number(quotedRate, 2) }) }}</p>
      </div>
    </div>
    <div
      v-if="quoteError"
      class="pricing-topup-error"
      role="alert"
    >
      <p>{{ quoteError }}</p>
      <button
        type="button"
        :disabled="disabled || loading || quotePending || !normalizedAmount"
        @click="scheduleQuote()"
      >
        {{ t('common.retry') }}
      </button>
    </div>
    <button
      type="submit"
      class="pricing-button pricing-topup-submit"
      :disabled="disabled || loading || quotePending || !confirmedQuote"
      :aria-label="buttonLabel"
      :aria-busy="!!loading"
      :data-loading="!!loading"
    >
      <span :class="{ invisible: loading }">{{ buttonLabel }}</span>
      <UIcon
        v-if="loading"
        name="i-lucide-loader-circle"
        class="pricing-button-spinner spin"
        aria-hidden="true"
      />
    </button>
  </form>
</template>
