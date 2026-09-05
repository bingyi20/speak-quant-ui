<script setup lang="ts">
import { ResearchEntry } from '~/features/conversation'
definePageMeta({ layout: 'public' })
const { t } = useI18n()
usePageSeo(
  () => `Trade Lab — ${t('landing.title1')}${t('landing.title2')}`,
  () => t('landing.subtitle'),
  true,
)
</script>
<template>
  <div>
    <section class="landing-hero">
      <span class="eyebrow">{{ $t('landing.eyebrow') }}</span>
      <h1>
        {{ $t('landing.title1') }}<br />{{ $t('landing.title2')
        }}<span class="gold-period">。</span>
      </h1>
      <p class="hero-description">{{ $t('landing.subtitle') }}</p>
      <ResearchEntry /><a
        href="#method"
        class="explore-link"
        >{{ $t('landing.explore') }}<UIcon name="i-lucide-arrow-down"
      /></a>
    </section>
    <section
      id="method"
      class="method-section"
    >
      <div class="method-heading">
        <span class="eyebrow">01 — RESEARCH, WITH CONTEXT</span>
        <h2>{{ $t('landing.methodTitle') }}</h2>
        <p>{{ $t('landing.methodIntro') }}</p>
      </div>
      <div class="method-grid">
        <article
          v-for="n in 3"
          :key="n"
        >
          <span class="step-number">0{{ n }}</span>
          <h3>{{ $t(`landing.step${n}`) }}</h3>
          <p>{{ $t(`landing.desc${n}`) }}</p>
        </article>
      </div>
      <NuxtLink
        to="/new-task"
        class="outline-button"
        >{{ $t('nav.workspace') }}<UIcon name="i-lucide-arrow-up-right"
      /></NuxtLink>
    </section>
  </div>
</template>
