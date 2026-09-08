<script setup lang="ts">
import type { DisplayMessage } from '../types'
defineProps<{ message: DisplayMessage; retryDisabled?: boolean }>()
defineEmits<{ retry: [] }>()
</script>
<template>
  <article
    class="user-message"
    :data-message-id="message.id"
    :aria-label="$t('chat.you')"
  >
    <div class="user-bubble">{{ message.content }}</div>
    <button
      v-if="message.localFailure"
      class="message-retry"
      :disabled="retryDisabled"
      :aria-label="$t('chat.retryMessage')"
      @click="$emit('retry')"
    >
      <UIcon name="i-lucide-circle-alert" />{{ $t('chat.failed') }}
    </button>
  </article>
</template>
