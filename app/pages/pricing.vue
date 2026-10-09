<script setup lang="ts">
import { PricingContent } from '~/features/billing'
definePageMeta({ layout: 'public' })
const { t } = useI18n()
const localePath = useLocalePath()
usePageSeo(
  () => `${t('nav.pricing')} — SpeakQuant`,
  () => t('publicPricing.intro'),
  true,
)
</script>
<template>
  <div class="public-pricing-page">
    <PricingContent heading-tag="h1" />
    <section
      class="public-pricing-details"
      aria-labelledby="pricing-faq-title"
    >
      <h2
        id="pricing-faq-title"
        class="public-faq-title"
      >
        {{ $t('publicPricing.faqTitle') }}
      </h2>
      <section>
        <h3>{{ $t('publicPricing.plansTitle') }}</h3>
        <p>{{ $t('publicPricing.plansBody') }}</p>
      </section>
      <section id="credits">
        <h3>{{ $t('publicPricing.creditsTitle') }}</h3>
        <p>{{ $t('publicPricing.creditsBody') }}</p>
      </section>
      <section>
        <h3>{{ $t('publicPricing.topUpTitle') }}</h3>
        <p>{{ $t('publicPricing.topUpBody') }}</p>
      </section>
      <section id="billing">
        <h3>{{ $t('publicPricing.billingTitle') }}</h3>
        <p>{{ $t('publicPricing.billingBody') }}</p>
      </section>
      <section id="refunds">
        <h3>{{ $t('publicPricing.refundTitle') }}</h3>
        <p>{{ $t('publicPricing.refundBody') }}</p>
      </section>
      <NuxtLink :to="localePath('/contact')"
        >{{ $t('publicPricing.contactLink') }} <UIcon name="i-lucide-arrow-up-right"
      /></NuxtLink>
    </section>
  </div>
</template>
