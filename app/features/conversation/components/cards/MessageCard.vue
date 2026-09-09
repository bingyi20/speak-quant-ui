<script setup lang="ts">
import { computed } from 'vue'
import type { MessageCard } from '../../types'
const props = defineProps<{ card: MessageCard; selected?: boolean }>()
defineEmits<{ open: [card: MessageCard] }>()
const known = computed(() => ['strategy_card', 'replay_card'].includes(props.card.type))
const openable = computed(() => known.value && !!props.card.resource_id)
const busy = computed(() => ['queued', 'running', 'generating'].includes(props.card.status))
const failed = computed(() => ['failed', 'cancelled'].includes(props.card.status))
</script>
<template>
  <component
    :is="openable ? 'button' : 'div'"
    class="message-card"
    :class="{ 'is-selected': selected }"
    :type="openable ? 'button' : undefined"
    :data-card-id="card.id"
    :aria-pressed="openable ? !!selected : undefined"
    @click="openable && $emit('open', card)"
  >
    <span class="message-card-icon"
      ><UIcon
        :name="
          busy
            ? 'i-lucide-loader-circle'
            : card.type === 'replay_card'
              ? 'i-lucide-chart-no-axes-combined'
              : 'i-lucide-file'
        "
        :class="{ 'chat-spinner': busy }"
    /></span>
    <span class="message-card-copy">
      <strong :title="card.title">{{ card.title }}</strong>
      <small :class="{ 'is-error': failed }">
        {{
          $t(
            card.type === 'strategy_card'
              ? 'chat.strategyCardType'
              : card.type === 'replay_card'
                ? 'chat.replayCardType'
                : 'chat.genericCardType',
          )
        }}
        <template v-if="failed">
          · {{ $t(card.status === 'cancelled' ? 'chat.cancelled' : 'chat.assetFailed') }}</template
        >
        <template v-else-if="busy"> · {{ $t('chat.generating') }}</template>
        <template v-else-if="!known"> · {{ $t('chat.unsupportedCard') }}</template>
      </small>
    </span>
    <UIcon
      v-if="openable"
      name="i-lucide-chevron-right"
      class="card-open-arrow"
    />
  </component>
</template>
