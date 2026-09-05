<script setup lang="ts">
import { ConversationPlaceholder } from '~/features/conversation'
definePageMeta({ layout: 'workspace', middleware: 'auth' })
const { t } = useI18n()
const route = useRoute()
usePageSeo(
  () => `${t('conversation.title')} · Trade Lab`,
  () => t('conversation.emptyDescription'),
)
</script>
<template><ConversationPlaceholder :key="String(route.params.id)" /></template>
