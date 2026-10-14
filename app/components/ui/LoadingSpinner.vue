<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{ size?: 'sm' | 'md'; decorative?: boolean; startedAt?: number }>(),
  { size: 'md', decorative: true, startedAt: undefined },
)
const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  const remaining = Math.max(0, 200 - (Date.now() - (props.startedAt ?? Date.now())))
  if (!remaining) {
    visible.value = true
    return
  }
  timer = setTimeout(() => {
    visible.value = true
  }, remaining)
})
onBeforeUnmount(() => clearTimeout(timer))
</script>
<template>
  <span
    class="loading-spinner"
    :class="{ 'loading-spinner-sm': size === 'sm', 'is-delayed': !visible }"
    :aria-hidden="decorative || !visible || undefined"
    :role="decorative || !visible ? undefined : 'status'"
  >
    <span
      v-if="!decorative"
      class="sr-only"
      >{{ $t('common.loading') }}</span
    >
  </span>
</template>
