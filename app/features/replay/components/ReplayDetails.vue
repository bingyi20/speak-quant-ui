<script setup lang="ts">
import { computed, watch } from 'vue'
import { formatDate, formatDateTime, formatDecimal, formatRatio } from '~/lib/format'
import { decimal } from '../normalize'
import { EQUITY_RATE_DIGITS } from '../historical-result'
import MarkdownContent from '~/components/common/MarkdownContent.vue'
import CopyButton from '~/components/ui/CopyButton.vue'
import type { ReplayDetailState } from '../composables/useReplayDetail'
const props = defineProps<{ state: ReplayDetailState; historical?: boolean }>()
const kind = defineModel<'conditions' | 'metrics' | 'report' | 'state' | 'warnings' | null>({
  default: null,
})
const { t, locale } = useI18n()
const { detail, report, phases, errors, currentState } = props.state
const open = computed({
  get: () => kind.value !== null,
  set: (value) => {
    if (!value) kind.value = null
  },
})
watch(kind, (value) => {
  if (value) props.state.pause()
  if (value === 'report') void props.state.loadReport()
})
const rows = computed<Array<[string, string]>>(() => {
  const d = detail.value
  if (!d) return []
  if (kind.value === 'conditions') {
    const c = d.conditions,
      a = d.execution_assumptions
    return [
      [t('replay.symbol'), c.symbol],
      [t('replay.executionTimeframe'), d.strategy.execution_timeframe],
      ...(d.strategy.auxiliary_timeframes?.length
        ? [[t('replay.auxiliaryTimeframes'), d.strategy.auxiliary_timeframes.join(' · ')]]
        : []),
      [t('replay.start'), formatDate(c.start_at, locale.value)],
      [t('replay.end'), formatDate(c.end_at, locale.value)],
      [
        t('replay.capital'),
        `${formatDecimal(c.initial_capital, locale.value)} ${a?.capital_currency ?? ''}`,
      ],
      ...(c.market_type
        ? [
            [
              t('replay.market'),
              t(`replay.marketTypes.${c.market_type === 'spot' ? 'spot' : 'contract'}`),
            ],
          ]
        : []),
      ...(c.leverage
        ? [[t('replay.leverage'), `${formatDecimal(c.leverage, locale.value, 0)}×`]]
        : []),
      ...(a
        ? [
            [
              t('replay.positionSizing'),
              a.position_sizing.type === 'equity_percent'
                ? decimal(a.position_sizing.value) === '1'
                  ? t('replay.fullEquityCompounding')
                  : t('replay.equityPercent', {
                      value: formatRatio(a.position_sizing.value, locale.value),
                    })
                : a.position_sizing.type === 'fixed_amount'
                  ? `${t('replay.fixedSize')} ${a.position_sizing.value}`
                  : `${a.position_sizing.type} · ${a.position_sizing.value}`,
            ],
            [t('replay.commission'), formatRatio(a.commission_rate, locale.value)],
            [t('replay.slippage'), formatRatio(a.slippage_rate, locale.value)],
            [t('replay.dataSource'), a.data.source],
            [
              t('replay.availableStart'),
              a.data.available_start_at ? formatDate(a.data.available_start_at, locale.value) : '—',
            ],
            [
              t('replay.availableEnd'),
              a.data.available_end_at ? formatDate(a.data.available_end_at, locale.value) : '—',
            ],
            ...a.assumptions
              .filter((v) => v.key !== 'strategy_runtime_api_version')
              .map((v) => [
                t(`replay.assumptions.${v.key}`, v.label),
                t(`replay.assumptions.${v.value}`, v.value),
              ]),
          ]
        : []),
    ] as Array<[string, string]>
  }
  if (kind.value === 'state') {
    const s = currentState.value
    if (!s) return []
    return [
      ['position', s.quantity],
      ['equity', s.equity],
      ['cash', s.cash],
      ['averagePrice', s.averagePrice],
      ['unrealized', s.unrealized],
      ['realized', s.realized],
    ].map(([key, value]) => [t(`replay.${key}`), formatDecimal(value, locale.value)])
  }
  if (kind.value === 'metrics' && props.historical) {
    const r = props.state.summaryResult.value
    const s = props.state.currentLoading.value ? null : currentState.value
    return [
      [
        t('replay.netReturn'),
        formatRatio(r?.net_return_rate ?? null, locale.value, EQUITY_RATE_DIGITS),
      ],
      [
        t('replay.drawdown'),
        formatRatio(r?.max_drawdown_rate ?? null, locale.value, EQUITY_RATE_DIGITS),
      ],
      [t('replay.tradeTotal'), r ? String(r.trade_count) : '—'],
      [t('replay.winRate'), formatRatio(r?.win_rate ?? null, locale.value)],
      [t('replay.profitFactor'), formatDecimal(r?.profit_factor, locale.value)],
      [t('replay.netProfit'), formatDecimal(r?.net_profit, locale.value)],
      [t('replay.equity'), formatDecimal(s?.equity, locale.value)],
      [t('replay.cash'), formatDecimal(s?.cash, locale.value)],
      [
        t('replay.positionStatus'),
        s?.direction ? t(`replay.holdingDirection.${s.direction}`) : '—',
      ],
      [t('replay.unrealized'), formatDecimal(s?.unrealized, locale.value)],
      [
        t('replay.currentDrawdown'),
        formatRatio(s?.drawdown ?? null, locale.value, EQUITY_RATE_DIGITS),
      ],
      ...drawdownRows.value,
    ]
  }
  const r = d.result
  if (kind.value !== 'metrics' || !r) return []
  const values: Array<[string, string | number | null | undefined, boolean?]> = [
    ['netReturn', r.net_return_rate, true],
    ['grossReturn', r.gross_return_rate, true],
    ['netProfit', r.net_profit],
    ['drawdown', r.max_drawdown_rate, true],
    ['tradeTotal', r.trade_count],
    ['winRate', r.win_rate, true],
    ['profitFactor', r.profit_factor],
    ['payoffRatio', r.payoff_ratio],
    ['winCount', r.win_count],
    ['lossCount', r.loss_count],
    ['flatCount', r.flat_count],
    ['fees', r.total_fee],
    ['funding', r.total_funding_cost],
    ['slippageCost', r.total_slippage_cost],
    ['liquidations', r.liquidation_count],
  ]
  return [
    ...values
      .filter(([, v]) => v !== undefined)
      .map(
        ([key, value, ratio]) =>
          [
            t(`replay.${key}`),
            typeof value === 'number'
              ? String(value)
              : ratio
                ? formatRatio(
                    value ?? null,
                    locale.value,
                    ['netReturn', 'grossReturn', 'drawdown'].includes(key) ? EQUITY_RATE_DIGITS : 2,
                  )
                : formatDecimal(value, locale.value),
          ] as [string, string],
      ),
    ...drawdownRows.value,
  ]
})
const drawdownRows = computed<Array<[string, string]>>(() => {
  const range = props.state.currentDrawdownRange.value
  if (!range) return []
  return (['peak', 'trough'] as const).map((key) => [
    t(`replay.drawdownEquity.${key}`),
    `${formatDecimal(range[key].equity, locale.value)} · ${formatDateTime(range[key].closeTime * 1000)}`,
  ])
})
const warnings = computed(
  () =>
    detail.value?.result?.quality_warnings
      ?.map((v) => (typeof v === 'string' ? v : v.message || v.label || v.key))
      .filter(Boolean) ?? [],
)
</script>
<template>
  <UModal
    v-model:open="open"
    :title="
      historical && kind === 'metrics'
        ? t('replay.asOfResult')
        : t(`replay.${kind ?? 'conditions'}`)
    "
    :ui="{ overlay: 'z-[60]', content: 'replay-reading-layer z-[61]' }"
  >
    <template #body>
      <template v-if="kind === 'report'">
        <p
          v-if="phases.report === 'loading'"
          role="status"
        >
          {{ t('common.loading') }}
        </p>
        <div
          v-else-if="errors.report"
          role="alert"
        >
          <p>{{ t(errors.report) }}</p>
          <button
            class="text-button"
            @click="state.loadReport"
          >
            {{ t('common.retry') }}
          </button>
        </div>
        <template v-else-if="report?.content"
          ><MarkdownContent :content="report.content" /><CopyButton
            :content="report.content"
            :label="t('replay.copyReport')"
        /></template>
        <p v-else>{{ t('replay.emptyReport') }}</p>
      </template>
      <ul v-else-if="kind === 'warnings'">
        <li
          v-for="warning in warnings"
          :key="warning"
        >
          {{ warning }}
        </li>
      </ul>
      <template v-else>
        <dl class="replay-key-values">
          <div
            v-for="[label, value] in rows"
            :key="label"
          >
            <dt>{{ label }}</dt>
            <dd>{{ value }}</dd>
          </div>
        </dl>
        <template v-if="kind === 'metrics' && !historical && detail?.result"
          ><section
            v-for="side in ['long', 'short'] as const"
            :key="side"
          >
            <template v-if="detail.result[`${side}_metrics`]"
              ><h3>{{ t(`replay.direction.${side}`) }}</h3>
              <dl class="replay-key-values">
                <div
                  v-for="(value, key) in detail.result[`${side}_metrics`]"
                  :key="key"
                >
                  <dt>{{ t(`replay.metricFields.${key}`, String(key)) }}</dt>
                  <dd>
                    {{
                      String(key).endsWith('_rate')
                        ? formatRatio(String(value ?? ''), locale)
                        : formatDecimal(value == null ? null : String(value), locale)
                    }}
                  </dd>
                </div>
              </dl></template
            >
          </section></template
        >
      </template>
    </template>
  </UModal>
</template>
