<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue'
import { formatMessageTime } from '~/lib/format'
import MarkdownContent from '~/components/common/MarkdownContent.vue'
import MessageCardView from './cards/MessageCard.vue'
import { clarificationData } from '../agent-events'
import { useStreamingText } from '../composables/useStreamingText'
import type { DisplayMessage, MessageCard, ToolStatus } from '../types'
const props = defineProps<{
  latest?: boolean
  today?: Date
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
const previousQuestions = computed(() =>
  props.message.cards.flatMap((card) => {
    const data = clarificationData(card)
    return data && !data.answered && props.activeQuestionMessageId !== props.message.id
      ? [data]
      : []
  }),
)
const { locale, t } = useI18n()
const ready = computed(
  () => props.message.status !== 'streaming' && rendered.value === props.message.content,
)
const timestamp = computed(() =>
  formatMessageTime(props.message.created_at ?? '', locale.value, props.today),
)
const copyState = ref<'idle' | 'copied' | 'failed'>('idle')
const copying = ref(false)
let resetCopy: ReturnType<typeof setTimeout> | undefined
let disposed = false
async function copyMarkdown() {
  if (copying.value || !props.message.content) return
  copying.value = true
  try {
    await navigator.clipboard.writeText(props.message.content)
    if (!disposed) copyState.value = 'copied'
  } catch {
    if (!disposed) copyState.value = 'failed'
  } finally {
    copying.value = false
    if (!disposed) {
      clearTimeout(resetCopy)
      resetCopy = setTimeout(() => {
        copyState.value = 'idle'
      }, 2000)
    }
  }
}
onBeforeUnmount(() => {
  disposed = true
  clearTimeout(resetCopy)
})
</script>
<template>
  <article
    class="assistant-message"
    :data-message-id="message.id"
    :tabindex="ready ? 0 : undefined"
    :aria-label="$t('chat.assistant')"
  >
    <MarkdownContent
      v-if="rendered"
      class="markdown-prose"
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
      v-for="(data, index) in previousQuestions"
      :key="index"
      class="answered-questions"
    >
      <summary>
        {{ $t('chat.previousQuestions', { count: data.questions.length }) }}
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
    <footer
      v-if="ready && (message.content || cards.length || previousQuestions.length)"
      class="assistant-message-footer"
      :class="{ 'is-latest': latest }"
    >
      <button
        type="button"
        class="message-copy"
        :disabled="!message.content || copying"
        :aria-label="t('chat.copyMarkdown')"
        :title="t('chat.copyMarkdown')"
        @click="copyMarkdown"
      >
        <UIcon
          :name="copyState === 'copied' ? 'i-lucide-check' : 'i-lucide-copy'"
          aria-hidden="true"
        />
      </button>
      <time
        v-if="message.created_at"
        :datetime="message.created_at"
        :title="new Date(message.created_at).toLocaleString(locale)"
        >{{ timestamp }}</time
      >
      <span
        class="message-copy-feedback"
        role="status"
        >{{ copyState === 'failed' ? t('chat.copyFailed') : '' }}</span
      >
    </footer>
  </article>
</template>
