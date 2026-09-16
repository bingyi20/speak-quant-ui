<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { formatDate, formatDecimal, formatRatio } from '~/lib/format'
import ReplayChart from './ReplayChart.client.vue'
import ReplayTimeline from './ReplayTimeline.vue'
import ReplayEvidencePanel from './ReplayEvidencePanel.vue'
import ReplayDetails from './ReplayDetails.vue'
import RunnerDownloadDialog from '~/features/runner/components/RunnerDownloadDialog.vue'
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
  mode,
  status,
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
const body = useTemplateRef<HTMLElement>('body'),
  chart = useTemplateRef<InstanceType<typeof ReplayChart>>('chart')
const reading = ref<'conditions' | 'metrics' | 'report' | 'state' | 'warnings' | null>(null),
  downloadOpen = ref(false),
  volume = ref(false)
const complete = computed(() => detail.value?.status === 'completed')
const warnings = computed(() => detail.value?.result?.quality_warnings?.length ?? 0)
const metrics = computed(() => {
  const r = detail.value?.result
  return r
    ? [
        {
          key: 'netReturn',
          value: formatRatio(r.net_return_rate, locale.value),
          sign: Number(r.net_return_rate),
        },
        { key: 'drawdown', value: formatRatio(r.max_drawdown_rate, locale.value), sign: 0 },
        { key: 'trades', value: String(r.trade_count), sign: 0 },
        { key: 'winRate', value: formatRatio(r.win_rate, locale.value), sign: 0 },
        { key: 'profitFactor', value: formatDecimal(r.profit_factor, locale.value), sign: 0 },
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
function open(kind: 'conditions' | 'metrics' | 'report' | 'state' | 'warnings' | 'download') {
  props.state.pause()
  if (kind === 'download') downloadOpen.value = true
  else reading.value = kind
}
defineExpose({ open })
watch([reading, downloadOpen], () => emit('menu', !!reading.value || downloadOpen.value))
watch(
  () => props.active,
  (value) => {
    if (!value) {
      reading.value = null
      downloadOpen.value = false
      props.state.pause()
    }
  },
)
watch(
  () => detail.value?.id,
  () => {
    reading.value = null
    downloadOpen.value = false
    volume.value = false
  },
)
watch(scrollTop, async (value) => {
  await nextTick()
  if (body.value && Math.abs(body.value.scrollTop - value) > 1) body.value.scrollTop = value
})
function select(time: number, markerId?: string) {
  const event = markerId ? events.value.find((e) => e.id === markerId) : null
  if (event) void props.state.locate(event.selection)
  else void props.state.selectCandle(time)
}
let rangeTimer: ReturnType<typeof setTimeout> | undefined
function rangeChanged(range: { from: number; to: number }) {
  viewRange.value = range
  clearTimeout(rangeTimer)
  if (
    mode.value !== 'overview' ||
    displayTimeframe.value === detail.value?.strategy.execution_timeframe ||
    displayLoading.value
  )
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
function interact() {
  props.state.pause()
  follow.value = false
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
          >{{ detail.conditions.start_at.slice(0, 10) }} —
          {{ detail.conditions.end_at.slice(0, 10) }}</span
        ><button
          class="text-button"
          @click="open('conditions')"
        >
          {{ t('replay.conditions') }}<UIcon name="i-lucide-sliders-horizontal" />
        </button>
      </div>
      <template v-if="detail.result && complete">
        <div class="replay-summary-heading">
          <span>{{ t('replay.fullResult') }}</span
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
            <dt>{{ t(`replay.${metric.key}`) }}</dt>
            <dd :class="{ 'is-positive': metric.sign > 0, 'is-negative': metric.sign < 0 }">
              {{ metric.sign > 0 ? '+' : '' }}{{ metric.value }}
            </dd>
          </div>
          <button
            class="detail-icon-button"
            :aria-label="t('replay.metrics')"
            @click="open('metrics')"
          >
            <UIcon name="i-lucide-arrow-up-right" />
          </button>
        </dl>
        <div class="replay-chart-toolbar">
          <div
            v-if="mode === 'overview' && availableTimeframes.length > 1"
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
            v-if="mode === 'overview' && availableTimeframes.length > 1"
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
          <UTooltip
            :text="t('replay.resetChart')"
            :delay-duration="400"
            ><button
              class="detail-icon-button"
              :aria-label="t('replay.resetChart')"
              @click="chart?.reset()"
            >
              <UIcon name="i-lucide-scan" /></button
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
            ref="chart"
            :bars="renderedBars"
            :events="renderedEvents"
            :selection="selection"
            :trade="selectedTrade"
            :timeframe="displayTimeframe"
            :mode="mode"
            :follow="follow"
            :range="requestedRange"
            :volume="volume"
            :symbol="detail.conditions.symbol"
            @select="select"
            @range="rangeChanged"
            @interact="interact"
          />
          <template #fallback><div class="replay-chart" /></template>
        </ClientOnly>
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
          v-if="mode === 'playback' || currentBar"
          class="replay-current-state"
          :aria-busy="currentLoading"
          :title="t('replay.afterClose')"
        >
          <time
            >{{
              currentBar
                ? formatDate(new Date(currentBar.time * 1000).toISOString(), locale)
                : t('replay.starting')
            }}
            UTC</time
          ><strong>{{
            currentLoading || !currentState?.direction || gapTime
              ? '—'
              : t(`replay.direction.${currentState.direction}`)
          }}</strong
          ><span
            >{{ t('replay.cumulative') }}
            {{
              currentLoading || gapTime
                ? '—'
                : formatRatio(currentState?.cumulative ?? null, locale)
            }}</span
          ><span class="replay-current-extra"
            >{{ t('replay.currentDrawdown') }}
            {{
              currentLoading || gapTime ? '—' : formatRatio(currentState?.drawdown ?? null, locale)
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
          <span
            class="replay-mode"
            role="status"
            >{{ t(mode === 'overview' ? 'replay.overview' : `replay.playback.${status}`) }}</span
          >
          <div
            v-if="mode === 'overview'"
            class="replay-playback-actions"
          >
            <button
              v-if="index >= 0"
              class="text-button"
              :disabled="!canPlay"
              @click="state.start()"
            >
              {{ t('replay.fromStart') }}</button
            ><button
              class="replay-primary-action"
              :disabled="!canPlay"
              @click="state.start(index >= 0 ? index : -1)"
            >
              <UIcon name="i-lucide-play" />{{
                t(index >= 0 ? 'replay.fromHere' : 'replay.fromStart')
              }}
            </button>
          </div>
          <div
            v-else
            class="replay-playback-actions"
          >
            <button
              class="detail-icon-button"
              :aria-label="t('replay.previousEvent')"
              :disabled="!state.processEvents.value.some((e) => e.index < index)"
              @click="state.stepEvent(-1)"
            >
              <UIcon name="i-lucide-skip-back" /></button
            ><button
              class="replay-primary-action replay-play-toggle"
              :aria-label="t(playing ? 'replay.pause' : 'replay.play')"
              :disabled="!playing && (!canPlay || gapTime !== null)"
              @click="playing ? state.pause() : state.play()"
            >
              <UIcon :name="playing ? 'i-lucide-pause' : 'i-lucide-play'" /></button
            ><button
              class="detail-icon-button"
              :aria-label="t('replay.nextEvent')"
              :disabled="!state.processEvents.value.some((e) => e.index > index)"
              @click="state.stepEvent(1)"
            >
              <UIcon name="i-lucide-skip-forward" /></button
            ><select
              v-model.number="speed"
              class="replay-speed"
              :aria-label="t('replay.speed')"
            >
              <option
                v-for="value in speeds"
                :key="value"
                :value="value"
              >
                {{ value }}×
              </option></select
            ><button
              class="text-button"
              @click="state.overview"
            >
              {{ t('replay.viewResult') }}
            </button>
          </div>
        </div>
        <ReplayTimeline
          :start="detail.conditions.start_at"
          :end="detail.conditions.end_at"
          :current="gapTime ?? currentBar?.time ?? null"
          :events="events"
          :bars="state.axis.value"
          :evidence-range="selection?.range"
          :playback="mode === 'playback'"
          :index="index"
          :disabled="!state.axis.value.length"
          @seek="state.seekTime"
          @select="state.locate($event.selection)"
          @pause="state.pause"
        />
        <ReplayEvidencePanel
          :state="state"
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
      />
      <RunnerDownloadDialog
        v-model:open="downloadOpen"
        :node-id="detail.strategy.node_id"
        :replay-id="detail.id"
        :name="detail.name"
        :strategy-name="detail.strategy.name"
        :summary="detail.strategy.change_summary"
        :symbol="detail.conditions.symbol"
        :timeframe="detail.strategy.execution_timeframe"
      />
    </template>
  </div>
</template>
