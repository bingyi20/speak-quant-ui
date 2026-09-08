<script setup lang="ts">
import { computed } from 'vue'
import MarkdownContent from '~/components/common/MarkdownContent.vue'
import MessageCardView from './cards/MessageCard.vue'
import { clarificationData } from '../agent-events'
import { useStreamingText } from '../composables/useStreamingText'
import type { DisplayMessage, MessageCard, ToolStatus } from '../types'
const props = defineProps<{
  message: DisplayMessage
  tools: ToolStatus[]
  selectedCardId?: string
  activeQuestionMessageId?: string
}>()
defineEmits<{ open: [card: MessageCard] }>()
const rendered = useStreamingText(
  () => props.message.content,
  () => props.message.status,
  () => (props.message.fromSnapshot ? props.message : undefined),
)
const cards = computed(() =>
  props.message.cards.filter(
    (card) => card.type !== 'clarification_card' || !clarificationData(card),
  ),
)
const answered = computed(() =>
  props.message.cards.flatMap((card) => {
    const data = clarificationData(card)
    return data && (data.answered || props.activeQuestionMessageId !== props.message.id)
      ? [data]
      : []
  }),
)
</script>
<template>
  <article
    class="assistant-message"
    :data-message-id="message.id"
    :aria-label="$t('chat.assistant')"
  >
    <MarkdownContent
      v-if="rendered"
      :content="rendered"
    />
    <ul
      v-if="message.status === 'streaming' || tools.length"
      class="tool-statuses"
      :class="{ 'is-empty': !tools.length }"
      aria-live="polite"
    >
      <li
        v-for="tool in tools"
        :key="tool.id"
      >
        <UIcon
          :name="
            tool.status === 'running'
              ? 'i-lucide-loader-circle'
              : tool.status === 'failed'
                ? 'i-lucide-circle-alert'
                : 'i-lucide-check'
          "
          :class="{ 'chat-spinner': tool.status === 'running' }"
        />{{ tool.label }}
      </li>
    </ul>
    <div
      v-if="cards.length"
      class="message-cards"
    >
      <MessageCardView
        v-for="card in cards"
        :key="card.id"
        :card="card"
        :selected="selectedCardId === card.id"
        @open="$emit('open', $event)"
      />
    </div>
    <details
      v-for="(data, index) in answered"
      :key="index"
      class="answered-questions"
    >
      <summary>
        {{
          $t(data.answered ? 'chat.answered' : 'chat.previousQuestions', {
            count: data.answered ? data.answers.length : data.questions.length,
          })
        }}
      </summary>
      <dl>
        <template
          v-for="question in data.questions"
          :key="question.id"
          ><dt>{{ question.question }}</dt>
          <dd>
            {{
              data.answers.find((a) => a.question_id === question.id)?.value ??
              data.answers.find((a) => a.question_id === question.id)?.custom_text ??
              '—'
            }}
          </dd></template
        >
      </dl>
    </details>
    <p
      v-if="message.status === 'failed' || message.status === 'cancelled'"
      class="chat-error"
    >
      {{ $t(message.status === 'failed' ? 'chat.replyFailed' : 'chat.replyCancelled') }}
    </p>
  </article>
</template>
