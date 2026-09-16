<script setup lang="ts">
import { computed } from 'vue'
import type { ConversationAssets, MessageCard } from '../types'
import AssetCard from './cards/MessageCard.vue'
const props = defineProps<{
  id: string
  open: boolean
  assets: ConversationAssets | null
  loading: boolean
  error: string
  modal: boolean
}>()
defineEmits<{ close: []; closed: []; retry: []; more: []; open: [card: MessageCard] }>()
const more = computed(
  () => props.assets && props.assets.replays.page < props.assets.replays.total_pages,
)
const strategyCard = computed<MessageCard | null>(() => {
  const strategy = props.assets?.strategy
  return strategy
    ? {
        id: `asset:${strategy.id}`,
        type: 'strategy_card',
        status: strategy.status,
        title: strategy.name,
        resource_id: strategy.id,
        summary: null,
        data: null,
      }
    : null
})
const replayCards = computed<MessageCard[]>(() =>
  (props.assets?.replays.items ?? []).map((replay) => ({
    id: `asset:${replay.id}`,
    type: 'replay_card',
    resource_id: replay.id,
    title: replay.name,
    status: '',
    summary: `${replay.symbol} · ${replay.execution_timeframe}`,
    data: null,
  })),
)
</script>
<template>
  <Transition
    name="asset-list-reveal"
    @after-leave="$emit('closed')"
  >
    <section
      v-show="open"
      :id="id"
      class="asset-panel chat-asset-panel asset-list-panel"
      :class="{ 'is-modal': modal }"
      :inert="!open || undefined"
      :aria-hidden="!open || undefined"
      :role="modal ? 'dialog' : 'region'"
      :aria-modal="modal || undefined"
      :aria-label="$t('conversation.assetTitle')"
      @keydown.esc.stop="$emit('close')"
    >
      <header>
        <h2>{{ $t('conversation.assetTitle') }}</h2>
      </header>
      <div class="panel-content">
        <p
          v-if="loading && !assets"
          class="chat-muted"
          role="status"
        >
          {{ $t('common.loading') }}
        </p>
        <div
          v-if="error"
          class="chat-error"
          role="alert"
        >
          {{ $t(error)
          }}<button
            class="text-button"
            @click="$emit('retry')"
          >
            {{ $t('common.retry') }}
          </button>
        </div>
        <template v-if="assets">
          <AssetCard
            v-if="strategyCard"
            :card="strategyCard"
            @open="$emit('open', $event)"
          />
          <AssetCard
            v-for="replay in replayCards"
            :key="replay.id"
            :card="replay"
            @open="$emit('open', $event)"
          />
          <p
            v-if="!strategyCard && !replayCards.length && !loading && !error"
            class="asset-empty"
          >
            {{ $t('chat.noAssets') }}
          </p>
          <button
            v-if="more"
            class="text-button"
            :disabled="loading"
            @click="$emit('more')"
          >
            {{ $t(loading ? 'common.loading' : 'chat.moreAssets') }}
          </button>
        </template>
      </div>
    </section>
  </Transition>
</template>
<style scoped>
.asset-list-panel {
  top: 4px;
  width: 384px;
  background: var(--color-bg-canvas);
  z-index: 25;
}
.asset-list-panel.is-modal {
  width: calc(100% - 12px);
}
.asset-list-panel > header {
  height: 52px;
  min-height: 52px;
  padding: 0 20px;
  border-bottom: 0;
}
.asset-list-panel h2 {
  font-size: 14px;
  font-weight: 500;
}
.panel-content {
  padding: 12px 20px 20px;
}
.message-card + .message-card {
  margin-top: 10px;
}
.asset-list-reveal-enter-active,
.asset-list-reveal-leave-active {
  transition: transform var(--motion-asset-list) cubic-bezier(0.2, 0, 0, 1);
}
.asset-list-reveal-enter-from,
.asset-list-reveal-leave-to {
  transform: translateX(calc(100% + 8px));
}
.asset-list-reveal-leave-active {
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .asset-list-reveal-enter-active,
  .asset-list-reveal-leave-active {
    transition: none;
  }
}
</style>
