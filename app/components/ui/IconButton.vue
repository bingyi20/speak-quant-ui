<script setup lang="ts">
defineProps<{ label: string; pressed?: boolean; disabled?: boolean }>()
</script>
<template>
  <button
    type="button"
    class="icon-button"
    :aria-label="label"
    :title="label"
    :aria-pressed="pressed"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>
