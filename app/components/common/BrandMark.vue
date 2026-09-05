<script setup lang="ts">
withDefaults(defineProps<{ wordmark?: boolean }>(), { wordmark: true })
</script>
<template>
  <span class="brand">
    <span
      class="brand-mark"
      aria-hidden="true"
    />
    <span v-if="wordmark">Trade Lab</span>
  </span>
</template>
