<script setup lang="ts">
definePageMeta({ layout: 'public' })
const { t } = useI18n()
usePageSeo(
  () => `${t('openSource.title')} — SpeakQuant`,
  () => t('openSource.intro'),
  true,
)
</script>
<template>
  <article class="open-source-page">
    <h1>{{ t('openSource.title') }}</h1>
    <h2>TradingView Lightweight Charts™ · 5.2.0</h2>
    <p>{{ t('openSource.attribution') }}</p>
    <p>
      TradingView Lightweight Charts™<br />Copyright (с) 2025 TradingView, Inc.
      <a
        href="https://www.tradingview.com/"
        rel="noopener noreferrer"
        target="_blank"
        >TradingView</a
      >
    </p>
    <p>
      <a href="/licenses/lightweight-charts-LICENSE.txt">{{ t('openSource.license') }}</a> ·
      <a href="/licenses/lightweight-charts-NOTICE.txt">{{ t('openSource.notice') }}</a>
    </p>
  </article>
</template>
