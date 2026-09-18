<script setup lang="ts">
import { computed } from 'vue'
import type { ReplayTradeView } from '../types'
import { fillActionKey } from '../events'
import { formatDecimal, formatQuantity, formatRatio } from '~/lib/format'
const props = defineProps<{
  trade: ReplayTradeView | null
  exitLabel: string
  selectedFill?: string
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ ask: []; locate: [id: string]; closed: [] }>()
const { t, te, locale } = useI18n()
const reason = (value: string | null) =>
  value ? (te(`replay.reasons.${value}`) ? t(`replay.reasons.${value}`) : value) : '—'
const date = (value: string | null) =>
  value?.slice(0, 16).replace('T', ' ').replaceAll('-', '/') || '—'
const holding = computed(() => {
  const seconds = props.trade?.holding_seconds
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—'
  const days = Math.floor(seconds / 86400),
    hours = Math.floor((seconds % 86400) / 3600),
    minutes = Math.floor((seconds % 3600) / 60)
  if (days)
    return [
      t('replay.durationDays', { count: days }),
      hours ? t('replay.durationHours', { count: hours }) : '',
    ]
      .filter(Boolean)
      .join(' ')
  if (hours)
    return [
      t('replay.durationHours', { count: hours }),
      minutes ? t('replay.durationMinutes', { count: minutes }) : '',
    ]
      .filter(Boolean)
      .join(' ')
  return minutes
    ? t('replay.durationMinutes', { count: minutes })
    : t('replay.seconds', { count: Math.floor(seconds) })
})
const pnlClass = computed(() =>
  Number(props.trade?.net_pnl) > 0
    ? 'is-positive'
    : Number(props.trade?.net_pnl) < 0
      ? 'is-negative'
      : '',
)
</script>
<template>
  <UModal
    v-model:open="open"
    :title="t('replay.tradeDetails')"
    :description="
      trade
        ? `${t(`replay.direction.${trade.direction}`)} · ${date(trade.entry_at)} → ${trade.exit_at ? date(trade.exit_at) : t('replay.unclosed')}`
        : undefined
    "
    :ui="{
      overlay: 'z-[60]',
      content: 'replay-trade-dialog z-[61]',
      body: 'replay-trade-dialog-body',
    }"
    @after:leave="emit('closed')"
  >
    <template #close
      ><button
        class="detail-icon-button replay-trade-dialog-close"
        :aria-label="t('common.close')"
      >
        <UIcon name="i-lucide-x" /></button
    ></template>
    <template #body>
      <template v-if="trade">
        <div class="replay-trade-dialog-metrics">
          <dl class="replay-trade-result">
            <div class="is-return">
              <dt>{{ t('replay.tradeReturn') }}</dt>
              <dd :class="pnlClass">{{ formatRatio(trade.return_rate, locale) }}</dd>
            </div>
            <div class="is-profit">
              <dt>{{ t('replay.netProfit') }}</dt>
              <dd :class="pnlClass">
                {{ Number(trade.net_pnl) > 0 ? '+' : '' }}{{ formatDecimal(trade.net_pnl, locale) }}
              </dd>
            </div>
            <div>
              <dt>{{ t('replay.holding') }}</dt>
              <dd>{{ holding }}</dd>
            </div>
            <div>
              <dt>{{ t('replay.exitReason') }}</dt>
              <dd>{{ exitLabel }}</dd>
            </div>
          </dl>
          <dl class="replay-trade-facts">
            <div
              v-for="[key, value] in [
                ['entry', trade.entry_price],
                ['exit', trade.exit_price],
                ['quantity', trade.quantity],
                ['grossProfit', trade.gross_pnl],
              ]"
              :key="key!"
            >
              <dt>{{ t(`replay.${key}`) }}</dt>
              <dd>{{ formatQuantity(value, locale) }}</dd>
            </div>
          </dl>
          <dl class="replay-trade-costs">
            <div
              v-for="[key, value] in [
                ['fees', trade.fee],
                ['funding', trade.funding_cost],
                ['slippageCost', trade.slippage_cost],
              ]"
              :key="key!"
            >
              <dt>{{ t(`replay.${key}`) }}</dt>
              <dd>{{ formatQuantity(value, locale) }}</dd>
            </div>
          </dl>
        </div>
        <div class="replay-dialog-fills-heading">
          <h3>{{ t('replay.fills', { count: trade.fills.length }) }}</h3>
          <button
            class="text-button"
            @click="emit('ask')"
          >
            {{ t('replay.askAgent') }}<UIcon name="i-lucide-arrow-up-right" />
          </button>
        </div>
        <div class="replay-table-scroll replay-fills-table">
          <table :aria-label="t('replay.fills', { count: trade.fills.length })">
            <colgroup>
              <col style="width: 144px" />
              <col style="width: 90px" />
              <col
                span="3"
                style="width: 110px"
              />
              <col style="width: 100px" />
              <col style="width: 190px" />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>{{ t('replay.fillTime') }}</th>
                <th>{{ t('replay.fillAction') }}</th>
                <th
                  v-for="key in ['fillPrice', 'quantity', 'fees', 'realized']"
                  :key="key"
                  class="is-numeric"
                >
                  {{ t(`replay.${key}`) }}
                </th>
                <th class="is-numeric">{{ t('replay.positionChange') }}</th>
                <th>{{ t('replay.fillReason') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="fill in trade.fills"
                :key="fill.id"
                :class="{ 'is-selected': selectedFill === fill.id }"
              >
                <td>
                  <button
                    class="text-button replay-fill-row"
                    :aria-pressed="selectedFill === fill.id"
                    @click="emit('locate', fill.id)"
                  >
                    {{ date(fill.occurred_at) }}
                  </button>
                </td>
                <td>{{ t(fillActionKey(fill.action, trade.direction)) }}</td>
                <td
                  v-for="(value, index) in [fill.price, fill.quantity, fill.fee, fill.realized_pnl]"
                  :key="index"
                  class="is-numeric"
                >
                  {{ formatQuantity(value, locale) }}
                </td>
                <td class="is-numeric">
                  {{ formatQuantity(fill.position_before, locale) }} →
                  {{ formatQuantity(fill.position_after, locale) }}
                </td>
                <td>
                  <UTooltip
                    :text="reason(fill.reason)"
                    :disabled="!fill.reason"
                    :delay-duration="400"
                    :content="{ side: 'top', align: 'end', sideOffset: 6 }"
                    :ui="{ content: 'replay-fill-reason-tooltip', text: 'replay-fill-reason-text' }"
                  >
                    <span
                      class="replay-fill-reason"
                      :tabindex="fill.reason ? 0 : undefined"
                    >
                      {{ reason(fill.reason) }}
                    </span>
                  </UTooltip>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
  </UModal>
</template>
