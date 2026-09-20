<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { formatDate, formatDateTime, formatDecimal, formatRatio } from '~/lib/format'
import ReplayChart from './ReplayChart.client.vue'
import ReplayTimeline from './ReplayTimeline.vue'
import ReplayEvidencePanel from './ReplayEvidencePanel.vue'
import ReplayDetails from './ReplayDetails.vue'
import { resolveSelection } from '../events'
import { EQUITY_RATE_DIGITS } from '../historical-result'
import type { ReplayDetailState } from '../composables/useReplayDetail'
import type { ReplayQuestionReference } from '../types'
const props = defineProps<{ state: ReplayDetailState; active: boolean }>()
const emit = defineEmits<{
  question: [reference: ReplayQuestionReference]
  menu: [open: boolean]
}>()
const { t, locale } = useI18n()
const {
  detail,
  loading,
  error,
  atEnd,
  initializing,
  index,
  speed,
  speeds,
  canPlay,
  playing,
  phases,
  errors,
  availableTimeframes,
  displayTimeframe,
  displayLoading,
  displayError,
  selection,
  selectedTrade,
  currentBar,
  currentState,
  currentLoading,
  currentError,
  locateError,
  gapTime,
  events,
  renderedBars,
  renderedEvents,
  requestedRange,
  viewRange,
  follow,
  scrollTop,
} = props.state
const desktop = ref(false)
let desktopQuery: MediaQueryList | undefined
const syncDesktop = () => {
  desktop.value = desktopQuery?.matches ?? false
}
onMounted(() => {
  desktopQuery = window.matchMedia('(min-width: 761px)')
  syncDesktop()
  desktopQuery.addEventListener('change', syncDesktop)
})
onBeforeUnmount(() => desktopQuery?.removeEventListener('change', syncDesktop))
const speedOptions = computed(() =>
  desktop.value
    ? [0.5, 1, 2, 5, 10].map((multiplier) => ({
        value: props.state.baseSpeed.value * multiplier,
        label: `${multiplier}x`,
      }))
    : speeds.value.map((value) => ({ value, label: t('replay.barsPerSecond', { count: value }) })),
)
const body = useTemplateRef<HTMLElement>('body')
const reading = ref<'conditions' | 'metrics' | 'report' | 'state' | 'warnings' | null>(null),
  volume = ref(false)
const complete = computed(() => detail.value?.status === 'completed')
const shortcuts = computed(() =>
  events.value.filter((e) => ['best', 'worst', 'drawdown'].includes(e.kind)),
)
const speedMenu = computed(() =>
  speedOptions.value.map((option) => ({
    label: option.label,
    type: 'checkbox' as const,
    checked: speed.value === option.value,
    onSelect: () => {
      speed.value = option.value
    },
  })),
)
const resultMenu = computed(() =>
  shortcuts.value.map((event) => {
    const resolved = resolveSelection(
      event.selection,
      props.state.axis.value,
      props.state.trades.value,
      props.state.insights.value,
    )
    return {
      label: t(`replay.shortcuts.${event.kind}`),
      disabled: !resolved?.range || resolved.range.to > (currentBar.value?.time ?? -Infinity),
      onSelect: () => props.state.previewResult(event.selection),
    }
  }),
)
const menuUi = {
  content: 'replay-compact-menu z-[60]',
  item: 'replay-compact-menu-item',
  itemTrailingIcon: 'size-3.5',
}
const warnings = computed(() => detail.value?.result?.quality_warnings?.length ?? 0)
const metrics = computed(() => {
  const r = (desktop.value ? props.state.summaryResult.value : detail.value?.result) ?? {
    net_return_rate: null,
    max_drawdown_rate: null,
    trade_count: null,
    win_rate: null,
    profit_factor: null,
  }
  return r
    ? [
        {
          key: 'netReturn',
          value: formatRatio(r.net_return_rate, locale.value, EQUITY_RATE_DIGITS),
          sign: Number(r.net_return_rate),
        },
        {
          key: 'drawdown',
          value: formatRatio(r.max_drawdown_rate, locale.value, EQUITY_RATE_DIGITS),
          sign: 0,
        },
        { key: 'trades', value: r.trade_count === null ? '—' : String(r.trade_count), sign: 0 },
        { key: 'winRate', value: formatRatio(r.win_rate, locale.value), sign: 0 },
        { key: 'profitFactor', value: formatDecimal(r.profit_factor, locale.value), sign: 0 },
        ...(desktop.value
          ? [
              {
                key: 'currentPosition',
                value:
                  currentLoading.value || gapTime.value || !currentState.value?.direction
                    ? '—'
                    : t(`replay.holdingDirection.${currentState.value.direction}`),
                sign: 0,
              },
            ]
          : []),
      ]
    : []
})
const metadata = computed(() => {
  const d = detail.value
  if (!d) return []
  return [
    t('replay.execution', { timeframe: d.strategy.execution_timeframe }),
    d.conditions.market_type
      ? t(
          `replay.marketTypes.${d.conditions.market_type === 'spot' ? 'spot' : d.conditions.contract_type === 'perpetual' ? 'perpetual' : 'contract'}`,
        )
      : '',
    d.strategy.direction ? t(`replay.direction.${d.strategy.direction}`) : '',
    d.conditions.leverage ? `${formatDecimal(d.conditions.leverage, locale.value, 0)}×` : '',
  ].filter(Boolean)
})
function open(kind: 'conditions' | 'metrics' | 'report' | 'state' | 'warnings') {
  props.state.pause()
  reading.value = kind
}
watch(reading, () => emit('menu', !!reading.value))
watch(
  () => props.active,
  (value) => {
    if (!value) {
      reading.value = null
      props.state.pause()
    }
  },
)
watch(
  () => detail.value?.id,
  () => {
    reading.value = null
    volume.value = false
  },
)
watch(scrollTop, async (value) => {
  await nextTick()
  if (body.value && Math.abs(body.value.scrollTop - value) > 1) body.value.scrollTop = value
})
function select(time: number, markerId?: string) {
  const event = markerId ? events.value.find((e) => e.id === markerId) : null
  if (desktop.value && event?.kind === 'insight') props.state.inspectInsight(event.selection)
  else if (event) void props.state.locate(event.selection)
  else void props.state.selectCandle(time)
}
let rangeTimer: ReturnType<typeof setTimeout> | undefined
function rangeChanged(range: { from: number; to: number }) {
  viewRange.value = range
  clearTimeout(rangeTimer)
  if (displayTimeframe.value === detail.value?.strategy.execution_timeframe || displayLoading.value)
    return
  const window = props.state.displayWindow.value,
    d = detail.value
  if (!d) return
  const from = Math.max(range.from, Date.parse(d.conditions.start_at) / 1000),
    to = Math.min(range.to, Date.parse(d.conditions.end_at) / 1000)
  if (
    from >= to ||
    (window?.timeframe === displayTimeframe.value && from >= window.from && to <= window.to)
  )
    return
  rangeTimer = setTimeout(() => {
    if (props.active) void props.state.setTimeframe(displayTimeframe.value)
  }, 250)
}
function togglePlayback() {
  if (playing.value) props.state.pause()
  else if (canPlay.value && gapTime.value === null) {
    if (atEnd.value) void props.state.start()
    else void props.state.play()
  }
}
function playbackKeydown(event: KeyboardEvent) {
  if (
    !desktop.value ||
    !props.active ||
    reading.value ||
    event.code !== 'Space' ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.isComposing
  )
    return
  const target = event.target
  if (
    !(target instanceof HTMLElement) ||
    !target.matches('.replay-timeline input[type="range"], .replay-primary-action')
  )
    return
  // Handle both controls once; suppress scrolling and the button's native Space click.
  event.preventDefault()
  event.stopPropagation()
  if (!event.repeat) togglePlayback()
}
function interact() {
  if (!desktop.value) props.state.pause()
  follow.value = desktop.value
}
onBeforeUnmount(() => {
  clearTimeout(rangeTimer)
  emit('menu', false)
})
</script>
<template>
  <div
    ref="body"
    class="replay-detail-content replay-workspace"
    @keydown.capture="playbackKeydown"
    @scroll="scrollTop = ($event.target as HTMLElement).scrollTop"
  >
    <div
      v-if="loading && !detail"
      class="replay-skeleton"
      role="status"
      :aria-label="t('common.loading')"
    >
      <div />
      <div />
      <div />
    </div>
    <div
      v-else-if="!detail && error"
      class="detail-state"
      role="alert"
    >
      <p>{{ t(error) }}</p>
      <button
        class="text-button"
        @click="state.refresh"
      >
        {{ t('common.retry') }}
      </button>
    </div>
    <template v-else-if="detail">
      <div class="replay-meta-line">
        <div class="replay-meta">
          <strong>{{ detail.conditions.symbol }}</strong
          ><span
            v-for="value in metadata"
            :key="value"
            >{{ value }}</span
          >
        </div>
        <div class="replay-date-row">
          <span
            :title="`${detail.conditions.start_at.slice(0, 10)} — ${detail.conditions.end_at.slice(0, 10)}`"
            >{{ detail.conditions.start_at.slice(0, 10) }} —
            {{ detail.conditions.end_at.slice(0, 10) }}</span
          ><button
            class="text-button"
            @click="open('conditions')"
          >
            {{ t('replay.conditions') }}<UIcon name="i-lucide-sliders-horizontal" />
          </button>
        </div>
      </div>
      <template v-if="detail.result && complete">
        <div class="replay-summary-heading">
          <span
            class="replay-result-label"
            :class="{ 'is-historical': desktop && !atEnd }"
            >{{ t(desktop && !atEnd ? 'replay.asOfResult' : 'replay.fullResult') }}</span
          ><button
            v-if="desktop"
            class="text-button replay-metrics-link"
            @click="open('metrics')"
          >
            {{ t('replay.viewMetrics') }}<UIcon name="i-lucide-chevron-right" /></button
          ><button
            v-if="warnings"
            class="text-button replay-warning"
            @click="open('warnings')"
          >
            <UIcon name="i-lucide-triangle-alert" />{{ warnings }}
          </button>
        </div>
        <dl class="replay-summary-metrics">
          <div
            v-for="metric in metrics"
            :key="metric.key"
            :class="{ 'replay-secondary-metric': ['winRate', 'profitFactor'].includes(metric.key) }"
          >
            <dt>{{ t(metric.key === 'trades' ? 'replay.tradeTotal' : `replay.${metric.key}`) }}</dt>
            <dd :class="{ 'is-positive': metric.sign > 0, 'is-negative': metric.sign < 0 }">
              {{ metric.sign > 0 ? '+' : '' }}{{ metric.value }}
            </dd>
          </div>
          <button
            v-if="!desktop"
            class="detail-icon-button"
            :aria-label="t('replay.metrics')"
            @click="open('metrics')"
          >
            <UIcon name="i-lucide-arrow-up-right" />
          </button>
        </dl>
        <div
          v-if="!desktop && shortcuts.length && atEnd"
          class="replay-shortcuts"
          :aria-label="t('replay.resultLocations')"
        >
          <button
            v-for="event in shortcuts"
            :key="event.id"
            class="text-button"
            @click="state.locate(event.selection)"
          >
            {{ t(`replay.shortcuts.${event.kind}`) }}<UIcon name="i-lucide-arrow-up-right" />
          </button>
        </div>
        <div class="replay-chart-region">
          <div class="replay-chart-toolbar">
            <div
              v-if="!playing && availableTimeframes.length > 1"
              class="replay-periods"
              :aria-label="t('replay.viewTimeframe')"
            >
              <button
                v-for="timeframe in availableTimeframes"
                :key="timeframe"
                :aria-pressed="timeframe === displayTimeframe"
                @click="state.setTimeframe(timeframe)"
              >
                {{ timeframe }}
              </button>
            </div>
            <USelect
              v-if="!playing && availableTimeframes.length > 1"
              class="replay-period-select"
              :model-value="displayTimeframe"
              :items="availableTimeframes"
              :aria-label="t('replay.viewTimeframe')"
              size="sm"
              @update:model-value="state.setTimeframe"
            />
            <span
              v-else
              class="replay-period-label"
              >{{ displayTimeframe }}</span
            >
            <span
              v-if="displayTimeframe !== detail.strategy.execution_timeframe"
              class="replay-muted"
              >{{ t('replay.execution', { timeframe: detail.strategy.execution_timeframe }) }}</span
            >
            <UIcon
              v-if="displayLoading"
              name="i-lucide-loader-circle"
              class="chat-spinner"
              :aria-label="t('common.loading')"
            />
            <span class="replay-toolbar-spacer" />
            <UDropdownMenu
              v-if="desktop"
              :items="resultMenu"
              :ui="menuUi"
              :content="{ align: 'end', sideOffset: 4 }"
              :modal="false"
              @update:open="emit('menu', $event)"
            >
              <button
                class="replay-text-trigger"
                :aria-label="t('replay.resultLocations')"
                :disabled="!shortcuts.length"
              >
                {{ t('replay.resultLocations') }}<UIcon name="i-lucide-chevron-down" />
              </button>
            </UDropdownMenu>
            <UTooltip
              :text="t('replay.volume')"
              :delay-duration="400"
              ><button
                class="detail-icon-button"
                :aria-pressed="volume"
                :aria-label="t('replay.volume')"
                @click="volume = !volume"
              >
                <UIcon name="i-lucide-chart-no-axes-column-increasing" /></button
            ></UTooltip>
          </div>
          <div
            v-if="displayError"
            class="replay-inline-error"
            role="alert"
          >
            {{ t(displayError) }}
          </div>
          <ClientOnly>
            <ReplayChart
              :bars="renderedBars"
              :events="renderedEvents"
              :selection="selection"
              :trade="selectedTrade"
              :timeframe="displayTimeframe"
              :playing="playing"
              :follow="follow"
              :range="requestedRange"
              :volume="volume"
              :symbol="detail.conditions.symbol"
              @select="select"
              @range="rangeChanged"
              @interact="interact"
              @follow="follow = true"
            />
            <template #fallback><div class="replay-chart" /></template>
          </ClientOnly>
        </div>
        <div
          v-if="!renderedBars.length"
          class="replay-chart-empty"
          role="status"
        >
          {{
            t(
              phases.candles === 'loading'
                ? 'common.loading'
                : errors.candles
                  ? errors.candles
                  : 'replay.noCandles',
            )
          }}
        </div>
        <div
          v-if="errors.candles"
          class="replay-inline-error"
          role="alert"
        >
          <span v-if="renderedBars.length">{{ t(errors.candles) }}</span
          ><button
            class="text-button"
            @click="state.retry('candles')"
          >
            {{ t('common.retry') }}
          </button>
        </div>
        <div
          v-if="!desktop && currentBar && (!atEnd || selection)"
          class="replay-current-state"
          :aria-busy="currentLoading"
        >
          <span class="replay-state-time">{{ t('replay.afterClose') }}</span
          ><strong>{{
            currentLoading || !currentState?.direction || gapTime
              ? '—'
              : t(`replay.holdingDirection.${currentState.direction}`)
          }}</strong
          ><span
            >{{ t('replay.cumulative') }}
            {{
              currentLoading || gapTime
                ? '—'
                : formatRatio(currentState?.cumulative ?? null, locale, EQUITY_RATE_DIGITS)
            }}</span
          ><span class="replay-current-extra"
            >{{ t('replay.currentDrawdown') }}
            {{
              currentLoading || gapTime
                ? '—'
                : formatRatio(currentState?.drawdown ?? null, locale, EQUITY_RATE_DIGITS)
            }}</span
          ><span class="replay-current-extra"
            >{{ t('replay.unrealized') }}
            {{
              currentLoading || gapTime ? '—' : formatDecimal(currentState?.unrealized, locale)
            }}</span
          ><button
            class="detail-icon-button"
            :aria-label="t('replay.state')"
            @click="open('state')"
          >
            <UIcon name="i-lucide-ellipsis" />
          </button>
        </div>
        <div
          v-if="gapTime !== null"
          class="replay-inline-error"
          role="status"
        >
          <span>{{ t('replay.gap') }}</span
          ><button
            class="text-button"
            @click="state.seek(index + 1)"
          >
            {{ t('replay.nextCandle') }}
          </button>
        </div>
        <div
          v-if="currentError"
          class="replay-inline-error"
          role="alert"
        >
          <span>{{ t(currentError) }}</span
          ><button
            class="text-button"
            @click="state.seek(index)"
          >
            {{ t('common.retry') }}
          </button>
        </div>
        <div
          v-if="locateError"
          class="replay-inline-error"
          role="alert"
        >
          {{ t(locateError) }}
        </div>
        <div class="replay-playback-controls">
          <div class="replay-playback-actions">
            <button
              class="detail-icon-button"
              :aria-label="t('replay.toStart')"
              :disabled="initializing || index <= 0"
              @click="state.seek(0)"
            >
              <UIcon name="i-lucide-skip-back" />
            </button>
            <UTooltip
              :text="t(playing ? 'replay.pause' : atEnd ? 'replay.fromStart' : 'replay.play')"
              :delay-duration="400"
              :disabled="!desktop"
            >
              <button
                class="replay-primary-action"
                :aria-label="
                  t(playing ? 'replay.pause' : atEnd ? 'replay.fromStart' : 'replay.play')
                "
                :disabled="!playing && (!canPlay || gapTime !== null)"
                @click="togglePlayback"
              >
                <UIcon :name="playing ? 'i-lucide-pause' : 'i-lucide-play'" />
                <span class="replay-play-label">{{
                  t(playing ? 'replay.pause' : atEnd ? 'replay.fromStart' : 'replay.play')
                }}</span>
              </button>
            </UTooltip>
            <button
              class="detail-icon-button"
              :aria-label="t('replay.toEnd')"
              :disabled="initializing || atEnd"
              @click="state.seek(state.axis.value.length - 1)"
            >
              <UIcon name="i-lucide-skip-forward" />
            </button>
            <UDropdownMenu
              v-if="desktop"
              :items="speedMenu"
              :ui="menuUi"
              :content="{ align: 'end', sideOffset: 4 }"
              :modal="false"
              @update:open="emit('menu', $event)"
            >
              <button
                class="replay-speed replay-text-trigger"
                :aria-label="t('replay.speed')"
              >
                <span class="replay-speed-value">{{ speed / state.baseSpeed.value }}x</span>
                <UIcon name="i-lucide-chevron-down" />
              </button>
            </UDropdownMenu>
            <select
              v-else
              v-model.number="speed"
              class="replay-speed"
              :aria-label="t('replay.speed')"
            >
              <option
                v-for="option in speedOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>
          <span class="replay-progress-time">{{
            currentBar
              ? desktop
                ? formatDateTime(currentBar.time * 1000)
                : formatDate(new Date(currentBar.time * 1000).toISOString(), locale)
              : initializing
                ? t('common.loading')
                : '—'
          }}</span>
        </div>
        <ReplayTimeline
          :start="detail.conditions.start_at"
          :end="detail.conditions.end_at"
          :current="gapTime ?? currentBar?.time ?? null"
          :events="renderedEvents"
          :bars="state.axis.value"
          :evidence-range="selection?.range"
          :index="index"
          :disabled="initializing || !state.axis.value.length"
          @seek="state.seekTime"
          @pause="state.pause"
        />
        <ReplayEvidencePanel
          :state="state"
          :desktop="desktop"
          @menu="emit('menu', $event)"
          @question="emit('question', $event)"
        />
      </template>
      <div
        v-else
        class="detail-state"
        role="status"
      >
        <UIcon
          v-if="['queued', 'running'].includes(detail.status)"
          name="i-lucide-loader-circle"
          class="chat-spinner"
        />
        <p>{{ detail.error?.message || t(`strategy.replayStatus.${detail.status}`) }}</p>
        <button
          class="text-button"
          @click="state.refresh"
        >
          {{ t('replay.refresh') }}
        </button>
      </div>
      <ReplayDetails
        v-model="reading"
        :state="state"
        :historical="desktop && !atEnd"
      />
    </template>
  </div>
</template>
