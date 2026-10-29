<script setup lang="ts">
import { formatDateTime, formatDecimal, formatQuantity } from '~/lib/format'
import { fillActionKey } from '../events'
import type { ReplayEvent } from '../types'

defineProps<{ event: ReplayEvent }>()
const { t, locale } = useI18n()
const price = (value: string) =>
  formatDecimal(value, locale.value, Math.abs(Number(value)) < 1 ? 8 : 2)
</script>

<template>
  <div
    v-if="event.fill"
    class="replay-fill-tooltip"
  >
    <header>
      <strong>
        {{ event.fill.sequence }} ·
        <time :datetime="event.fill.occurred_at">
          {{ formatDateTime(event.fill.occurred_at) }}
        </time>
      </strong>
      <small v-if="event.trade">
        {{ t('replay.tradeNumberCompact', { number: event.trade.sequence }) }}
      </small>
    </header>
    <div class="replay-fill-tooltip-row">
      <span :class="event.fill.side === 'buy' ? 'is-buy' : 'is-sell'">
        {{ t(fillActionKey(event.fill.action, event.trade?.direction)) }}
      </span>
      <span>{{ formatQuantity(event.fill.quantity, locale) }}@{{ price(event.fill.price) }}</span>
    </div>
  </div>
</template>

<style scoped>
.replay-fill-tooltip {
  min-width: 240px;
  padding: 14px 16px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  box-shadow: var(--shadow-chart-tooltip);
  font-size: 13px;
  line-height: 20px;
  color: var(--color-text-primary);
}
.replay-fill-tooltip header {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 10px;
  margin-bottom: 10px;
}
.replay-fill-tooltip strong {
  font-size: 13px;
  font-weight: 600;
}
.replay-fill-tooltip small {
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 400;
  white-space: nowrap;
}
.replay-fill-tooltip-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  line-height: 28px;
  font-variant-numeric: tabular-nums;
}
.replay-fill-tooltip-row .is-buy {
  color: var(--color-chart-buy);
}
.replay-fill-tooltip-row .is-sell {
  color: var(--color-chart-sell);
}
</style>
