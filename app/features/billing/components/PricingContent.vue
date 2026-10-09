<script setup lang="ts">
import { useAuthStore } from '~/features/auth'
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
import TransientNotice from '~/components/ui/TransientNotice.vue'
const props = withDefaults(
  defineProps<{
    plans?: readonly PricingPlan[]
    currentPlanId?: PlanId | null
    initialTab?: PricingTab
    headingTag?: 'h1' | 'h2'
  }>(),
  {
    plans: () => PRICING_PLANS,
    currentPlanId: undefined,
    initialTab: 'plans',
    headingTag: 'h2',
  },
)
const emit = defineEmits<{ checkout: [selection: CheckoutSelection] }>()
const { t } = useI18n()
const auth = useAuthStore()
const hydrated = ref(false)
onMounted(() => {
  hydrated.value = true
})
// Membership is still a preview; both surfaces use the same restored account state.
const resolvedPlanId = computed(() =>
  props.currentPlanId !== undefined
    ? props.currentPlanId
    : hydrated.value && auth.isAuthenticated
      ? PREVIEW_PLAN_ID
      : null,
)
const activeTab = ref<PricingTab>(props.initialTab)
const tabs = computed(() => [
  {
    value: 'plans',
    label: t('billing.plansTab'),
    slot: 'plans' as const,
    disabled: !hydrated.value,
  },
  {
    value: 'credits',
    label: t('billing.creditsTab'),
    slot: 'credits' as const,
    disabled: !hydrated.value,
  },
])
const topUpPlan = computed(() =>
  props.plans.find((plan) => plan.id === (resolvedPlanId.value ?? PREVIEW_PLAN_ID)),
)
const paymentNotice = useTemplateRef('paymentNotice')
function checkout(selection: CheckoutSelection) {
  if (!hydrated.value) return
  emit('checkout', selection)
  paymentNotice.value?.show()
}
</script>

<template>
  <section class="pricing-content">
    <TransientNotice
      ref="paymentNotice"
      :message="t('billing.paymentSoon')"
    />
    <header class="pricing-heading">
      <component :is="headingTag">{{ t('billing.title') }}</component>
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
            :current="plan.id === resolvedPlanId"
            :disabled="!hydrated"
            @select="checkout"
          />
        </div>
      </template>
      <template #credits
        ><CreditTopUp
          v-if="topUpPlan"
          :plan="topUpPlan"
          :preview="resolvedPlanId === null"
          :disabled="!hydrated"
          @select="checkout"
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
