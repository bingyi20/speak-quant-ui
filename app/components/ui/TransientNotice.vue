<script setup lang="ts">
defineProps<{ message: string }>()
const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
function hide() {
  clearTimeout(timer)
  visible.value = false
}
function show() {
  clearTimeout(timer)
  visible.value = true
  timer = setTimeout(hide, 2200)
}
onBeforeUnmount(hide)
defineExpose({ show })
</script>

<template>
  <div
    class="transient-notice"
    role="status"
    aria-live="polite"
  >
    <Transition name="transient-notice">
      <span v-if="visible">{{ message }}</span>
    </Transition>
  </div>
</template>
