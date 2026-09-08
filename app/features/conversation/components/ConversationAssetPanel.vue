<script setup lang="ts">
import { computed } from 'vue'
import type { ConversationAssets, MessageCard } from '../types'
const props = defineProps<{
  assets: ConversationAssets | null
  loading: boolean
  error: string
  selected: MessageCard | null
  fullscreen: boolean
  modal: boolean
}>()
const emit = defineEmits<{
  close: []
  back: []
  fullscreen: []
  retry: []
  more: []
  open: [card: MessageCard]
}>()
const more = computed(
  () => props.assets && props.assets.replays.page < props.assets.replays.total_pages,
)
function strategyCard(): MessageCard | null {
  const s = props.assets?.strategy
  return s
    ? {
        id: `asset:${s.id}`,
        type: 'strategy_card',
        status: s.status,
        title: s.name,
        resource_id: s.id,
        summary: null,
        data: null,
      }
    : null
}
</script>
<template>
  <section
    class="asset-panel chat-asset-panel"
    :role="modal ? 'dialog' : 'region'"
    :aria-modal="modal || undefined"
    :aria-label="$t('conversation.assetTitle')"
    @keydown.esc.stop="$emit('close')"
  >
    <header>
      <div class="panel-title">
        <UiIconButton
          v-if="selected"
          :label="$t('common.back')"
          @click="$emit('back')"
          ><UIcon name="i-lucide-arrow-left"
        /></UiIconButton>
        <h2>
          {{
            selected
              ? $t(
                  selected.type === 'strategy_card'
                    ? 'conversation.strategy'
                    : 'conversation.replay',
                )
              : $t('conversation.assetTitle')
          }}
        </h2>
      </div>
      <div class="panel-actions">
        <UiIconButton
          :label="fullscreen ? $t('common.exitFullscreen') : $t('common.fullscreen')"
          @click="$emit('fullscreen')"
          ><UIcon
            :name="fullscreen ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'" /></UiIconButton
        ><UiIconButton
          :label="$t('common.close')"
          @click="$emit('close')"
          ><UIcon name="i-lucide-x"
        /></UiIconButton>
      </div>
    </header>
    <div class="panel-content">
      <template v-if="selected">
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
      </template>
      <template v-else>
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
          <h3 class="asset-group-title">{{ $t('conversation.strategy') }}</h3>
          <button
            v-if="assets.strategy"
            class="asset-choice"
            @click="emit('open', strategyCard()!)"
          >
            <UIcon name="i-lucide-file-text" /><span
              ><strong>{{ assets.strategy.name }}</strong
              ><small>{{
                $t('chat.revision', { revision: assets.strategy.revision })
              }}</small></span
            ><UIcon name="i-lucide-chevron-right" />
          </button>
          <p
            v-else
            class="asset-empty"
          >
            {{ $t('chat.noStrategy') }}
          </p>
          <h3 class="asset-group-title">
            {{ $t('conversation.replay')
            }}<span v-if="assets.replays.total">{{ assets.replays.total }}</span>
          </h3>
          <button
            v-for="replay in assets.replays.items"
            :key="replay.id"
            class="asset-choice"
            @click="
              emit('open', {
                id: `asset:${replay.id}`,
                type: 'replay_card',
                resource_id: replay.id,
                title: replay.name,
                status: '',
                summary: `${replay.symbol} · ${replay.execution_timeframe}`,
                data: null,
              })
            "
          >
            <UIcon name="i-lucide-chart-no-axes-combined" /><span
              ><strong>{{ replay.name }}</strong
              ><small>{{ replay.symbol }} · {{ replay.execution_timeframe }}</small></span
            ><UIcon name="i-lucide-chevron-right" />
          </button>
          <p
            v-if="!assets.replays.items.length"
            class="asset-empty"
          >
            {{ $t('chat.noReplays') }}
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
      </template>
    </div>
  </section>
</template>
