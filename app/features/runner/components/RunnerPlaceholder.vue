<template>
  <div class="runner-placeholder">
    <UIcon name="i-lucide-package" />
    <div>
      <h3>{{ $t('conversation.download') }}</h3>
      <p>{{ $t('conversation.downloadHint') }}</p>
    </div>
    <button
      class="icon-button"
      disabled
      :aria-label="$t('conversation.download')"
    >
      <UIcon name="i-lucide-download" />
    </button>
  </div>
</template>
