<script setup lang="ts">
import { useAuthStore } from '~/features/auth'
import type { PricingTab } from '../catalog'
import { useBillingAction } from '../composables/useBillingAction'
import { useBillingStore } from '../stores/billing'
import type { BillingQuote } from '../types'
import PlanSelection from './PlanSelection.vue'
import CreditTopUp from './CreditTopUp.vue'

const props = withDefaults(
  defineProps<{
    initialTab?: PricingTab
    headingTag?: 'h1' | 'h2'
  }>(),
  { initialTab: 'plans', headingTag: 'h2' },
)
const { t } = useI18n()
const auth = useAuthStore()
const billing = useBillingStore()
const { active, run } = useBillingAction<'topup' | 'retry'>()
const hydrated = ref(false)
const activeTab = ref<PricingTab>(props.initialTab)
await useAsyncData('billing-plans', async () => {
  await billing.loadCatalog()
  return true
})
onMounted(() => {
  hydrated.value = true
  void billing.initialize()
})
watch(
  () => auth.isAuthenticated,
  () => {
    void billing.initialize()
  },
)
watch(activeTab, () => billing.clearQuote())
onBeforeUnmount(() => billing.clearQuote())
const catalog = computed(() => billing.catalog)
const plans = computed(() => [...(catalog.value?.plans ?? [])].sort((a, b) => a.rank - b.rank))
const subscription = computed(() =>
  hydrated.value && auth.isAuthenticated ? billing.account?.subscription : null,
)
const currentPlan = computed(() =>
  plans.value.find((plan) => plan.code === subscription.value?.plan_code),
)
const topUpPlan = computed(() =>
  currentPlan.value && subscription.value
    ? {
        ...currentPlan.value,
        price_usd: subscription.value.monthly_price_usd,
        monthly_credits: subscription.value.monthly_credits,
        version: subscription.value.plan_version,
      }
    : null,
)
const showTabs = computed(
  () =>
    hydrated.value &&
    auth.isAuthenticated &&
    billing.account?.topup_eligible === true &&
    !!topUpPlan.value,
)
watch(showTabs, (eligible) => {
  if (!eligible) activeTab.value = 'plans'
})
const pending = computed(() => !!billing.account?.pending_order_id || billing.retryAvailable)
const canUpgrade = computed(() => !!billing.account?.topup_eligible && !pending.value)
const controlsDisabled = computed(
  () =>
    !hydrated.value ||
    active.value !== null ||
    billing.busy ||
    billing.retryAvailable ||
    (auth.isAuthenticated && (!billing.account || billing.loading)),
)
const tabs = computed(() => [
  {
    value: 'plans',
    label: t('billing.plansTab'),
    slot: 'plans' as const,
    disabled: !hydrated.value || billing.busy || active.value !== null,
  },
  {
    value: 'credits',
    label: t('billing.creditsTab'),
    slot: 'credits' as const,
    disabled: !hydrated.value || billing.busy || active.value !== null,
  },
])
function requestTopUpQuote(amount: string) {
  return billing.quoteTopUp(amount)
}
function confirmTopUp(quote: BillingQuote) {
  return run('topup', () => billing.payQuote(quote))
}
function retryOperation() {
  return run('retry', () => billing.retryOperation())
}
</script>

<template>
  <section
    class="pricing-content"
    :aria-busy="billing.busy"
  >
    <header class="pricing-heading">
      <component :is="headingTag">{{ t('billing.title') }}</component>
    </header>
    <div
      v-if="billing.error"
      class="pricing-feedback pricing-feedback-error"
      role="alert"
    >
      <p>{{ billing.error }}</p>
      <button
        v-if="billing.retryAvailable"
        type="button"
        class="pricing-operation-retry"
        :disabled="billing.busy || active !== null"
        :aria-busy="active === 'retry'"
        @click="retryOperation"
      >
        {{ t('billing.retryOriginalOperation') }}
      </button>
    </div>
    <div
      v-if="billing.catalogError && !catalog"
      class="pricing-feedback pricing-feedback-error"
      role="alert"
    >
      <p>{{ billing.catalogError }}</p>
      <button
        type="button"
        :disabled="billing.catalogLoading"
        @click="billing.loadCatalog()"
      >
        {{ t('common.retry') }}
      </button>
    </div>
    <p
      v-else-if="!catalog"
      class="pricing-loading"
      role="status"
    >
      {{ t('common.loading') }}
    </p>
    <UTabs
      v-if="catalog && showTabs"
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
      <template #plans>
        <PlanSelection
          :catalog="catalog"
          :subscription="subscription"
          :controls-disabled="controlsDisabled"
          :can-upgrade="canUpgrade"
        />
      </template>
      <template #credits>
        <CreditTopUp
          v-if="topUpPlan"
          :plan="topUpPlan"
          :catalog="catalog"
          :quote="billing.quote"
          :active="activeTab === 'credits'"
          :quoting="billing.quotingTopUp"
          :quote-error="billing.topUpQuoteError"
          :disabled="controlsDisabled || !!billing.account?.pending_order_id"
          :loading="active === 'topup'"
          @request-quote="requestTopUpQuote"
          @confirm="confirmTopUp"
          @invalidate="billing.clearQuote()"
        />
      </template>
    </UTabs>
    <PlanSelection
      v-else-if="catalog"
      :catalog="catalog"
      :subscription="subscription"
      :controls-disabled="controlsDisabled"
      :can-upgrade="canUpgrade"
    />
    <p
      v-if="catalog"
      class="pricing-preview-note"
    >
      <UIcon
        name="i-lucide-info"
        aria-hidden="true"
      />{{ t('billing.purchaseNote') }}
    </p>
  </section>
</template>
