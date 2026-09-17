<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { formatDate, formatDecimal, formatRatio } from '~/lib/format'
import MarkdownContent from '~/components/common/MarkdownContent.vue'
import type { ReplayDetailState } from '../composables/useReplayDetail'
import { fillActionKey } from '../events'
import type { ReplayQuestionReference, ReplaySelection } from '../types'
const props = defineProps<{ state: ReplayDetailState; desktop?: boolean }>()
const emit = defineEmits<{ question: [reference: ReplayQuestionReference] }>()
const { t, locale } = useI18n()
const {
  detail,
  tab,
  expanded,
  atEnd,
  visibleInsights: insights,
  visibleTrades: trades,
  phases,
  errors,
  visibleInsights,
  selectedInsight,
  selectedTrade,
  selection,
  tradesComplete,
} = props.state
const scope = ref<'global' | 'runtime'>('global'),
  direction = ref('all'),
  exitReason = ref('all'),
  page = ref(1),
  insightLimit = ref(20),
  showFills = ref(false)
const summary = computed(
  () =>
    insights.value.find((i) => i.scope === 'global')?.title ||
    (atEnd.value ? detail.value?.result_summary : insights.value.at(-1)?.title) ||
    t('replay.noInsights'),
)
const filteredInsights = computed(() =>
  visibleInsights.value.filter((i) => i.scope === scope.value),
)
const filteredTrades = computed(() =>
  trades.value.filter(
    (v) =>
      (direction.value === 'all' || v.direction === direction.value) &&
      (exitReason.value === 'all' || v.exit_reason === exitReason.value),
  ),
)
const rows = computed(() => filteredTrades.value.slice((page.value - 1) * 20, page.value * 20))
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
function changeTab(value: 'insights' | 'trades') {
  props.state.pause()
  tab.value = value
  expanded.value = true
}
function locate(target: ReplaySelection) {
  void props.state.locate(target, !props.desktop)
}
function ask() {
  const reference = props.state.question()
  if (reference) emit('question', reference)
}
watch(
  atEnd,
  (value) => {
    scope.value = value ? 'global' : 'runtime'
  },
  { immediate: true },
)
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
  const insight = insights.value.find((i) => i.id === value?.insightId)
  if (value?.fillId) showFills.value = true
  if (insight) {
    scope.value = insight.scope
    insightLimit.value = Math.max(
      insightLimit.value,
      insights.value
        .filter((i) => i.scope === insight.scope)
        .findIndex((i) => i.id === insight.id) + 1,
    )
  }
  if (value?.tradeId && value.tradeId !== previous?.tradeId) {
    direction.value = 'all'
    exitReason.value = 'all'
    await nextTick()
    if (selection.value !== value) return
    const n = filteredTrades.value.findIndex((t) => t.id === value.tradeId)
    if (n >= 0) page.value = Math.floor(n / 20) + 1
  }
})
watch(
  () => detail.value?.id,
  () => {
    direction.value = 'all'
    exitReason.value = 'all'
    page.value = 1
    insightLimit.value = 20
  },
)
const pnlClass = (value: string | null) =>
  Number(value) > 0 ? 'is-positive' : Number(value) < 0 ? 'is-negative' : ''
</script>
<template>
  <section
    class="replay-evidence"
    :aria-label="t('replay.evidence')"
  >
    <div
      class="replay-evidence-tabs"
      role="tablist"
      :aria-label="t('replay.evidence')"
    >
      <button
        id="replay-insights-tab"
        role="tab"
        :aria-selected="tab === 'insights'"
        aria-controls="replay-evidence-content"
        @click="changeTab('insights')"
      >
        {{ t('replay.insights') }}<span>{{ insights.length }}</span>
      </button>
      <button
        id="replay-trades-tab"
        role="tab"
        :aria-selected="tab === 'trades'"
        aria-controls="replay-evidence-content"
        @click="changeTab('trades')"
      >
        {{ t('replay.tradeRecords') }}<span>{{ trades.length }}</span>
      </button>
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
      role="tabpanel"
      :aria-labelledby="tab === 'insights' ? 'replay-insights-tab' : 'replay-trades-tab'"
    >
      <div
        v-if="errors[tab]"
        class="replay-inline-error"
        role="alert"
      >
        <span>{{ t(errors[tab]) }}</span
        ><button
          class="text-button"
          @click="state.retry(tab)"
        >
          {{ t('common.retry') }}
        </button>
      </div>
      <div
        v-if="!expanded"
        class="replay-event-summary"
      >
        <span class="replay-summary-text">{{
          tab === 'insights' ? summary : t('replay.tradeCount', { count: trades.length })
        }}</span
        ><button
          class="text-button"
          @click="expanded = true"
        >
          {{ t('replay.expand') }}<UIcon name="i-lucide-chevron-down" />
        </button>
      </div>
      <template v-else-if="tab === 'insights'">
        <div class="replay-evidence-filter">
          <button
            v-for="value in (atEnd ? ['global', 'runtime'] : ['runtime']) as Array<
              'global' | 'runtime'
            >"
            :key="value"
            :aria-pressed="scope === value"
            @click="scope = value"
          >
            {{ t(`replay.scope.${value}`) }}
            {{ insights.filter((insight) => insight.scope === value).length }}
          </button>
        </div>
        <p
          v-if="phases.insights === 'loading'"
          class="replay-muted"
          role="status"
        >
          {{ t('common.loading') }}
        </p>
        <div v-else-if="!filteredInsights.length">
          <MarkdownContent
            v-if="atEnd && scope === 'global' && detail?.result_summary"
            :content="detail.result_summary"
          />
          <p
            v-else
            class="replay-muted"
          >
            {{ t('replay.noInsights') }}
          </p>
        </div>
        <div
          v-for="insight in filteredInsights.slice(0, insightLimit)"
          :key="insight.id"
          class="replay-insight"
          :class="{ 'is-selected': selectedInsight?.id === insight.id }"
        >
          <button
            class="replay-insight-title"
            :aria-expanded="selectedInsight?.id === insight.id"
            @click="locate({ insightId: insight.id })"
          >
            <span>{{ insight.title }}</span
            ><span
              v-if="!insight.is_validated"
              class="replay-unvalidated"
              >{{ t('replay.unvalidated') }}</span
            ><UIcon name="i-lucide-chevron-down" />
          </button>
          <div
            v-if="selectedInsight?.id === insight.id"
            class="replay-insight-content"
          >
            <MarkdownContent :content="insight.content" />
            <p
              v-if="typeof insight.evidence?.summary === 'string'"
              class="replay-evidence-summary"
            >
              {{ insight.evidence.summary }}
            </p>
            <template v-if="insight.suggestion"
              ><h4>{{ t('replay.suggestion') }}</h4>
              <MarkdownContent :content="insight.suggestion"
            /></template>
            <template v-if="insight.tradeoff"
              ><h4>{{ t('replay.tradeoff') }}</h4>
              <MarkdownContent :content="insight.tradeoff"
            /></template>
            <div class="replay-evidence-actions">
              <button
                v-if="selectedTrade"
                class="text-button"
                @click="locate({ tradeId: selectedTrade.id })"
              >
                {{ t('replay.relatedTrade', { number: selectedTrade.sequence }) }}</button
              ><button
                class="text-button"
                @click="ask"
              >
                {{ t('replay.askAgent') }}<UIcon name="i-lucide-arrow-up-right" />
              </button>
            </div>
          </div>
        </div>
        <button
          v-if="filteredInsights.length > insightLimit"
          class="text-button"
          @click="insightLimit += 20"
        >
          {{ t('replay.loadMore') }}
        </button>
      </template>
      <template v-else>
        <div
          v-if="trades.length"
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
        <p
          v-if="!tradesComplete && phases.trades === 'loading'"
          class="replay-muted"
          role="status"
        >
          {{ t('replay.loadingTrades') }}
        </p>
        <p
          v-if="!rows.length && phases.trades !== 'loading'"
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
            class="replay-trade-row"
            :aria-expanded="selectedTrade?.id === trade.id"
            @click="locate({ tradeId: trade.id })"
          >
            <span
              >#{{ trade.sequence }} · {{ t(`replay.direction.${trade.direction}`) }} ·
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
            v-if="selectedTrade?.id === trade.id"
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
          v-if="tradePages > 1"
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
  </section>
</template>
