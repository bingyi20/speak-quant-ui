<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
const props = defineProps<{ content: string; label: string }>()
const state = ref<'idle' | 'copied' | 'failed'>('idle')
const pending = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let generation = 0
function reset() {
  generation++
  clearTimeout(timer)
  state.value = 'idle'
  pending.value = false
}
async function copy() {
  const attempt = generation
  pending.value = true
  try {
    await navigator.clipboard.writeText(props.content)
    if (attempt === generation) state.value = 'copied'
  } catch {
    if (attempt === generation) state.value = 'failed'
  } finally {
    if (attempt === generation) {
      pending.value = false
      timer = setTimeout(() => {
        state.value = 'idle'
      }, 2000)
    }
  }
}
watch(() => props.content, reset)
onBeforeUnmount(reset)
</script>
<template>
  <span class="detail-copy">
    <UTooltip
      :text="label"
      :delay-duration="400"
    >
      <button
        type="button"
        class="detail-icon-button"
        :aria-label="label"
        :disabled="pending || !content"
        @click="copy"
      >
        <UIcon
          :name="state === 'copied' ? 'i-lucide-check' : 'i-lucide-copy'"
          aria-hidden="true"
        />
      </button>
    </UTooltip>
    <span
      :class="state === 'failed' ? 'detail-copy-error' : 'sr-only'"
      role="status"
    >
      {{
        state === 'failed' ? $t('chat.copyFailed') : state === 'copied' ? $t('strategy.copied') : ''
      }}
    </span>
  </span>
</template>
