<script setup lang="ts">
import { useTemplateRef, watch, nextTick, computed } from 'vue'
import { pendingClarification } from '../clarification'
import UserMessage from './UserMessage.vue'
import AssistantMessage from './AssistantMessage.vue'
import { useConversationScroll } from '../composables/useConversationScroll'
import type { DisplayMessage, MessageCard, ToolStatus } from '../types'
const props = defineProps<{
  messages: DisplayMessage[]
  tools: ToolStatus[]
  loading: boolean
  hasMore: boolean
  loadingMore: boolean
  moreError: string
  waiting: boolean
  selectedCardId?: string
  retryDisabled: boolean
  loadMore: () => Promise<void>
}>()
defineEmits<{ open: [messageId: string, card: MessageCard]; retry: [] }>()
const activeQuestionMessageId = computed(() => pendingClarification(props.messages)?.messageId)
const viewport = useTemplateRef<HTMLElement>('viewport')
const content = useTemplateRef<HTMLElement>('content')
const { following, bottom, onScroll, prepend } = useConversationScroll(viewport, content)
watch(
  () => props.loading,
  async (loading) => {
    if (!loading) {
      await nextTick()
      bottom()
    }
  },
)
watch(
  () => props.messages.findLast((m) => m.role === 'user')?.id,
  async () => {
    if (props.loadingMore) return
    const latest = props.messages.findLast((m) => m.role === 'user')
    if (!latest?.localPending && !following.value) return
    await nextTick()
    bottom()
  },
)
defineExpose({ bottom })
</script>
<template>
  <div class="message-list-shell">
    <div
      ref="viewport"
      class="message-scroll"
      :aria-label="$t('chat.messages')"
      @scroll.passive="onScroll"
    >
      <div
        ref="content"
        class="message-list"
      >
        <div
          v-if="hasMore"
          class="load-earlier"
        >
          <button
            class="text-button"
            :disabled="loadingMore"
            @click="prepend(loadMore)"
          >
            {{ $t(loadingMore ? 'common.loading' : 'chat.loadEarlier') }}
          </button>
          <p
            v-if="moreError"
            class="chat-error"
          >
            {{ $t(moreError) }}
          </p>
        </div>
        <template
          v-for="message in messages"
          :key="message.id"
        >
          <UserMessage
            v-if="message.role === 'user'"
            :message="message"
            :retry-disabled="retryDisabled"
            @retry="$emit('retry')"
          />
          <AssistantMessage
            v-else-if="message.role === 'assistant'"
            :message="message"
            :tools="tools.filter((t) => t.message_id === message.id)"
            :selected-card-id="selectedCardId"
            :active-question-message-id="activeQuestionMessageId"
            @open="$emit('open', message.id, $event)"
          />
          <p
            v-else-if="!['system', 'tool'].includes(message.role)"
            class="unknown-message"
          >
            {{ message.content }}
          </p>
        </template>
        <div
          v-if="waiting || loading"
          class="reply-waiting"
          role="status"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="chat-spinner"
          /><span class="sr-only">{{ $t('chat.replying') }}</span>
        </div>
      </div>
    </div>
    <button
      v-if="!following && messages.length"
      type="button"
      class="jump-latest"
      :aria-label="$t('chat.latest')"
      @click="bottom"
    >
      <UIcon
        name="i-lucide-arrow-down"
        aria-hidden="true"
      />
    </button>
  </div>
</template>
