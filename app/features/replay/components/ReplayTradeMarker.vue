<script setup lang="ts">
defineProps<{
  side: 'buy' | 'sell'
  direction?: string
  label: string
  disabled?: boolean
}>()
</script>

<template>
  <button
    type="button"
    class="replay-trade-marker"
    :aria-label="label"
    :disabled="disabled"
  >
    <span
      class="replay-event-dot"
      :class="[`is-${side}`, { 'is-short': direction === 'short' }]"
      aria-hidden="true"
    />
  </button>
</template>

<style scoped>
.replay-trade-marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
}
.replay-trade-marker .replay-event-dot {
  transition: transform 120ms ease;
}
.replay-trade-marker:not(:disabled):hover .replay-event-dot,
.replay-trade-marker:not(:disabled):focus-visible .replay-event-dot {
  transform: scale(1.3);
}
@media (prefers-reduced-motion: reduce) {
  .replay-trade-marker .replay-event-dot {
    transition: none;
  }
}
</style>
