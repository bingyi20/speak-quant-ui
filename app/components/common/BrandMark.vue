<script setup lang="ts">
withDefaults(defineProps<{ wordmark?: boolean }>(), { wordmark: true })
</script>
<template>
  <span class="brand"
    ><svg
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M9 21v11m-4-6h8M20 8v28m-5-19h10M31 4v21m-4-12h8" /></svg
    ><span v-if="wordmark">Trade Lab</span></span
  >
</template>
