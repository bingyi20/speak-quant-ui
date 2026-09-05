<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>
<template>
  <div class="empty-state">
    <slot name="icon"
      ><UIcon
        name="i-lucide-orbit"
        class="empty-icon"
    /></slot>
    <h2>{{ title }}</h2>
    <p v-if="description">{{ description }}</p>
    <slot />
  </div>
</template>
