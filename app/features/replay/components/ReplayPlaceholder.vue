<template>
  <div>
    <div class="chart-placeholder">
      <CommonEmptyState
        :title="$t('conversation.replay')"
        :description="$t('conversation.replayEmpty')"
        ><template #icon
          ><UIcon
            name="i-lucide-chart-candlestick"
            class="empty-icon" /></template
      ></CommonEmptyState>
    </div>
    <div class="playback-placeholder">
      <button
        class="icon-button"
        disabled
        :aria-label="$t('conversation.replay')"
      >
        <UIcon name="i-lucide-play" /></button
      ><span>{{ $t('conversation.timeline') }}</span>
    </div>
  </div>
</template>
