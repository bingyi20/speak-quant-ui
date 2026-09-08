<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { useResearchEntry } from '../composables/useResearchEntry'
import MessageComposer from './MessageComposer.vue'
withDefaults(
  defineProps<{
    compact?: boolean
    showHint?: boolean
    showExamples?: boolean
    placeholder?: string
  }>(),
  { compact: false, showHint: true, placeholder: undefined, showExamples: undefined },
)
const { draft, error, busy, intent, canEdit, blocked, submit, retry, dismiss } = useResearchEntry()
const { t } = useI18n()
const composer = useTemplateRef('composer')
function chooseExample(n: number) {
  draft.value = t(`research.prompt${n}`)
  void composer.value?.focus()
}
</script>
<template>
  <div class="research-entry">
    <MessageComposer
      ref="composer"
      v-model="draft"
      :compact="compact"
      :show-hint="showHint"
      :placeholder="placeholder"
      :blocked="blocked"
      @submit="submit"
    />
    <div
      v-if="intent"
      class="entry-submission"
    >
      <p class="entry-submission-text">{{ intent.display }}</p>
      <p
        v-if="error"
        class="chat-error"
        role="alert"
      >
        {{ $t(error) }}
      </p>
      <div
        v-if="!busy"
        class="chat-inline-actions"
      >
        <button
          class="text-button"
          @click="retry"
        >
          {{
            $t(
              intent.kind === 'message'
                ? 'chat.openOriginal'
                : intent.acceptedConversationId
                  ? 'chat.openConversation'
                  : 'common.retry',
            )
          }}
        </button>
        <button
          v-if="canEdit"
          class="text-button"
          @click="dismiss"
        >
          {{ $t('chat.editDraft') }}
        </button>
      </div>
    </div>
    <p
      v-else-if="error"
      class="chat-error"
      role="alert"
    >
      {{ $t(error) }}
    </p>
    <div
      v-if="showExamples ?? !compact"
      class="quick-examples"
    >
      <button
        v-for="n in 4"
        :key="n"
        @click="chooseExample(n)"
      >
        <svg
          viewBox="0 0 64 28"
          fill="none"
          aria-hidden="true"
        >
          <path
            :d="
              [
                'M2 24L12 19L20 21L28 11L39 15L47 6L56 10L63 2',
                'M2 25L13 23L24 24L32 21L40 23L46 10L53 12L63 2',
                'M2 6L13 16L23 23L33 24L43 19L52 6L63 9',
                'M2 24L13 18L22 20L32 12L44 14L53 5L63 2',
              ][n - 1]
            "
            stroke="currentColor"
            stroke-width="1.6"
          /></svg
        ><span>{{ $t(`research.example${n}`) }}<UIcon name="i-lucide-arrow-up-right" /></span>
      </button>
    </div>
  </div>
</template>
