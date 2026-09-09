<script setup lang="ts">
import {
  PRICING_PLANS,
  PREVIEW_PLAN_ID,
  type CheckoutSelection,
  type PlanId,
  type PricingPlan,
  type PricingTab,
} from '../catalog'
import PlanCard from './PlanCard.vue'
import CreditTopUp from './CreditTopUp.vue'
const props = withDefaults(
  defineProps<{
    plans?: readonly PricingPlan[]
    currentPlanId?: PlanId
    initialTab?: PricingTab
  }>(),
  { plans: () => PRICING_PLANS, currentPlanId: PREVIEW_PLAN_ID, initialTab: 'plans' },
)
const emit = defineEmits<{ checkout: [selection: CheckoutSelection] }>()
const { t } = useI18n()
const activeTab = ref<PricingTab>(props.initialTab)
const tabs = computed(() => [
  { value: 'plans', label: t('billing.plansTab'), slot: 'plans' as const },
  { value: 'credits', label: t('billing.creditsTab'), slot: 'credits' as const },
])
const currentPlan = computed(() => props.plans.find((plan) => plan.id === props.currentPlanId))
</script>

<template>
  <section class="pricing-content">
    <header class="pricing-heading">
      <h2>{{ t('billing.title') }}</h2>
    </header>
    <UTabs
      v-model="activeTab"
      :items="tabs"
      :unmount-on-hide="false"
      class="pricing-tabs"
      :ui="{
        list: 'pricing-tab-list',
        indicator: 'pricing-tab-indicator',
        trigger: 'pricing-tab-trigger',
        content: 'pricing-tab-content',
      }"
    >
      <template #plans
        ><div class="pricing-plan-grid">
          <PlanCard
            v-for="plan in plans"
            :key="plan.id"
            :plan="plan"
            :current="plan.id === currentPlanId"
            @select="emit('checkout', $event)"
          />
        </div>
      </template>
      <template #credits
        ><CreditTopUp
          v-if="currentPlan"
          :plan="currentPlan"
          @select="emit('checkout', $event)"
        />
        <p
          v-else
          class="pricing-shared-note"
        >
          {{ t('billing.membershipUnavailable') }}
        </p></template
      >
    </UTabs>
    <p class="pricing-preview-note">
      <UIcon
        name="i-lucide-info"
        aria-hidden="true"
      />{{ t('billing.previewNote') }}
    </p>
  </section>
</template>
