<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
const props = withDefaults(
  defineProps<{
    min?: number
    max?: number
    enabled?: boolean
    resizable?: boolean
    rightWidth?: string
  }>(),
  { min: 30, max: 70, enabled: true, resizable: true, rightWidth: undefined },
)
const ratio = defineModel<number>({ default: 50 })
const transitioning = ref(false)
watch(
  () => [props.enabled, props.rightWidth] as const,
  async (_, __, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    transitioning.value = true
    await nextTick()
    await Promise.allSettled(
      root.value?.getAnimations().map((animation) => animation.finished) ?? [],
    )
    if (!cancelled) transitioning.value = false
  },
  { flush: 'sync' },
)
const root = ref<HTMLElement>()
const dragging = ref(false)
const hovered = ref(false)
const pointer = ref({ x: 0, y: 0 })
const tooltipId = useId()
const hintReady = ref(false)
const canShowHint = computed(
  () => props.enabled && props.resizable && hovered.value && !dragging.value,
)
const showHint = computed(() => canShowHint.value && hintReady.value)
watch(
  canShowHint,
  (show, _, onCleanup) => {
    hintReady.value = false
    if (!show) return
    const timer = setTimeout(() => {
      hintReady.value = true
    }, 400)
    onCleanup(() => clearTimeout(timer))
  },
  { flush: 'sync' },
)
let grabOffset = 0
function update(value: number) {
  ratio.value = Math.max(props.min, Math.min(props.max, value))
}
function move(event: PointerEvent) {
  if (!root.value) return
  if (!dragging.value) {
    hovered.value = event.pointerType === 'mouse' && event.buttons === 0
    pointer.value = { x: event.clientX, y: event.clientY }
    return
  }
  const bounds = root.value.getBoundingClientRect()
  update(((event.clientX - bounds.left - grabOffset) / bounds.width) * 100)
}
function start(event: PointerEvent) {
  if (event.button !== 0 || !event.isPrimary || !root.value) return
  event.preventDefault()
  const bounds = root.value.getBoundingClientRect()
  grabOffset = event.clientX - bounds.left - (ratio.value / 100) * bounds.width
  dragging.value = true
  hovered.value = false
  const handle = event.currentTarget as HTMLElement
  handle.focus({ preventScroll: true })
  handle.setPointerCapture(event.pointerId)
}
function stop(event: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  hovered.value =
    event.type === 'pointerup' &&
    event.pointerType === 'mouse' &&
    event.clientX >= bounds.left &&
    event.clientX <= bounds.right &&
    event.clientY >= bounds.top &&
    event.clientY <= bounds.bottom
  pointer.value = { x: event.clientX, y: event.clientY }
}
watch(
  () => props.enabled && props.resizable,
  () => {
    dragging.value = false
    hovered.value = false
  },
)
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
    :class="{ 'is-dragging': dragging, 'is-transitioning': transitioning }"
    :style="{
      gridTemplateColumns: `minmax(0, 1fr) minmax(0, ${enabled ? rightWidth || `${100 - ratio}%` : '0px'})`,
    }"
  >
    <div><slot name="left" /></div>
    <div
      class="split-right"
      :inert="!enabled || undefined"
      :aria-hidden="!enabled || undefined"
    >
      <div
        v-if="enabled && resizable"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        :aria-label="$t('common.resize')"
        :aria-describedby="showHint ? tooltipId : undefined"
        :aria-valuenow="Math.round(ratio)"
        :aria-valuemin="min"
        :aria-valuemax="max"
        class="split-handle"
        :class="{ 'is-hovered': hovered }"
        @pointerenter="move"
        @pointerleave="hovered = false"
        @pointerdown="start"
        @pointermove="move"
        @pointerup="stop"
        @pointercancel="stop"
        @lostpointercapture="stop"
        @keydown="keydown"
      >
        <span
          class="split-grip"
          aria-hidden="true"
        />
      </div>
      <slot name="right" />
    </div>
    <Teleport to="body">
      <span
        v-if="showHint"
        :id="tooltipId"
        class="split-tooltip"
        role="tooltip"
        :style="{
          left: `${pointer.x - 12}px`,
          top: `clamp(24px, ${pointer.y}px, calc(100dvh - 24px))`,
        }"
        >{{ $t('common.dragToResize') }}</span
      >
    </Teleport>
  </div>
</template>
<style scoped>
.split-pane {
  display: grid;
  container-type: inline-size;
  min-width: 0;
  height: 100%;
}
.split-pane.is-transitioning:not(.is-dragging) {
  transition: grid-template-columns var(--split-motion, var(--motion-panel))
    cubic-bezier(0.2, 0, 0, 1);
}
@media (prefers-reduced-motion: reduce) {
  .split-pane.is-transitioning {
    transition: none;
  }
}
.split-pane > div {
  min-width: 0;
  min-height: 0;
}
.split-right {
  position: relative;
}
.is-dragging {
  cursor: col-resize;
  user-select: none;
}
.split-handle {
  cursor: col-resize;
  touch-action: none;
  position: absolute;
  top: var(--split-edge-top, 0px);
  bottom: var(--split-edge-bottom, 0px);
  left: var(--split-edge-left, 0px);
  width: 10px;
  transform: translateX(-50%);
  z-index: 30;
}
.split-grip {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 3px;
  height: 48px;
  border-radius: 3px;
  background: var(--color-text-muted);
  opacity: 0;
  pointer-events: none;
}
.split-handle.is-hovered .split-grip,
.split-handle:focus-visible .split-grip {
  opacity: 0.4;
}
.split-pane.is-dragging .split-grip {
  background: var(--color-text-secondary);
  opacity: 1;
}
.split-handle:focus-visible {
  outline: none;
}
.split-tooltip {
  position: fixed;
  z-index: 70;
  transform: translate(-100%, -50%);
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--color-text-primary);
  color: var(--color-bg-surface);
  box-shadow: var(--shadow-panel);
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
  pointer-events: none;
}
</style>
