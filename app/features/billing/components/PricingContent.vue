<script setup lang="ts">
import { useAuthStore } from '~/features/auth'
import LoadingState from '~/components/common/LoadingState.vue'
import LoadingSkeleton from '~/components/ui/LoadingSkeleton.vue'
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
const app = useNuxtApp()
const auth = useAuthStore()
const billing = useBillingStore()
const { active, run } = useBillingAction<'topup' | 'retry'>()
const hydrated = ref(import.meta.client && !app.isHydrating)
const activeTab = ref<PricingTab>(props.initialTab)
const upgradeConfirmationOpen = ref(false)
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
    (billing.account?.topup_eligible === true || upgradeConfirmationOpen.value) &&
    !!topUpPlan.value,
)
const initialLoading = computed(
  () =>
    !hydrated.value ||
    ['unknown', 'restoring'].includes(auth.status) ||
    (auth.isAuthenticated && !billing.account && (billing.loading || !billing.error)),
)
const initialError = computed(() => {
  if (initialLoading.value) return null
  if (auth.status === 'unavailable') return t('auth.restoreError')
  return auth.isAuthenticated && !billing.account ? billing.error : null
})
const eligibilityUnknown = computed(() => initialLoading.value || !!initialError.value)
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
async function retryInitialLoad() {
  if (auth.status === 'unavailable') await app.$restoreAuth()
  await billing.initialize()
}
</script>

<template>
  <section
    class="pricing-content"
    :data-initial-loading="eligibilityUnknown"
    :aria-busy="initialLoading || billing.busy"
  >
    <header class="pricing-heading">
      <component :is="headingTag">{{ t('billing.title') }}</component>
    </header>
    <div
      v-if="billing.error && !eligibilityUnknown && !upgradeConfirmationOpen"
      class="pricing-feedback pricing-feedback-error"
      role="alert"
    >
      <p>{{ billing.error }}</p>
      <button
        v-if="billing.retryAvailable && !billing.retryBlocked"
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
    <LoadingState
      v-else-if="!catalog"
      class="pricing-loading"
    />
    <div
      v-if="catalog && !showTabs"
      class="pricing-tab-placeholder"
    >
      <div
        v-if="initialLoading"
        class="pricing-tab-skeleton"
        role="status"
        aria-live="polite"
      >
        <LoadingSkeleton class="pricing-tab-skeleton-shape" />
        <span
          v-for="tab in tabs"
          :key="tab.value"
          class="pricing-tab-trigger"
          aria-hidden="true"
        >
          {{ tab.label }}
        </span>
        <span class="sr-only">{{ t('common.loading') }}</span>
      </div>
      <div
        v-else-if="initialError"
        class="pricing-initial-error"
        role="alert"
      >
        <p>{{ initialError }}</p>
        <button
          type="button"
          @click="retryInitialLoad"
        >
          {{ t('common.retry') }}
        </button>
      </div>
    </div>
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
          @confirmation-change="upgradeConfirmationOpen = $event"
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
      :controls-disabled="controlsDisabled || eligibilityUnknown"
      :can-upgrade="canUpgrade"
      :eligibility-pending="eligibilityUnknown"
      @confirmation-change="upgradeConfirmationOpen = $event"
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
