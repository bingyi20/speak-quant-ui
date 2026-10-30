<script setup lang="ts">
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  useId,
  useTemplateRef,
  watch,
} from 'vue'
import {
  ColorType,
  CrosshairMode,
  LineSeries,
  TickMarkType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import LoadingState from '~/components/common/LoadingState.vue'
import { formatDateTime, formatDecimal, formatRatio } from '~/lib/format'
import { EQUITY_RATE_DIGITS } from '../historical-result'
import { equityChartPoints, equityChartTimeline, equityVisibleCount } from '../equity-chart'
import type { ReplayEquityCurvePoint } from '../types'

const props = defineProps<{
  points: readonly ReplayEquityCurvePoint[]
  startAt: string
  endAt: string
  cutoff: number
  capitalCurrency: string
  visible: boolean
  loading?: boolean
  loadError?: string
}>()
const emit = defineEmits<{ retry: [] }>()
const { t, locale } = useI18n()
const host = useTemplateRef<HTMLElement>('host')
const readoutId = useId()
const hoveredIndex = ref<number | null>(null)
const failure = ref(false)
const start = computed(() => Date.parse(props.startAt) / 1000)
const end = computed(() => Date.parse(props.endAt) / 1000)
const normalized = computed(() => {
  try {
    const points = equityChartPoints(props.points)
    return { points, timeline: equityChartTimeline(points, start.value, end.value) }
  } catch {
    return null
  }
})
const visibleCount = computed(() =>
  normalized.value ? equityVisibleCount(normalized.value.points, props.cutoff) : 0,
)
const current = computed(() => normalized.value?.points[visibleCount.value - 1]?.source ?? null)
const hovered = computed(() => {
  const index = hoveredIndex.value
  return index !== null && index < visibleCount.value
    ? (normalized.value?.points[index]?.source ?? null)
    : null
})
const quoted = computed(() => hovered.value ?? current.value)
const date = (value: ReplayEquityCurvePoint | null) => (value ? formatDateTime(value.time) : '—')
const amount = (value: ReplayEquityCurvePoint | null) => formatDecimal(value?.equity, locale.value)
const rate = (value: ReplayEquityCurvePoint | null) =>
  formatRatio(value?.net_return_rate ?? null, locale.value, EQUITY_RATE_DIGITS)

let chart: IChartApi | undefined
let line: ISeriesApi<'Line'> | undefined
let timeline: ISeriesApi<'Line'> | undefined
let resize: ResizeObserver | undefined
let themeObserver: MutationObserver | undefined
let rendered: typeof normalized.value | undefined
let renderedCount = 0
let frame = 0
let activation = 0
let active = false
let attached = true
let alive = true

function applyTheme() {
  if (!host.value || !chart || !line) return
  const css = getComputedStyle(host.value)
  const color = (key: string) => css.getPropertyValue(key).trim()
  chart.applyOptions({
    layout: {
      background: { type: ColorType.Solid, color: color('--color-bg-surface') },
      textColor: color('--color-text-muted'),
      fontFamily: css.fontFamily,
    },
    grid: { horzLines: { color: color('--color-chart-grid') } },
    timeScale: { borderColor: color('--color-chart-grid') },
    crosshair: {
      vertLine: { color: color('--color-text-muted') },
      horzLine: { color: color('--color-text-muted') },
    },
  })
  line.applyOptions({ color: color('--color-brand') })
}

function fitRange() {
  if (!chart || !normalized.value) return
  chart.timeScale().setVisibleRange({
    from: start.value as UTCTimestamp,
    to: end.value as UTCTimestamp,
  })
}

function render() {
  if (!active || !chart || !line || !timeline) return
  const value = normalized.value
  if (!value) {
    failure.value = !props.loading && !props.loadError
    return
  }
  failure.value = false
  const data = (index: number) => {
    const point = value.points[index]!
    return { time: point.time as UTCTimestamp, value: point.value }
  }
  // Whitespace pins every execution time on the x-axis. The value series contains
  // only the revealed prefix, so future values cannot affect autoscale or hover.
  if (rendered !== value) {
    timeline.setData(value.timeline.map((time) => ({ time: time as UTCTimestamp })))
    line.setData(value.points.slice(0, visibleCount.value).map((_, index) => data(index)))
    rendered = value
  } else if (visibleCount.value < renderedCount) {
    line.setData(value.points.slice(0, visibleCount.value).map((_, index) => data(index)))
  } else {
    for (let index = renderedCount; index < visibleCount.value; index++) line.update(data(index))
  }
  renderedCount = visibleCount.value
  fitRange()
}

function clearHover() {
  hoveredIndex.value = null
  chart?.clearCrosshairPosition()
}

function onCrosshair(event: MouseEventParams) {
  if (!active || !event.point || typeof event.time !== 'number' || !normalized.value) {
    hoveredIndex.value = null
    return
  }
  const position = equityVisibleCount(normalized.value.points, event.time) - 1
  hoveredIndex.value =
    position >= 0 &&
    position < visibleCount.value &&
    normalized.value.points[position]?.time === event.time
      ? position
      : null
}

function keydown(event: KeyboardEvent) {
  if (!visibleCount.value || !normalized.value || !chart || !line) return
  const last = visibleCount.value - 1
  const previous = hoveredIndex.value ?? last
  const next =
    event.key === 'ArrowLeft'
      ? Math.max(0, previous - 1)
      : event.key === 'ArrowRight'
        ? Math.min(last, previous + 1)
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : null
  if (next === null) return
  event.preventDefault()
  hoveredIndex.value = next
  const point = normalized.value.points[next]!
  chart.setCrosshairPosition(point.value, point.time as UTCTimestamp, line)
}

function resizeChart() {
  if (!active || !host.value || !chart) return
  const { width, height } = host.value.getBoundingClientRect()
  if (width <= 0 || height <= 0) return
  chart.resize(width, height)
  line?.priceScale().applyOptions({
    scaleMargins: {
      top: Math.min(0.4, Math.max(0.1, 76 / Math.max(1, height - 28))),
      bottom: 0.08,
    },
  })
  fitRange()
}

function mountChart() {
  if (!host.value) return
  failure.value = false
  try {
    chart?.remove()
    chart = undefined
    rendered = undefined
    renderedCount = 0
    chart = createChart(host.value, {
      width: Math.max(1, host.value.clientWidth),
      height: Math.max(1, host.value.clientHeight),
      layout: { fontSize: 12, attributionLogo: false },
      grid: { vertLines: { visible: false } },
      rightPriceScale: { borderVisible: false, minimumWidth: 68 },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 0,
        // Future whitespace needs a positive right offset beyond the last real
        // value. fixRightEdge would clamp that offset to zero during playback.
        fixLeftEdge: false,
        fixRightEdge: false,
        shiftVisibleRangeOnNewBar: false,
        ignoreWhitespaceIndices: false,
        minBarSpacing: 0.001,
        tickMarkFormatter: (time: Time, type: TickMarkType) => {
          const text = formatDateTime(Number(time) * 1000)
          if (type >= TickMarkType.Time) return text.slice(11)
          if (type === TickMarkType.Year) return text.slice(0, 4)
          if (type === TickMarkType.Month) return text.slice(0, 7)
          return text.slice(5, 10)
        },
      },
      localization: {
        locale: locale.value,
        timeFormatter: (time: Time) => formatDateTime(Number(time) * 1000),
        priceFormatter: (price: number) => formatDecimal(String(price), locale.value),
      },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: false,
      handleScale: false,
    })
    timeline = chart.addSeries(LineSeries, {
      lineVisible: false,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    })
    line = chart.addSeries(LineSeries, {
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerRadius: 3,
    })
    chart.subscribeCrosshairMove(onCrosshair)
    applyTheme()
    render()
    resizeChart()
  } catch {
    chart?.remove()
    chart = undefined
    line = undefined
    timeline = undefined
    failure.value = true
  }
}

async function activate() {
  const ticket = ++activation
  if (!props.visible || !attached) return
  await nextTick()
  if (!alive || !props.visible || !attached || activation !== ticket || !host.value) return
  active = true
  resize?.observe(host.value)
  themeObserver?.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class'],
  })
  if (!chart) mountChart()
  else {
    applyTheme()
    render()
    resizeChart()
  }
}

function deactivate() {
  activation++
  active = false
  clearHover()
  cancelAnimationFrame(frame)
  resize?.disconnect()
  themeObserver?.disconnect()
}

watch([normalized, visibleCount], () => {
  if (hoveredIndex.value !== null && hoveredIndex.value >= visibleCount.value) clearHover()
  render()
})
watch(locale, () => {
  chart?.applyOptions({ localization: { locale: locale.value } })
})
watch(
  () => props.visible,
  (visible) => (visible ? void activate() : deactivate()),
)
onMounted(() => {
  resize = new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(resizeChart)
  })
  themeObserver = new MutationObserver(() => {
    if (active) applyTheme()
  })
  void activate()
})
onActivated(() => {
  attached = true
  void activate()
})
onDeactivated(() => {
  attached = false
  deactivate()
})
onBeforeUnmount(() => {
  alive = false
  deactivate()
  chart?.remove()
  chart = undefined
})
</script>

<template>
  <div class="replay-chart-block replay-equity-block">
    <div
      :id="readoutId"
      class="replay-quote replay-equity-quote"
      aria-live="off"
    >
      <div class="replay-quote-date">
        <span>{{ t('replay.equityCurve') }}</span>
        <time :datetime="quoted?.time">{{ date(quoted) }}</time>
      </div>
      <dl class="replay-ohlc replay-equity-values">
        <div>
          <dt>{{ t('replay.currentEquity') }}</dt>
          <dd class="replay-equity-current">{{ amount(quoted) }} {{ capitalCurrency }}</dd>
        </div>
        <div>
          <dt>{{ t('replay.equityReturn') }}</dt>
          <dd
            class="replay-equity-return"
            :class="{
              'is-positive': Number(quoted?.net_return_rate) > 0,
              'is-negative': Number(quoted?.net_return_rate) < 0,
            }"
          >
            {{ rate(quoted) }}
          </dd>
        </div>
      </dl>
    </div>
    <div
      ref="host"
      class="replay-chart replay-equity-chart"
      role="img"
      tabindex="0"
      :aria-label="t('replay.equityChartLabel')"
      :aria-describedby="readoutId"
      :aria-busy="loading"
      :data-visible-count="visibleCount"
      :data-visible-end="normalized?.points[visibleCount - 1]?.time"
      :data-range-start="start"
      :data-range-end="end"
      @keydown="keydown"
      @blur="clearHover"
      @pointerleave="clearHover"
    />
    <LoadingState
      v-if="loading"
      class="replay-chart-loading"
      fill
    />
    <div
      v-else-if="loadError"
      class="replay-chart-empty"
      role="alert"
    >
      <span>{{ t(loadError) }}</span>
      <button
        class="text-button"
        @click="emit('retry')"
      >
        {{ t('common.retry') }}
      </button>
    </div>
    <div
      v-else-if="failure"
      class="replay-chart-failure"
      role="alert"
    >
      <span>{{ t('replay.errors.chart') }}</span>
      <button
        class="text-button"
        @click="mountChart"
      >
        {{ t('common.retry') }}
      </button>
    </div>
    <div
      v-else-if="!current"
      class="replay-chart-empty"
      role="status"
    >
      {{ t('replay.equityEmpty') }}
    </div>
  </div>
</template>
