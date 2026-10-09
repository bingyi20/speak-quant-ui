<script setup lang="ts">
import { ConversationWorkspace } from '~/features/conversation'
definePageMeta({ layout: 'workspace', middleware: 'auth' })
defineI18nRoute(false)
const { t } = useI18n()
const route = useRoute()
usePageSeo(
  () => `${t('conversation.title')} · SpeakQuant`,
  () => t('conversation.emptyDescription'),
)
</script>
<template>
  <ConversationWorkspace
    :key="String(route.params.id)"
    :conversation-id="String(route.params.id)"
  />
</template>
