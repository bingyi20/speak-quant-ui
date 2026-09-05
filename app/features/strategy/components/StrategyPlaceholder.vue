<script setup lang="ts">
import { RunnerPlaceholder } from '~/features/runner'
</script>
<template>
  <div>
    <CommonEmptyState
      :title="$t('conversation.strategy')"
      :description="$t('conversation.strategyEmpty')"
      ><template #icon
        ><UIcon
          name="i-lucide-file-text"
          class="empty-icon" /></template></CommonEmptyState
    ><RunnerPlaceholder />
  </div>
</template>
