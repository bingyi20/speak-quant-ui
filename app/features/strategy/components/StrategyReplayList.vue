<script setup lang="ts">
import { useId } from 'vue'
import type { ReplaySummary } from '~/features/replay'
import { formatDate, formatDecimal, formatRatio } from '~/lib/format'
defineProps<{
  replays: ReplaySummary[]
  all: boolean
  selectedNodeId: string | null
  names: Map<string, string>
}>()
defineEmits<{ open: [replay: ReplaySummary] }>()
const { locale } = useI18n()
const uid = useId()
function day(value: string) {
  return value?.slice(0, 10).replaceAll('-', '.') ?? '—'
}
</script>
<template>
  <ul class="strategy-replay-list">
    <li
      v-for="replay in replays"
      :key="replay.id"
      :data-replay-id="replay.id"
      :class="{ 'is-selected-version': all && selectedNodeId === replay.strategy_node_id }"
    >
      <button
        type="button"
        class="strategy-replay-row"
        :aria-label="replay.name"
        :aria-describedby="`${uid}-${replay.id}-conditions ${uid}-${replay.id}-metrics${all ? ` ${uid}-${replay.id}-version` : ''}`"
        @click="$emit('open', replay)"
      >
        <span
          class="replay-record-icon"
          aria-hidden="true"
        >
          <UIcon name="i-lucide-chart-no-axes-combined" />
        </span>
        <span class="replay-identity">
          <span class="replay-headline">
            <span
              class="replay-name"
              :title="replay.name"
              >{{ replay.name }}</span
            >
            <span
              v-if="all"
              :id="`${uid}-${replay.id}-version`"
              class="replay-version"
              :title="names.get(replay.strategy_node_id)"
            >
              <span
                v-if="selectedNodeId === replay.strategy_node_id"
                class="selected-version-label"
              >
                <UIcon
                  name="i-lucide-check"
                  aria-hidden="true"
                />
                <span>{{ $t('strategy.selectedVersion') }}</span>
              </span>
              <span
                v-else
                class="replay-version-name"
              >
                <UIcon
                  name="i-lucide-git-branch"
                  aria-hidden="true"
                />
                <span>{{ names.get(replay.strategy_node_id) ?? $t('strategy.historical') }}</span>
              </span>
            </span>
          </span>
          <span
            :id="`${uid}-${replay.id}-conditions`"
            class="replay-conditions"
          >
            <span class="replay-symbol">{{ replay.symbol }}</span>
            <span class="replay-timeframe">{{ replay.execution_timeframe }}</span>
            <span
              class="replay-range"
              :title="formatDate(replay.created_at, locale)"
            >
              <UIcon
                name="i-lucide-calendar-range"
                aria-hidden="true"
              />
              {{ day(replay.start_at) }} – {{ day(replay.end_at) }}
            </span>
            <span v-if="replay.result_type === 'no_trades'">{{ $t('strategy.noTrades') }}</span>
          </span>
        </span>
        <span
          :id="`${uid}-${replay.id}-metrics`"
          class="replay-metrics"
        >
          <span class="replay-metric replay-return">
            <span class="replay-metric-label">{{ $t('strategy.netReturn') }}</span>
            <span
              class="replay-metric-value"
              :class="{
                'metric-positive': Number(replay.net_return_rate) > 0,
                'metric-negative': Number(replay.net_return_rate) < 0,
              }"
            >
              <UIcon
                v-if="Number(replay.net_return_rate) !== 0 && replay.net_return_rate !== null"
                :name="
                  Number(replay.net_return_rate) > 0
                    ? 'i-lucide-trending-up'
                    : 'i-lucide-trending-down'
                "
                aria-hidden="true"
              />
              {{ Number(replay.net_return_rate) > 0 ? '+' : ''
              }}{{ formatRatio(replay.net_return_rate, locale) }}
            </span>
          </span>
          <span class="replay-metric">
            <span class="replay-metric-label">{{ $t('strategy.drawdown') }}</span>
            <span class="replay-metric-value">{{
              formatRatio(replay.max_drawdown_rate, locale)
            }}</span>
          </span>
          <span class="replay-metric">
            <span class="replay-metric-label">{{ $t('strategy.trades') }}</span>
            <span class="replay-metric-value">{{
              formatDecimal(String(replay.trade_count), locale, 0)
            }}</span>
          </span>
        </span>
      </button>
    </li>
  </ul>
</template>
