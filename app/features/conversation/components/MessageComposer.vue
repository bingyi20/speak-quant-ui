<script setup lang="ts">
import { ref, useId, useTemplateRef, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
const props = withDefaults(
  defineProps<{ blocked?: boolean; compact?: boolean; showHint?: boolean; placeholder?: string }>(),
  {
    blocked: false,
    compact: false,
    showHint: false,
    placeholder: undefined,
  },
)
const draft = defineModel<string>({ required: true })
const emit = defineEmits<{ submit: [] }>()
const id = useId()
const composing = ref(false)
const input = useTemplateRef<HTMLTextAreaElement>('input')
let observer: ResizeObserver | undefined
let frame = 0
function resize() {
  const el = input.value
  if (!el || !el.clientWidth) return
  const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight)
  const scrollTop = el.scrollTop
  el.style.height = 'auto'
  // With zero padding/border, scrollHeight measures rendered lines, including soft wraps.
  const rows = Math.max(props.compact ? 2 : 3, Math.round(el.scrollHeight / lineHeight))
  el.style.height = `${Math.min(16, rows) * lineHeight}px`
  el.style.overflowY = rows > 16 ? 'auto' : 'hidden'
  el.scrollTop = rows > 16 ? scrollTop : 0
}
function scheduleResize() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    resize()
  })
}
watch([draft, () => props.compact], scheduleResize, { flush: 'post' })
onMounted(() => {
  resize()
  let width = input.value?.getBoundingClientRect().width
  observer = new ResizeObserver(([entry]) => {
    const nextWidth = entry?.borderBoxSize[0]?.inlineSize
    if (nextWidth !== undefined && nextWidth !== width) {
      width = nextWidth
      scheduleResize()
    }
  })
  if (input.value) observer.observe(input.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(frame)
})
function submit() {
  if (!props.blocked && draft.value.trim()) emit('submit')
}
function keydown(event: KeyboardEvent) {
  if (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.isComposing &&
    !composing.value &&
    event.keyCode !== 229
  ) {
    event.preventDefault()
    submit()
  }
}
async function focus() {
  await nextTick()
  input.value?.focus()
  input.value?.setSelectionRange(draft.value.length, draft.value.length)
}
defineExpose({ focus })
</script>
<template>
  <form
    class="research-composer"
    @submit.prevent="submit"
  >
    <label
      :for="id"
      class="sr-only"
      >{{ $t('research.label') }}</label
    >
    <textarea
      :id="id"
      ref="input"
      v-model="draft"
      :placeholder="placeholder ?? $t('research.placeholder')"
      :rows="compact ? 2 : 3"
      @input="scheduleResize"
      @keydown="keydown"
      @compositionstart="composing = true"
      @compositionend="composing = false"
    />
    <div class="composer-bottom">
      <span v-if="showHint">{{ $t('research.hint') }}</span>
      <button
        type="submit"
        class="send-button"
        :disabled="blocked || !draft.trim()"
        :aria-label="$t('research.send')"
      >
        <UIcon name="i-lucide-arrow-up" />
      </button>
    </div>
  </form>
</template>
