<script setup lang="ts">
import { formatDecimal } from '~/lib/format'
import {
  quoteTopUp,
  TOP_UP_AMOUNTS,
  TOP_UP_MIN,
  TOP_UP_MAX,
  type CheckoutSelection,
  type PricingPlan,
} from '../catalog'
const props = defineProps<{ plan: PricingPlan }>()
const emit = defineEmits<{ select: [selection: CheckoutSelection] }>()
const { t, locale } = useI18n()
const inputId = useId()
const amount = ref(String(TOP_UP_MIN))
const quote = computed(() => quoteTopUp(amount.value, props.plan))
const number = (value: number, digits = 0) => formatDecimal(String(value), locale.value, digits)
function submit() {
  if (quote.value) emit('select', quote.value)
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
      <h3>{{ plan.name }}</h3>
    </div>
    <div class="pricing-amount-label">
      <label :for="inputId">{{ t('billing.topUpAmount') }}</label
      ><span :id="`${inputId}-hint`">{{ t('billing.amountHint', { min: TOP_UP_MIN }) }}</span>
    </div>
    <div
      class="pricing-amount-field"
      :class="{ 'is-invalid': !quote }"
    >
      <span aria-hidden="true">$</span
      ><input
        :id="inputId"
        v-model="amount"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        maxlength="10"
        :aria-invalid="!quote"
        :aria-describedby="`${inputId}-hint${!quote ? ` ${inputId}-error` : ''}`"
      />
    </div>
    <p
      :id="`${inputId}-error`"
      :class="{ 'is-clear': !!quote }"
      :aria-hidden="!!quote"
      class="pricing-error"
      role="alert"
    >
      {{ t('billing.invalidAmount', { min: TOP_UP_MIN, max: number(TOP_UP_MAX) }) }}
    </p>
    <div
      class="pricing-presets"
      role="group"
      :aria-label="t('billing.presetAmounts')"
    >
      <button
        v-for="preset in TOP_UP_AMOUNTS"
        :key="preset"
        type="button"
        :aria-pressed="amount === String(preset)"
        @click="amount = String(preset)"
      >
        ${{ number(preset) }}
      </button>
    </div>
    <div
      class="pricing-topup-result"
      aria-live="polite"
      aria-atomic="true"
    >
      <div>
        <p>{{ t('billing.youReceive') }}</p>
        <strong
          >{{ quote ? number(quote.credits) : '—' }}<span>{{ t('billing.credits') }}</span></strong
        >
      </div>
      <div class="pricing-topup-rate">
        <p>{{ t('billing.unitPrice', { price: number(plan.topUpCentsPer100 / 100, 2) }) }}</p>
      </div>
    </div>
    <p class="pricing-topup-note">{{ t('billing.roundingNote') }}</p>
    <button
      type="submit"
      class="pricing-button"
      :disabled="!quote"
    >
      {{
        quote
          ? t('billing.continueAmount', { amount: number(quote.amountCents / 100) })
          : t('billing.enterAmount')
      }}
    </button>
  </form>
</template>
