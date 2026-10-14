<script setup lang="ts">
import Decimal from 'decimal.js'
import { formatDecimal, formatQuantity } from '~/lib/format'
import LoadingSkeleton from '~/components/ui/LoadingSkeleton.vue'
import { planName, topUpRatePer1000 } from '../catalog'
import type { Plan, PlanCatalog } from '../types'

const props = defineProps<{
  plan: Plan
  catalog: PlanCatalog
  current: boolean
  disabled?: boolean
  loading?: boolean
  eligibilityPending?: boolean
  buttonLabel?: string
}>()
const emit = defineEmits<{ select: [code: Plan['code']] }>()
const { t, locale } = useI18n()
const number = (value: string, digits = 0) => formatDecimal(value, locale.value, digits)
const includedRate = computed(() =>
  new Decimal(props.plan.price_usd).times(1000).div(props.plan.monthly_credits).toString(),
)
const topUpRate = computed(() => topUpRatePer1000(props.plan, props.catalog))
const label = computed(() =>
  props.current
    ? t('billing.currentPlan')
    : props.buttonLabel || t('billing.choosePlan', { plan: planName(props.plan.code) }),
)
</script>

<template>
  <article
    class="pricing-plan"
    :aria-label="planName(plan.code)"
  >
    <div class="pricing-plan-heading">
      <h3>{{ planName(plan.code) }}</h3>
    </div>
    <p class="pricing-plan-description">{{ t(`billing.plans.${plan.code}.description`) }}</p>
    <div class="pricing-price">
      <span class="pricing-currency">$</span>
      <strong>{{ formatQuantity(plan.price_usd, locale) }}</strong>
      <span>{{ t('billing.perMonth') }}</span>
    </div>
    <div class="pricing-credit-box">
      <div>
        <UIcon
          name="i-lucide-sparkle"
          aria-hidden="true"
        />
        <strong>{{ t('billing.creditCount', { count: number(plan.monthly_credits) }) }}</strong>
        <span>{{ t('billing.everyMonth') }}</span>
      </div>
      <p>{{ t('billing.unitPrice', { price: number(includedRate, 2) }) }}</p>
    </div>
    <button
      type="button"
      class="pricing-button"
      :class="{ 'is-pending': eligibilityPending }"
      :disabled="disabled || current || loading || eligibilityPending"
      :aria-hidden="eligibilityPending || undefined"
      :aria-label="label"
      :aria-busy="!!loading"
      :data-loading="!!loading"
      @click="emit('select', plan.code)"
    >
      <span :class="{ invisible: loading || eligibilityPending }">{{ label }}</span>
      <LoadingSkeleton
        v-if="eligibilityPending"
        class="pricing-button-placeholder"
      />
      <UIcon
        v-if="loading"
        name="i-lucide-loader-circle"
        class="pricing-button-spinner spin"
        aria-hidden="true"
      />
    </button>
    <div class="pricing-plan-features">
      <p>{{ t('billing.researchIncluded') }}</p>
      <ul>
        <li
          v-for="key in ['conversation', 'history', 'iteration']"
          :key="key"
        >
          <UIcon
            name="i-lucide-check"
            aria-hidden="true"
          />
          <span>{{ t(`billing.features.${key}`) }}</span>
        </li>
      </ul>
    </div>
    <div class="pricing-plan-footnote">
      <UIcon
        name="i-lucide-sparkle"
        aria-hidden="true"
      />
      <span>{{ t('billing.topUpRate', { price: number(topUpRate, 2) }) }}</span>
    </div>
  </article>
</template>
