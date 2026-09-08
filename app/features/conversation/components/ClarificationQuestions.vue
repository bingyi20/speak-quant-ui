<script setup lang="ts">
import { computed } from 'vue'
import { useClarification } from '../composables/useClarification'
import { clarificationSubmission, type ClarificationGroup } from '../clarification'
import type { MessageSubmission } from '../types'
const props = defineProps<{ group: ClarificationGroup; blocked: boolean; conversationId: string }>()
const emit = defineEmits<{ submit: [body: MessageSubmission, display: string] }>()
const drafts = useClarification(() => props.group, props.conversationId)
const questions = computed(() => props.group.cards.flatMap((c) => c.data.questions))
const answer = computed(() => clarificationSubmission(props.group, drafts))
function submit() {
  if (!props.blocked && answer.value) emit('submit', answer.value.body, answer.value.display)
}
</script>
<template>
  <form
    class="clarification-questions"
    :aria-label="$t('chat.questions')"
    @submit.prevent="submit"
  >
    <fieldset
      v-for="(question, index) in questions"
      :key="question.id"
    >
      <legend>
        <span
          v-if="questions.length > 1"
          class="question-number"
          >{{ index + 1 }}</span
        >{{ question.question }}<small v-if="!question.required">{{ $t('chat.optional') }}</small>
      </legend>
      <div class="question-options">
        <button
          v-for="option in question.options"
          :key="option"
          type="button"
          class="question-option"
          :aria-pressed="
            drafts[question.id]?.mode === 'option' && drafts[question.id]?.text === option
          "
          @click="drafts[question.id] = { mode: 'option', text: option }"
        >
          {{ option }}
        </button>
        <button
          v-if="question.allow_custom"
          type="button"
          class="question-option"
          :aria-pressed="drafts[question.id]?.mode === 'custom'"
          @click="drafts[question.id] = { mode: 'custom', text: '' }"
        >
          {{ $t('chat.customAnswer') }}
        </button>
      </div>
      <input
        v-if="drafts[question.id]?.mode === 'custom'"
        v-model="drafts[question.id]!.text"
        type="text"
        class="question-custom"
        :aria-label="question.question"
        :placeholder="$t('chat.answerPlaceholder')"
      />
    </fieldset>
    <div class="question-submit">
      <button
        type="submit"
        class="question-submit-button"
        :disabled="blocked || !answer"
      >
        {{ $t('chat.submitAnswers') }}<UIcon name="i-lucide-arrow-up" />
      </button>
    </div>
  </form>
</template>
