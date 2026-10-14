<script setup lang="ts">
import LoadingSpinner from '~/components/ui/LoadingSpinner.vue'
defineProps<{ label?: string; fill?: boolean }>()
</script>
<template>
  <div
    class="loading-state"
    :class="{ 'loading-state-fill': fill }"
    role="status"
    aria-live="polite"
  >
    <LoadingSpinner />
    <span class="sr-only">{{ label ?? $t('common.loading') }}</span>
  </div>
</template>
