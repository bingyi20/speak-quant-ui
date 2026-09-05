<script setup lang="ts">
import { ResearchEntry } from '~/features/conversation'
definePageMeta({ layout: 'workspace', middleware: 'auth' })
const { t } = useI18n()
const scaffold = String(useRuntimeConfig().public.apiEnabled) !== 'true'
usePageSeo(
  () => `${t('nav.new')} · Trade Lab`,
  () => t('research.subtitle'),
)
</script>
<template>
  <section class="new-task-page">
    <div class="new-task-inner">
      <h1>{{ $t('research.title') }}</h1>
      <ResearchEntry :show-hint="false" /><NuxtLink
        v-if="scaffold"
        to="/conversations/preview"
        class="explore-link"
        >{{ $t('research.preview') }}<UIcon name="i-lucide-arrow-right"
      /></NuxtLink>
    </div>
    <p class="workspace-disclaimer">{{ $t('landing.footer') }}</p>
  </section>
</template>
