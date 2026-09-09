<script setup lang="ts">
import { formatDecimal } from '~/lib/format'
import type { CheckoutSelection, PricingPlan } from '../catalog'
const props = defineProps<{ plan: PricingPlan; current: boolean }>()
const emit = defineEmits<{ select: [selection: CheckoutSelection] }>()
const { t, locale } = useI18n()
const number = (value: number, digits = 0) => formatDecimal(String(value), locale.value, digits)
const featureKeys = computed(() =>
  props.plan.id === 'free'
    ? ['conversation', 'history', 'iteration']
    : ['allowance', 'flexibility', 'topUp'],
)
function select() {
  emit('select', {
    kind: 'subscription',
    planId: props.plan.id,
    planName: props.plan.name,
    amountCents: props.plan.monthlyPriceCents,
    credits: props.plan.monthlyCredits,
  })
}
</script>

<template>
  <article
    class="pricing-plan"
    :class="{ 'is-recommended': plan.recommended }"
    :aria-label="plan.name"
  >
    <div class="pricing-plan-heading">
      <h3>{{ plan.name }}</h3>
      <span
        v-if="plan.recommended"
        class="pricing-badge"
        >{{ t('billing.recommended') }}</span
      >
    </div>
    <p class="pricing-plan-description">{{ t(`billing.plans.${plan.id}.description`) }}</p>
    <div class="pricing-price">
      <span class="pricing-currency">$</span
      ><strong>{{ number(plan.monthlyPriceCents / 100) }}</strong
      ><span>{{ t('billing.perMonth') }}</span>
    </div>
    <div class="pricing-credit-box">
      <div>
        <UIcon
          name="i-lucide-sparkle"
          aria-hidden="true"
        /><strong>{{ t('billing.creditCount', { count: number(plan.monthlyCredits) }) }}</strong
        ><span>{{ t('billing.everyMonth') }}</span>
      </div>
      <p>
        {{
          plan.monthlyPriceCents === 0
            ? t('billing.freeCredits')
            : t('billing.unitPrice', {
                price: number(plan.monthlyPriceCents / plan.monthlyCredits, 2),
              })
        }}
      </p>
    </div>
    <button
      type="button"
      class="pricing-button"
      :disabled="current || plan.id === 'free'"
      @click="select"
    >
      {{
        current
          ? t('billing.currentPlan')
          : plan.id === 'free'
            ? t('billing.freePlan')
            : t('billing.choosePlan', { plan: plan.name })
      }}
    </button>
    <div class="pricing-plan-features">
      <p>{{ t(`billing.plans.${plan.id}.includes`) }}</p>
      <ul>
        <li
          v-for="key in featureKeys"
          :key="key"
        >
          <UIcon
            name="i-lucide-check"
            aria-hidden="true"
          /><span>{{
            t(`billing.features.${key}`, {
              count: number(plan.monthlyCredits),
              price: number(plan.topUpCentsPer100 / 100, 2),
            })
          }}</span>
        </li>
      </ul>
    </div>
    <div class="pricing-plan-footnote">
      <UIcon
        name="i-lucide-sparkle"
        aria-hidden="true"
      /><span>{{ t('billing.topUpRate', { price: number(plan.topUpCentsPer100 / 100, 2) }) }}</span>
    </div>
  </article>
</template>
