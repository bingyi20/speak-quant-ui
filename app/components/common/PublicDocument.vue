<script setup lang="ts">
import { LEGAL_UPDATED_AT } from '#shared/public-site'
defineProps<{ title: string; intro: string }>()
</script>
<template>
  <article class="public-document">
    <header class="public-document-heading">
      <h1>{{ title }}</h1>
      <p class="public-document-date">
        <time :datetime="LEGAL_UPDATED_AT">{{
          $t('publicSite.updated', { date: LEGAL_UPDATED_AT })
        }}</time>
        · {{ $t('legal.draftLabel') }}
      </p>
      <p>{{ intro }}</p>
      <p class="public-document-draft">{{ $t('publicSite.draft') }}</p>
    </header>
    <div class="public-document-body"><slot /></div>
  </article>
</template>
