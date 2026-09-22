<script setup lang="ts">
import { PricingContent } from '~/features/billing'
definePageMeta({ layout: 'public' })
const { t } = useI18n()
const localePath = useLocalePath()
const creditExamples = computed(() =>
  ['discussion', 'strategy', 'backtest'].map((key) => ({
    task: t(`publicPricing.usage.${key}`),
    amount: t(`publicPricing.usage.${key}Amount`),
  })),
)
usePageSeo(
  () => `${t('nav.pricing')} — Trade Lab`,
  () => t('publicPricing.intro'),
  true,
)
</script>
<template>
  <div class="public-pricing-page">
    <PricingContent heading-tag="h1" />
    <div class="public-pricing-details">
      <section id="credits">
        <h2>{{ $t('publicPricing.creditsTitle') }}</h2>
        <p>{{ $t('publicPricing.creditsBody') }}</p>
        <dl class="public-credit-examples">
          <div
            v-for="example in creditExamples"
            :key="example.task"
          >
            <dt>{{ example.task }}</dt>
            <dd>{{ example.amount }}</dd>
          </div>
        </dl>
        <p class="public-usage-note">{{ $t('publicPricing.usageNote') }}</p>
        <p>{{ $t('publicPricing.readingBody') }}</p>
      </section>
      <section>
        <h2>{{ $t('publicPricing.topUpTitle') }}</h2>
        <p>{{ $t('publicPricing.topUpBody') }}</p>
      </section>
      <section id="billing">
        <h2>{{ $t('publicPricing.billingTitle') }}</h2>
        <p>{{ $t('publicPricing.billingBody') }}</p>
        <p>{{ $t('publicPricing.refundBody') }}</p>
      </section>
      <NuxtLink :to="localePath('/contact')"
        >{{ $t('publicPricing.contactLink') }} <UIcon name="i-lucide-arrow-up-right"
      /></NuxtLink>
    </div>
  </div>
</template>
