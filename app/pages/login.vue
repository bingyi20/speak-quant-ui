<script setup lang="ts">
import LoginPlaceholder from '~/features/auth/components/LoginPlaceholder.vue'
definePageMeta({ layout: 'auth' })
const { t } = useI18n()
usePageSeo(
  () => `${t('nav.login')} · Trade Lab`,
  () => t('auth.subtitle'),
)
</script>
<template><LoginPlaceholder /></template>
