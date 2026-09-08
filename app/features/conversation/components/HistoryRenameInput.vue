<script setup lang="ts">
const props = defineProps<{ title: string; pending?: boolean; retryRevision?: number }>()
const emit = defineEmits<{
  (event: 'commit', title: string, restoreFocus: boolean): void
  (event: 'cancel', restoreFocus: boolean): void
}>()
const draft = ref(props.title)
const field = useTemplateRef<HTMLInputElement>('field')
const hintId = useId()
let finished = false
watch(
  () => props.retryRevision,
  () => {
    finished = false
  },
)
const composing = ref(false)
let focusFrame: number | undefined
onMounted(() => {
  // Let the menu release its focus scope before focusing the inline editor.
  focusFrame = requestAnimationFrame(() => {
    field.value?.focus()
    field.value?.select()
  })
})
onBeforeUnmount(() => {
  if (focusFrame !== undefined) cancelAnimationFrame(focusFrame)
})
function commit(restoreFocus: boolean) {
  if (finished || props.pending) return
  finished = true
  if (draft.value.trim()) emit('commit', draft.value.trim(), restoreFocus)
  else emit('cancel', restoreFocus)
}
function keydown(event: KeyboardEvent) {
  if (event.isComposing || composing.value || event.keyCode === 229) return
  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    commit(true)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    finished = true
    emit('cancel', true)
  }
}
</script>
<template>
  <input
    ref="field"
    v-model="draft"
    class="history-rename-input"
    :aria-label="$t('history.titleLabel')"
    :aria-describedby="hintId"
    autocomplete="off"
    :disabled="pending"
    :aria-busy="pending"
    @keydown="keydown"
    @blur="commit(false)"
    @compositionstart="composing = true"
    @compositionend="composing = false"
  />
  <span
    :id="hintId"
    class="sr-only"
    >{{ $t('history.renameHint') }}</span
  >
</template>
