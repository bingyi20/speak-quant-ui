<script setup lang="ts">
import LoginView from '~/features/auth/components/LoginView.vue'
definePageMeta({ layout: 'auth' })
const { t } = useI18n()
usePageSeo(
  () => `${t('nav.login')} · Trade Lab`,
  () => t('auth.subtitle'),
)
</script>
<template><LoginView /></template>
