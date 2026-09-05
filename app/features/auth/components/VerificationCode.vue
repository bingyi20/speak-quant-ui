<script setup lang="ts">
const model = defineModel<string>({ required: true })
const props = defineProps<{ disabled?: boolean; invalid?: boolean }>()
const emit = defineEmits<(event: 'complete') => void>()
const inputs = useTemplateRef<HTMLInputElement[]>('digits')
function focus(index: number) {
  inputs.value?.[Math.max(0, Math.min(5, index))]?.focus()
}
function insert(text: string, index: number) {
  const digits = text.replace(/\D/g, '').slice(0, 6)
  if (!digits) return
  const start = digits.length === 6 ? 0 : Math.min(index, model.value.length)
  const next = (
    model.value.slice(0, start) +
    digits +
    model.value.slice(start + digits.length)
  ).slice(0, 6)
  model.value = next
  focus(Math.min(start + digits.length, next.length, 5))
  if (next.length === 6) nextTick(() => emit('complete'))
}
function input(event: Event, index: number) {
  const target = event.target as HTMLInputElement
  if (target.value) insert(target.value, index)
  else model.value = model.value.slice(0, index) + model.value.slice(index + 1)
  target.value = model.value[index] ?? ''
}
function keydown(event: KeyboardEvent, index: number) {
  if (event.key === 'Backspace') {
    event.preventDefault()
    const at = model.value[index] ? index : index - 1
    if (at >= 0) {
      model.value = model.value.slice(0, at) + model.value.slice(at + 1)
      focus(at)
    }
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    focus(index + (event.key === 'ArrowLeft' ? -1 : 1))
  }
}
function paste(event: ClipboardEvent, index: number) {
  event.preventDefault()
  insert(event.clipboardData?.getData('text') ?? '', index)
}
watch(model, (value) => {
  if (!value) nextTick(() => focus(0))
})
watch(
  () => props.disabled,
  (disabled) => {
    if (!disabled) nextTick(() => focus(Math.min(model.value.length, 5)))
  },
)
onMounted(() => {
  if (!props.disabled) focus(0)
})
</script>
<template>
  <div
    class="verification-code"
    role="group"
    :aria-label="$t('auth.codeLabel')"
  >
    <input
      v-for="(_, index) in 6"
      :key="index"
      ref="digits"
      :value="model[index] ?? ''"
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      :autocomplete="index === 0 ? 'one-time-code' : 'off'"
      :aria-label="$t('auth.codeDigit', { index: index + 1 })"
      :aria-invalid="invalid || undefined"
      aria-describedby="login-error code-help"
      :disabled="disabled"
      @input="input($event, index)"
      @keydown="keydown($event, index)"
      @paste="paste($event, index)"
      @focus="($event.target as HTMLInputElement).select()"
    />
  </div>
</template>
