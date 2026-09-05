<script setup lang="ts">
const props = withDefaults(defineProps<{ min?: number; max?: number }>(), { min: 30, max: 70 })
const ratio = defineModel<number>({ default: 50 })
const root = ref<HTMLElement>()
const dragging = ref(false)
function update(value: number) {
  ratio.value = Math.max(props.min, Math.min(props.max, value))
}
function move(event: PointerEvent) {
  if (!dragging.value || !root.value) return
  const bounds = root.value.getBoundingClientRect()
  update(((event.clientX - bounds.left) / bounds.width) * 100)
}
function start(event: PointerEvent) {
  dragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function stop() {
  dragging.value = false
}
function keydown(event: KeyboardEvent) {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    update(
      event.key === 'Home'
        ? props.min
        : event.key === 'End'
          ? props.max
          : ratio.value + (event.key === 'ArrowLeft' ? -2 : 2),
    )
  }
}
</script>
<template>
  <div
    ref="root"
    class="split-pane"
    :style="{ gridTemplateColumns: `minmax(0, ${ratio}fr) 12px minmax(0, ${100 - ratio}fr)` }"
  >
    <div><slot name="left" /></div>
    <div
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      :aria-label="$t('common.resize')"
      :aria-valuenow="Math.round(ratio)"
      :aria-valuemin="min"
      :aria-valuemax="max"
      class="split-handle"
      @pointerdown="start"
      @pointermove="move"
      @pointerup="stop"
      @pointercancel="stop"
      @lostpointercapture="stop"
      @keydown="keydown"
    />
    <div><slot name="right" /></div>
  </div>
</template>
<style scoped>
.split-pane {
  display: grid;
  min-width: 0;
  height: 100%;
}
.split-handle {
  cursor: col-resize;
  touch-action: none;
  position: relative;
}
.split-handle::after {
  content: '';
  position: absolute;
  inset: 0 5px;
  background: var(--color-border-default);
}
.split-handle:focus-visible {
  outline: 2px solid var(--color-border-focus);
}
</style>
