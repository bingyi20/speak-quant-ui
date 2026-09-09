<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, useTemplateRef, watch } from 'vue'
import { useClarification } from '../composables/useClarification'
import {
  clarificationSubmission,
  validClarificationAnswer,
  type ClarificationGroup,
} from '../clarification'
import type { MessageSubmission } from '../types'
const props = defineProps<{ group: ClarificationGroup; blocked: boolean; conversationId: string }>()
const expanded = defineModel<boolean>('expanded', { default: true })
const emit = defineEmits<{
  submit: [body: MessageSubmission, display: string]
  close: []
  collapse: [element: Element, done: () => void]
}>()
const drafts = useClarification(() => props.group, props.conversationId)
const questions = computed(() => props.group.cards.flatMap((c) => c.data.questions))
const currentId = ref(questions.value[0]?.id)
const index = computed(() =>
  Math.max(
    0,
    questions.value.findIndex((q) => q.id === currentId.value),
  ),
)
const question = computed(() => questions.value[index.value])
const answer = computed(() => clarificationSubmission(props.group, drafts))
const last = computed(() => index.value === questions.value.length - 1)
const { t } = useI18n()
const tooLong = computed(
  () =>
    question.value &&
    drafts[question.value.id]?.mode === 'custom' &&
    Array.from(drafts[question.value.id]!.text.trim()).length > 2000,
)
const titleId = useId()
const title = useTemplateRef<HTMLElement>('title')
const custom = useTemplateRef<HTMLTextAreaElement>('custom')
const body = useTemplateRef<HTMLElement>('body')
const composing = ref(false)
const customText = computed({
  get: () =>
    question.value && drafts[question.value.id]?.mode === 'custom'
      ? drafts[question.value.id]!.text
      : '',
  set: (text: string) => {
    if (question.value) drafts[question.value.id] = { mode: 'custom', text }
  },
})
function resizeCustom() {
  const el = custom.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(120, Math.max(24, el.scrollHeight))}px`
}
watch(customText, resizeCustom, { flush: 'post' })
watch(
  custom,
  (el, _, onCleanup) => {
    if (!el) return
    resizeCustom()
    let width = el.clientWidth
    const observer = new ResizeObserver(() => {
      if (width === el.clientWidth) return
      width = el.clientWidth
      resizeCustom()
    })
    observer.observe(el)
    onCleanup(() => observer.disconnect())
  },
  { flush: 'post' },
)
function customKeydown(event: KeyboardEvent) {
  if (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.isComposing &&
    !composing.value &&
    event.keyCode !== 229
  ) {
    event.preventDefault()
    if (!event.repeat) proceed()
  }
}

async function focusTitle() {
  await nextTick()
  if (body.value) body.value.scrollTop = 0
  title.value?.focus({ preventScroll: true })
}
function go(next: number) {
  const target = questions.value[next]
  if (!target) return
  currentId.value = target.id
  void focusTitle()
}
function choose(option: string) {
  if (!question.value) return
  drafts[question.value.id] = { mode: 'option', text: option }
  advance()
}
async function chooseCustom() {
  if (!question.value) return
  if (drafts[question.value.id]?.mode !== 'custom')
    drafts[question.value.id] = { mode: 'custom', text: '' }
  await nextTick()
  custom.value?.focus({ preventScroll: true })
}
function advance() {
  if (!last.value) return go(index.value + 1)
  if (!props.blocked && answer.value)
    emit('submit', answer.value.body, answer.value.display || t('chat.skippedQuestions'))
}
function proceed() {
  if (!question.value || !validClarificationAnswer(question.value, drafts[question.value.id]))
    return
  advance()
}
function skip() {
  if (!question.value || (last.value && props.blocked)) return
  Reflect.deleteProperty(drafts, question.value.id)
  advance()
}
function close() {
  expanded.value = false
  emit('close')
}
function shortcut(event: KeyboardEvent) {
  if (
    event.isComposing ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement
  )
    return
  const choice = Number(event.key) - 1
  if (!/^[1-9]$/.test(event.key) || !question.value) return
  const option = question.value.options[choice]
  if (option !== undefined) {
    event.preventDefault()
    choose(option)
  } else if (choice === question.value.options.length && question.value.allow_custom) {
    event.preventDefault()
    void chooseCustom()
  }
}
watch(expanded, (value) => {
  if (value) void focusTitle()
})
watch(
  () => questions.value.map((q) => q.id),
  (ids) => {
    if (!ids.includes(currentId.value ?? '')) currentId.value = ids[0]
  },
)
onMounted(() => {
  // Restore the first unanswered question, or the last question when all have drafts.
  const hasSavedAnswer = questions.value.some((q) => validClarificationAnswer(q, drafts[q.id]))
  const missing = questions.value.findIndex((q) => !validClarificationAnswer(q, drafts[q.id]))
  const initial = missing >= 0 ? missing : hasSavedAnswer ? questions.value.length - 1 : 0
  currentId.value = questions.value[initial]?.id
})
</script>
<template>
  <Transition
    :css="false"
    @leave="(el, done) => emit('collapse', el, done)"
  >
    <form
      v-if="expanded && question"
      class="clarification-questions"
      :aria-label="$t('chat.questions')"
      @submit.prevent="proceed"
      @keydown="shortcut"
    >
      <header class="question-header">
        <h3
          :id="titleId"
          ref="title"
          tabindex="-1"
        >
          {{ question.question }}
        </h3>
        <div class="question-navigation">
          <button
            type="button"
            class="question-icon-button"
            :aria-label="$t('chat.previousQuestion')"
            :disabled="index === 0"
            @click="go(index - 1)"
          >
            <UIcon name="i-lucide-chevron-left" />
          </button>
          <span
            class="question-progress"
            role="status"
            :aria-label="
              $t('chat.questionProgress', { current: index + 1, total: questions.length })
            "
            >{{ index + 1 }} / {{ questions.length }}</span
          >
          <button
            type="button"
            class="question-icon-button"
            :aria-label="$t('chat.nextQuestion')"
            :disabled="last"
            @click="go(index + 1)"
          >
            <UIcon name="i-lucide-chevron-right" />
          </button>
          <button
            type="button"
            class="question-icon-button"
            :aria-label="$t('chat.closeQuestions')"
            @click="close"
          >
            <UIcon name="i-lucide-x" />
          </button>
        </div>
      </header>
      <div
        ref="body"
        class="question-body"
        role="group"
        :aria-labelledby="titleId"
      >
        <div
          :key="question.id"
          class="question-options"
        >
          <button
            v-for="(option, optionIndex) in question.options"
            :key="option"
            type="button"
            class="question-option"
            :aria-pressed="
              drafts[question.id]?.mode === 'option' && drafts[question.id]?.text === option
            "
            @click="choose(option)"
          >
            <span
              class="question-number"
              aria-hidden="true"
              >{{ optionIndex + 1 }}</span
            ><span>{{ option }}</span>
            <UIcon
              v-if="drafts[question.id]?.mode === 'option' && drafts[question.id]?.text === option"
              name="i-lucide-check"
              class="question-check"
            />
          </button>
        </div>
      </div>
      <footer class="question-submit">
        <div
          class="question-answer-row"
          :class="{ 'has-custom': question.allow_custom }"
        >
          <button
            v-if="question.allow_custom"
            type="button"
            class="question-number question-custom-trigger"
            :aria-label="$t('chat.customAnswer')"
            @click="chooseCustom"
          >
            <UIcon
              name="i-lucide-pencil"
              class="question-custom-icon"
            />
          </button>
          <textarea
            v-if="question.allow_custom"
            :key="question.id"
            ref="custom"
            v-model="customText"
            rows="1"
            class="question-custom"
            :aria-label="question.question"
            :placeholder="$t('chat.customAnswerPlaceholder')"
            :aria-invalid="tooLong || undefined"
            :aria-describedby="tooLong ? `${titleId}-error` : undefined"
            @keydown="customKeydown"
            @compositionstart="composing = true"
            @compositionend="composing = false"
          />
          <button
            type="button"
            class="question-submit-button"
            @click="skip"
          >
            {{ $t('chat.skipQuestion') }}
          </button>
        </div>
        <p
          v-if="tooLong"
          :id="`${titleId}-error`"
          class="chat-error"
          role="alert"
        >
          {{ $t('chat.answerTooLong') }}
        </p>
      </footer>
    </form>
  </Transition>
</template>
