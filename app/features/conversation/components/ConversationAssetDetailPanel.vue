<script setup lang="ts">
import type { MessageCard } from '../types'
defineProps<{ open: boolean; selected: MessageCard | null; fullscreen: boolean; modal: boolean }>()
defineEmits<{ close: []; closed: []; back: []; fullscreen: [] }>()
</script>
<template>
  <Transition
    name="asset-detail-reveal"
    @after-leave="$emit('closed')"
  >
    <section
      v-show="open"
      class="asset-panel chat-asset-panel asset-detail-panel"
      :class="{ 'is-modal': modal }"
      :inert="!open || undefined"
      :aria-hidden="!open || undefined"
      :role="modal ? 'dialog' : 'region'"
      :aria-modal="modal || undefined"
      :aria-label="
        $t(selected?.type === 'strategy_card' ? 'conversation.strategy' : 'conversation.replay')
      "
      @keydown.esc.stop="$emit('close')"
    >
      <header>
        <div class="panel-title">
          <UiIconButton
            :label="$t('common.back')"
            @click="$emit('back')"
            ><UIcon name="i-lucide-arrow-left"
          /></UiIconButton>
          <h2>
            {{
              $t(
                selected?.type === 'strategy_card'
                  ? 'conversation.strategy'
                  : 'conversation.replay',
              )
            }}
          </h2>
        </div>
        <div class="panel-actions">
          <UiIconButton
            :label="fullscreen ? $t('common.exitFullscreen') : $t('common.fullscreen')"
            @click="$emit('fullscreen')"
            ><UIcon :name="fullscreen ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
          /></UiIconButton>
          <UiIconButton
            :label="$t('common.close')"
            @click="$emit('close')"
            ><UIcon name="i-lucide-x"
          /></UiIconButton>
        </div>
      </header>
      <div
        v-if="selected"
        class="panel-content"
      >
        <div class="asset-detail-heading">
          <UIcon
            :name="
              selected.type === 'strategy_card'
                ? 'i-lucide-file-text'
                : 'i-lucide-chart-no-axes-combined'
            "
          />
          <h3>{{ selected.title }}</h3>
          <p v-if="selected.summary">{{ selected.summary }}</p>
        </div>
        <div class="asset-detail-placeholder">
          <UIcon name="i-lucide-panel-right" />
          <p>{{ $t('chat.detailPending') }}</p>
        </div>
      </div>
    </section>
  </Transition>
</template>
<style scoped>
.asset-detail-panel {
  top: calc(4px - var(--workspace-toolbar-height));
  width: calc(var(--asset-detail-width) - 8px);
  z-index: 26;
}
.asset-detail-panel.is-modal {
  width: calc(100% - 8px);
}
.asset-detail-panel > header {
  height: 44px;
  min-height: 44px;
  padding: 0 12px;
}
.asset-detail-reveal-enter-active,
.asset-detail-reveal-leave-active {
  transition: transform var(--motion-asset-detail) cubic-bezier(0.2, 0, 0, 1);
}
.asset-detail-reveal-enter-from,
.asset-detail-reveal-leave-to {
  transform: translateX(calc(100% + 4px));
}
.asset-detail-reveal-leave-active {
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .asset-detail-reveal-enter-active,
  .asset-detail-reveal-leave-active {
    transition: none;
  }
}
</style>
