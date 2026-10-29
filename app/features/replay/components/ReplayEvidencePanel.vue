<script setup lang="ts">
import { computed, nextTick, ref, watch, useTemplateRef } from 'vue'
import { formatDate, formatDecimal, formatRatio } from '~/lib/format'
import ReplayTradeDialog from './ReplayTradeDialog.vue'
import LoadingState from '~/components/common/LoadingState.vue'
import LoadingSkeleton from '~/components/ui/LoadingSkeleton.vue'
import type { ReplayDetailState } from '../composables/useReplayDetail'
import { fillActionKey } from '../events'
import { tradeInstrument } from '../instruments'
import { useReplayTradeStrip } from '../composables/useReplayTradeStrip'
import type { ReplayQuestionReference, ReplaySelection, ReplayTradeView } from '../types'
const props = defineProps<{ state: ReplayDetailState; desktop?: boolean }>()
const emit = defineEmits<{
  question: [reference: ReplayQuestionReference]
  menu: [open: boolean]
}>()
const { t, locale } = useI18n()
const {
  detail,
  expanded,
  atEnd,
  visibleTrades: trades,
  phases,
  errors,
  selectedTrade,
  selection,
  tradesComplete,
  initializing,
} = props.state
const cardsElement = useTemplateRef<HTMLElement>('cardsElement')
const detailsTradeId = ref<string | null>(null)
const detailsTrade = computed(
  () => trades.value.find((trade) => trade.id === detailsTradeId.value) ?? null,
)
const detailsOpen = computed({
  get: () => !!detailsTrade.value,
  set: (value: boolean) => {
    if (!value) detailsTradeId.value = null
  },
})
watch(detailsOpen, (value) => emit('menu', value))
let detailsTrigger: HTMLElement | null = null
function openDetails(id: string, event: Event) {
  props.state.pause()
  detailsTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  detailsTradeId.value = id
}
function restoreDetailsFocus() {
  if (detailsTrigger?.isConnected) detailsTrigger.focus({ preventScroll: true })
}
function locateDetailsFill(fillId: string) {
  const tradeId = detailsTrade.value?.id
  detailsTradeId.value = null
  if (tradeId) locate({ tradeId, fillId })
}
function askDetails() {
  const tradeId = detailsTrade.value?.id
  if (!tradeId) return
  const reference = props.state.question({ tradeId })
  detailsTrigger = null
  detailsTradeId.value = null
  if (reference) emit('question', reference)
}
watch(
  () => props.desktop,
  (value) => {
    if (!value) detailsTradeId.value = null
  },
)
const tradesLoading = computed(
  () =>
    !trades.value.length &&
    (phases.trades === 'loading' || (initializing.value && phases.candles === 'loading')),
)
const tradeCount = computed(() =>
  initializing.value || !tradesComplete.value ? '—' : trades.value.length,
)
const direction = ref('all'),
  exitReason = ref('all'),
  page = ref(1),
  showFills = ref(false)
const filteredTrades = computed(() =>
  [...trades.value]
    .sort((a, b) => a.sequence - b.sequence)
    .filter(
      (v) =>
        (props.desktop || direction.value === 'all' || v.direction === direction.value) &&
        (props.desktop || exitReason.value === 'all' || v.exit_reason === exitReason.value),
    ),
)
const strip = useReplayTradeStrip(
  cardsElement,
  () => filteredTrades.value.length,
  () => detail.value?.id,
)
const { trackStyle, canReturn } = strip
const cardRows = computed(() => filteredTrades.value.slice(strip.start.value, strip.end.value))
const rows = computed(() =>
  props.desktop ? [] : filteredTrades.value.slice((page.value - 1) * 20, page.value * 20),
)
const tradePages = computed(() => Math.max(1, Math.ceil(filteredTrades.value.length / 20)))
const exitReasons = computed(() => [
  { label: t('replay.allExits'), value: 'all' },
  ...[...new Set(trades.value.map((v) => v.exit_reason).filter((v): v is string => !!v))].map(
    (value) => ({ value, label: reason(value) }),
  ),
])
const directionItems = computed(() => [
  { label: t('replay.allDirections'), value: 'all' },
  { label: t('replay.direction.long'), value: 'long' },
  { label: t('replay.direction.short'), value: 'short' },
])
function reason(value: string | null) {
  return value &&
    [
      'rule',
      'take_profit',
      'stop_loss',
      'liquidation',
      'end_of_test',
      'signal',
      'reverse',
    ].includes(value)
    ? t(`replay.reasons.${value}`)
    : value
      ? t('replay.reasons.other')
      : '—'
}
function locate(target: ReplaySelection) {
  void props.state.locate(target, !props.desktop && !detail.value?.conditions.instruments)
}
function ask() {
  const reference = props.state.question()
  if (reference) emit('question', reference)
}
watch(
  () => trades.value.length,
  () => {
    page.value = Math.min(page.value, tradePages.value)
  },
)
watch(exitReasons, (items) => {
  if (!items.some((item) => item.value === exitReason.value)) exitReason.value = 'all'
})
watch([direction, exitReason], () => {
  page.value = 1
})
watch(selection, async (value, previous) => {
  if (value?.tradeId !== previous?.tradeId) showFills.value = false
  if (value?.fillId) showFills.value = true
  if (value?.tradeId) expanded.value = true
  if (value?.tradeId && value.tradeId !== previous?.tradeId) {
    direction.value = 'all'
    exitReason.value = 'all'
    await nextTick()
    if (selection.value !== value) return
    const n = filteredTrades.value.findIndex((t) => t.id === value.tradeId)
    if (props.desktop) strip.reveal(n)
    else if (n >= 0) page.value = Math.floor(n / 20) + 1
  }
})
watch(
  () => detail.value?.id,
  () => {
    direction.value = 'all'
    exitReason.value = 'all'
    page.value = 1
    detailsTradeId.value = null
  },
)
const pnlClass = (value: string | null) =>
  Number(value) > 0 ? 'is-positive' : Number(value) < 0 ? 'is-negative' : ''
function instrumentLabel(trade: ReplayTradeView) {
  if (!detail.value?.conditions.instruments) return ''
  const instrument = tradeInstrument(trade, props.state.instruments.value)
  if (!instrument) return trade.symbol ?? trade.instrument_role ?? ''
  const market = instrument.market_type
    ? t(
        `replay.marketTypes.${instrument.market_type === 'spot' ? 'spot' : instrument.contract_type === 'perpetual' ? 'perpetual' : 'contract'}`,
      )
    : ''
  return [instrument.symbol, market].filter(Boolean).join(' · ')
}
</script>
<template>
  <section
    class="replay-evidence"
    :class="{ 'is-desktop-cards': desktop }"
    :aria-label="t('replay.tradesTitle')"
  >
    <template v-if="desktop">
      <div class="replay-cards-heading">
        <h3>
          {{ t('replay.tradesTitle') }} <span>{{ tradeCount }}</span>
        </h3>
        <button
          v-if="canReturn"
          class="text-button replay-trades-follow"
          :aria-label="t('replay.followLatestTrades')"
          @click="strip.returnToLatest"
        >
          {{ t('replay.followLatest') }}<UIcon name="i-lucide-chevrons-right" />
        </button>
      </div>
      <div
        ref="cardsElement"
        class="replay-trade-cards"
        tabindex="0"
        role="region"
        :aria-label="t('replay.tradesTitle')"
        @scroll.passive="strip.onScroll"
        @wheel.passive="strip.interruptReturn"
        @pointerdown="strip.interruptReturn"
        @keydown="strip.interruptReturn"
      >
        <div
          class="replay-trade-track"
          role="list"
          :style="trackStyle"
        >
          <div
            v-for="trade in cardRows"
            :key="trade.id"
            role="listitem"
            class="replay-trade-item"
          >
            <button
              class="replay-trade-card"
              :class="{ 'is-selected': selectedTrade?.id === trade.id }"
              :data-trade-id="trade.id"
              :aria-pressed="selectedTrade?.id === trade.id"
              @click="state.toggleTrade(trade.id)"
            >
              <span class="replay-card-heading"
                >{{ trade.sequence }} · {{ t(`replay.direction.${trade.direction}`) }}</span
              >
              <span
                v-if="instrumentLabel(trade)"
                class="replay-trade-instrument"
                :title="instrumentLabel(trade)"
                >{{ instrumentLabel(trade) }}</span
              >
              <span
                class="replay-card-pnl"
                :class="pnlClass(trade.net_pnl)"
                ><span>{{ formatRatio(trade.return_rate, locale) }}</span
                ><small
                  >{{ Number(trade.net_pnl) > 0 ? '+' : ''
                  }}{{ formatDecimal(trade.net_pnl, locale) }}</small
                ></span
              >
              <span class="replay-card-time"
                >{{ trade.entry_at.slice(0, 10).replaceAll('-', '/') }} →
                {{ trade.exit_at?.slice(5, 10).replace('-', '/') || t('replay.unclosed') }}</span
              >
            </button>
            <button
              class="replay-trade-details-trigger"
              :data-trade-details="trade.id"
              :aria-label="t('replay.viewTradeDetails')"
              @click.stop="openDetails(trade.id, $event)"
            >
              {{ t('replay.detailsEntry') }}
            </button>
          </div>
        </div>
      </div>
    </template>
    <div
      v-if="!desktop"
      class="replay-evidence-tabs"
    >
      <h3 class="py-2 text-[13px] font-medium">
        {{ t('replay.tradesTitle') }} <span class="replay-muted">{{ tradeCount }}</span>
      </h3>
      <button
        v-if="expanded"
        class="detail-icon-button replay-evidence-collapse"
        :aria-label="t('replay.collapse')"
        @click="expanded = false"
      >
        <UIcon name="i-lucide-chevron-up" />
      </button>
    </div>
    <div
      id="replay-evidence-content"
      role="region"
      :aria-label="t('replay.tradeRecords')"
    >
      <div
        v-if="errors.trades"
        class="replay-inline-error"
        role="alert"
      >
        <span>{{ t(errors.trades) }}</span
        ><button
          class="text-button"
          @click="state.retry('trades')"
        >
          {{ t('common.retry') }}
        </button>
      </div>
      <div
        v-if="!desktop && !expanded"
        class="replay-event-summary"
      >
        <LoadingSkeleton
          v-if="phases.trades === 'loading' || (initializing && !errors.candles)"
          class="replay-evidence-summary-skeleton"
        />
        <span
          v-else
          class="replay-summary-text"
          >{{ t('replay.tradeCount', { count: trades.length }) }}</span
        ><button
          class="text-button"
          @click="expanded = true"
        >
          {{ t('replay.expand') }}<UIcon name="i-lucide-chevron-down" />
        </button>
      </div>
      <template v-else>
        <div
          v-if="trades.length && !desktop"
          class="replay-trade-filters"
        >
          <USelect
            v-model="direction"
            :items="directionItems"
            :aria-label="t('replay.directionFilter')"
            size="sm"
          /><USelect
            v-model="exitReason"
            :items="exitReasons"
            :aria-label="t('replay.exitFilter')"
            size="sm"
          />
        </div>
        <LoadingState
          v-if="tradesLoading"
          class="replay-resource-loading"
          :label="t('replay.loadingTrades')"
        />
        <p
          v-if="!filteredTrades.length && !tradesLoading && !errors.trades && !initializing"
          class="replay-muted"
        >
          {{ t(atEnd ? 'replay.noTrades' : 'replay.noTradesYet') }}
        </p>
        <div
          v-for="trade in rows"
          :key="trade.id"
          class="replay-trade"
          :class="{ 'is-selected': selectedTrade?.id === trade.id }"
        >
          <button
            v-if="!desktop"
            class="replay-trade-row"
            :aria-expanded="selectedTrade?.id === trade.id"
            @click="locate({ tradeId: trade.id })"
          >
            <span
              ><span
                v-if="instrumentLabel(trade)"
                class="replay-trade-instrument"
                >{{ instrumentLabel(trade) }}</span
              >
              {{ trade.sequence }} · {{ t(`replay.direction.${trade.direction}`) }} ·
              {{ trade.isComplete ? reason(trade.exit_reason) : t('replay.unclosed')
              }}<small
                >{{ trade.entry_at.slice(0, 16).replace('T', ' ') }} →
                {{ trade.exit_at?.slice(0, 16).replace('T', ' ') || t('replay.unclosed') }}</small
              ></span
            ><span :class="pnlClass(trade.net_pnl)"
              >{{ Number(trade.net_pnl) > 0 ? '+' : '' }}{{ formatDecimal(trade.net_pnl, locale)
              }}<small>{{ formatRatio(trade.return_rate, locale) }}</small></span
            >
          </button>
          <div
            v-if="!desktop && selectedTrade?.id === trade.id"
            class="replay-trade-detail"
          >
            <dl class="replay-trade-prices">
              <div>
                <dt>{{ t('replay.entry') }}</dt>
                <dd>{{ formatDecimal(trade.entry_price, locale) }}</dd>
              </div>
              <div>
                <dt>{{ t('replay.exit') }}</dt>
                <dd>{{ formatDecimal(trade.exit_price, locale) }}</dd>
              </div>
              <div>
                <dt>{{ t('replay.quantity') }}</dt>
                <dd>{{ formatDecimal(trade.quantity, locale, 6) }}</dd>
              </div>
            </dl>
            <div class="replay-evidence-actions">
              <button
                class="text-button"
                :aria-expanded="showFills"
                @click="showFills = !showFills"
              >
                {{ t('replay.fills', { count: trade.fills.length })
                }}<UIcon
                  :name="showFills ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                /></button
              ><button
                class="text-button"
                @click="ask"
              >
                {{ t('replay.askAgent') }}<UIcon name="i-lucide-arrow-up-right" />
              </button>
            </div>
            <template v-if="showFills"
              ><dl class="replay-key-values">
                <div
                  v-for="[key, value] in [
                    ['grossProfit', trade.gross_pnl],
                    ['fees', trade.fee],
                    ['funding', trade.funding_cost],
                    ['slippageCost', trade.slippage_cost],
                  ]"
                  :key="key!"
                >
                  <dt>{{ t(`replay.${key}`) }}</dt>
                  <dd>{{ formatDecimal(value, locale) }}</dd>
                </div>
                <div>
                  <dt>{{ t('replay.holding') }}</dt>
                  <dd>
                    {{
                      trade.holding_seconds == null
                        ? '—'
                        : t('replay.seconds', { count: trade.holding_seconds })
                    }}
                  </dd>
                </div>
              </dl>
              <div
                v-for="fill in trade.fills"
                :key="fill.id"
              >
                <button
                  class="replay-fill-row"
                  :class="{ 'is-selected': selection?.fillId === fill.id }"
                  :aria-expanded="selection?.fillId === fill.id"
                  @click="locate({ tradeId: trade.id, fillId: fill.id })"
                >
                  <span
                    >{{ t(fillActionKey(fill.action, trade.direction))
                    }}<small>{{ formatDate(fill.occurred_at, locale) }}</small></span
                  ><span
                    >{{ formatDecimal(fill.price, locale)
                    }}<small>{{ formatDecimal(fill.quantity, locale, 6) }}</small></span
                  >
                </button>
                <template v-if="selection?.fillId === fill.id">
                  <dl class="replay-key-values">
                    <div>
                      <dt>{{ t('replay.fillSequence') }}</dt>
                      <dd>{{ fill.sequence }}</dd>
                    </div>
                    <div
                      v-for="[key, value] in [
                        ['fees', fill.fee],
                        ['realized', fill.realized_pnl],
                        ['positionBefore', fill.position_before],
                        ['positionAfter', fill.position_after],
                      ]"
                      :key="key!"
                    >
                      <dt>{{ t(`replay.${key}`) }}</dt>
                      <dd>{{ formatDecimal(value, locale, 6) }}</dd>
                    </div>
                  </dl>
                  <p
                    v-if="fill.reason"
                    class="replay-muted"
                  >
                    {{ fill.reason }}
                  </p>
                </template>
              </div></template
            >
          </div>
        </div>
        <div
          v-if="!desktop && tradePages > 1"
          class="replay-pagination"
        >
          <button
            class="text-button"
            :disabled="page === 1"
            @click="page--"
          >
            {{ t('replay.previousPage') }}</button
          ><span>{{ page }} / {{ tradePages }}</span
          ><button
            class="text-button"
            :disabled="page === tradePages"
            @click="page++"
          >
            {{ t('replay.nextPage') }}
          </button>
        </div>
      </template>
    </div>
    <ReplayTradeDialog
      v-if="desktop"
      v-model:open="detailsOpen"
      :trade="detailsTrade"
      :instrument-label="detailsTrade ? instrumentLabel(detailsTrade) : ''"
      :exit-label="
        detailsTrade?.isComplete ? reason(detailsTrade.exit_reason) : t('replay.unclosed')
      "
      :selected-fill="selection?.fillId"
      @closed="restoreDetailsFocus"
      @locate="locateDetailsFill"
      @ask="askDetails"
    />
  </section>
</template>
