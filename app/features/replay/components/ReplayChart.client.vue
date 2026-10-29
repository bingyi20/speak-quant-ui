<script setup lang="ts">
import LoadingState from '~/components/common/LoadingState.vue'
import {
  computed,
  nextTick,
  onActivated,
  onDeactivated,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from 'vue'
import type {
  ChartAdapter,
  ChartMarker,
  ChartMarkerHit,
  ChartRange,
  ChartViewportRequest,
  ChartTheme,
} from '~/lib/chart/adapter'
import {
  formatDate,
  formatDateTime,
  formatDecimal,
  formatRatio,
  formatQuantity,
} from '~/lib/format'
import { tradeTooltipPosition } from '~/lib/chart/tooltip-position'
import { nearestBar, nextBarTime } from '../normalize'
import ReplayFillTooltip from './ReplayFillTooltip.vue'
import { candleChange } from '../visibility'
import type { ReplayBar, ReplayEvent, ReplaySelection, ReplayTradeView } from '../types'
const props = defineProps<{
  bars: readonly ReplayBar[]
  events: readonly ReplayEvent[]
  selection: ReplaySelection | null
  trade: ReplayTradeView | null
  timeframe: string
  playing: boolean
  follow: boolean
  range: (ChartViewportRequest & { revision: number }) | null
  initialRange: ChartRange | null
  initialSeekRevision: number
  seekRevision: number
  seekCutoff: number | null
  volume: boolean
  symbol: string
  instrument: string
  visible: boolean
  loading?: boolean
  emptyLabel?: string
  loadError?: string
}>()
const emit = defineEmits<{
  select: [time: number, markerId?: string]
  range: [value: ChartRange, instrument: string]
  interact: []
  follow: []
  hover: [time: number | null]
  retry: []
}>()
const { t, locale } = useI18n()
// This component and its canvas belong to one frozen instrument for their entire lifetime.
const instrument = props.instrument
let active = props.visible,
  attached = true,
  activation = 0,
  mountRevision = 0
let appliedRangeRevision: number | undefined
let appliedSeekRevision = props.seekRevision
let suspendedFollow = props.follow
let pendingResume: {
  follow: boolean
  seek: boolean
  revision: number
  cutoff: number | null
} | null = null
const host = useTemplateRef<HTMLElement>('host'),
  hover = ref<ReplayBar | null>(null),
  failure = ref(false),
  mounting = ref(true),
  canReturn = ref(false)
const hoveredTag = ref<ChartMarkerHit | null>(null)
const hoveredFill = ref<ReplayEvent | null>(null)
const fillElement = useTemplateRef<HTMLElement>('fillElement')
const fillSize = ref({ width: 240, height: 86 })
let fillResize: ResizeObserver | undefined
watch(fillElement, (element) => {
  fillResize?.disconnect()
  if (!element) return
  const measure = () => {
    fillSize.value = { width: element.offsetWidth, height: element.offsetHeight }
  }
  measure()
  fillResize = new ResizeObserver(measure)
  fillResize.observe(element)
})
const fillMaxHeight = computed(() => Math.max(86, (host.value?.clientHeight ?? 300) - 44))
const fillPosition = computed(() => {
  const tag = hoveredTag.value
  if (!tag || !host.value) return null
  return tradeTooltipPosition(
    tag,
    { ...fillSize.value, height: Math.min(fillSize.value.height, fillMaxHeight.value) },
    { width: host.value.clientWidth - 68, height: host.value.clientHeight - 28 },
  )
})
const fillStyle = computed(() => ({
  left: `${fillPosition.value?.left ?? 8}px`,
  top: `${fillPosition.value?.top ?? 8}px`,
  maxHeight: `${fillMaxHeight.value}px`,
}))

function interact() {
  clearFill()
  emit('interact')
}
let fillCloseTimer: ReturnType<typeof setTimeout> | undefined
let insideFill = false
function keepFill() {
  clearTimeout(fillCloseTimer)
  fillCloseTimer = undefined
}
function enterFill() {
  insideFill = true
  keepFill()
}
function scheduleFillClose() {
  if (insideFill || fillCloseTimer) return
  fillCloseTimer = setTimeout(clearFill, 220)
}
function leaveFill() {
  insideFill = false
  scheduleFillClose()
}
function clearFill() {
  keepFill()
  insideFill = false
  hoveredTag.value = null
  hoveredFill.value = null
}
const desktop = () => window.matchMedia('(min-width: 761px)').matches
const markerEvents = new Map<string, ReplayEvent>()
const quoted = computed(() => {
  const row = hover.value ? props.bars[nearestBar(props.bars, hover.value.time)] : undefined
  return row && row.time === hover.value?.time ? row : props.bars.at(-1)
})
const changes = computed(() => {
  const n = quoted.value ? nearestBar(props.bars, quoted.value.time) : -1
  return candleChange(quoted.value, props.bars[n - 1], props.timeframe)
})
const quoteDate = computed(() => {
  if (!quoted.value) return '—'
  const time = quoted.value.time * 1000
  if (desktop()) return formatDateTime(time)
  return (
    formatDate(new Date(time).toISOString(), locale.value) +
    ' ' +
    new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: 'UTC' }).format(time)
  )
})
let adapter: ChartAdapter | undefined,
  resize: ResizeObserver | undefined,
  themeObserver: MutationObserver | undefined,
  frame = 0,
  alive = true
let previous: readonly ReplayBar[] = [],
  initial = true
const price = (value?: number) =>
  formatDecimal(value?.toString(), locale.value, value !== undefined && Math.abs(value) < 1 ? 8 : 2)
function theme(): ChartTheme {
  const css = getComputedStyle(host.value!)
  const value = (key: string) => css.getPropertyValue(key).trim()
  return {
    background: value('--color-bg-surface'),
    text: value('--color-text-muted'),
    grid: value('--color-chart-grid'),
    up: value(desktop() ? '--color-chart-candle-up' : '--color-chart-up'),
    buy: value('--color-chart-buy'),
    sell: value('--color-chart-sell'),
    buyText: value('--color-chart-buy-text'),
    sellText: value('--color-chart-sell-text'),
    tagText: value('--color-chart-tag-text'),
    down: value(desktop() ? '--color-chart-candle-down' : '--color-chart-down'),
    accent: value('--color-brand'),
    volumeUp: value(desktop() ? '--color-chart-candle-volume-up' : '--color-chart-volume-up'),
    volumeDown: value(desktop() ? '--color-chart-candle-volume-down' : '--color-chart-volume-down'),
  }
}
function markers() {
  if (!active) return
  markerEvents.clear()
  const bars = props.bars,
    values: ChartMarker[] = []
  for (const event of props.events) {
    if (event.kind !== 'fill' || !event.fill) continue
    const time = Date.parse(event.fill.occurred_at) / 1000
    let lo = 0,
      hi = bars.length - 1
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2)
      if (bars[mid]!.time <= time) lo = mid + 1
      else hi = mid - 1
    }
    const candidate = bars[event.index]
    const bar = candidate?.id === event.selection.candleId ? candidate : bars[hi]
    if (!bar) continue
    const end = bar.closeTime ?? nextBarTime(bar.time, props.timeframe)
    if (end && time > end) continue
    markerEvents.set(event.id, event)
    values.push({
      id: event.id,
      time: bar.time,
      side: event.fill.side === 'buy' ? 'buy' : 'sell',
      positionDirection:
        event.trade?.direction === 'long' || event.trade?.direction === 'short'
          ? event.trade.direction
          : undefined,
      price: Number(event.fill.price),
      edgePrice: bar.high,
      label: event.fill.side === 'buy' ? 'B' : 'S',
    })
  }
  values.sort((a, b) => a.time - b.time)
  adapter?.setMarkers(values)
}
function selected() {
  if (!active) return
  const trade = props.trade
  const selectedBar = props.selection?.candleId
    ? props.bars.find((c) => c.id === props.selection?.candleId)
    : null
  adapter?.setSelection(
    props.selection
      ? {
          range:
            props.selection.range ??
            (selectedBar
              ? {
                  from: selectedBar.time,
                  to:
                    selectedBar.closeTime ??
                    nextBarTime(selectedBar.time, props.timeframe) ??
                    selectedBar.time,
                }
              : undefined),
          prices: trade
            ? [
                ...(trade.entry_price
                  ? [{ price: Number(trade.entry_price), label: t('replay.entry') }]
                  : []),
                ...(trade.exit_price
                  ? [{ price: Number(trade.exit_price), label: t('replay.exit') }]
                  : []),
              ]
            : [],
        }
      : null,
  )
  markers()
}
function draw(preserveViewport = false) {
  if (!adapter || !active) return
  if (pendingResume && pendingResume.revision !== props.seekRevision)
    pendingResume = {
      follow: true,
      seek: true,
      revision: props.seekRevision,
      cutoff: props.seekCutoff,
    }
  const rows = props.bars
  const append =
    props.playing &&
    previous.length > 0 &&
    rows.length >= previous.length &&
    rows[0]?.id === previous[0]?.id &&
    rows[previous.length - 1]?.id === previous.at(-1)?.id
  if (append) adapter.appendData(rows.slice(previous.length))
  else adapter.setData(rows)
  previous = rows
  if (initial && rows.length) {
    const from = rows[Math.max(0, rows.length - 200)]!.time,
      to = rows.at(-1)!.time
    if (desktop()) adapter.resetView()
    else if (to > from) adapter.setVisibleRange({ from, to })
    initial = false
  } else if (preserveViewport || pendingResume) {
    // resumeViewport settles the cached policy after current data is installed.
  } else if (rows.length && appliedSeekRevision !== props.seekRevision) {
    adapter.seek(rows.at(-1)!.time)
    appliedSeekRevision = props.seekRevision
  } else if (props.follow && rows.length) adapter.follow()
  if (pendingResume) {
    const pending = pendingResume
    const seekBar =
      pending.seek && pending.cutoff !== null
        ? rows.findLast(
            (bar) =>
              (bar.closeTime ?? nextBarTime(bar.time, props.timeframe) ?? Infinity) <=
              pending.cutoff!,
          )
        : undefined
    if (
      adapter.resumeViewport({
        follow: pending.follow,
        seek: pending.seek,
        seekTime: seekBar?.time ?? -Infinity,
      })
    ) {
      appliedSeekRevision = pending.revision
      pendingResume = null
      if (props.range) applyRange(props.range)
      const range = adapter.getViewState()
      if (range) emit('range', range, instrument)
    }
  }
  selected()
}
async function mount() {
  const revision = ++mountRevision
  failure.value = false
  mounting.value = true
  try {
    const { createLightweightChart } = await import('~/lib/chart/lightweight')
    if (!alive || !active || revision !== mountRevision || !host.value) return
    adapter?.destroy()
    adapter = createLightweightChart(host.value, theme())
    appliedSeekRevision = props.seekRevision
    initial = true
    previous = []
    adapter.onRangeChange((range) => {
      if (active && !pendingResume) emit('range', range, instrument)
    })
    adapter.onReturnVisibilityChange((visible) => {
      canReturn.value = visible
    })
    adapter.onSelect((time, marker) => {
      if (!active) return
      if (desktop()) {
        const bar = props.bars[nearestBar(props.bars, time)]
        hover.value = bar?.time === time ? bar : null
        return
      }
      emit('select', time, marker)
    })
    adapter.onCrosshair((time, marker) => {
      if (!active) return
      if (desktop()) {
        if (marker) {
          keepFill()
          hoveredTag.value = marker
          hoveredFill.value = markerEvents.get(marker.id) ?? null
        } else scheduleFillClose()
      }
      const bar = time === null ? undefined : props.bars[nearestBar(props.bars, time)]
      hover.value = bar?.time === time ? bar : null
      emit('hover', time)
    })
    adapter.setVolume(props.volume)
    const initialRange = props.initialRange
    draw()
    if (initialRange) {
      adapter.setVisibleRange(initialRange)
      // A global seek may have happened after reopening the replay, before this
      // instrument's cached snapshot has been recreated as an SDK instance.
      if (props.initialSeekRevision !== props.seekRevision && props.bars.length)
        adapter.seek(props.bars.at(-1)!.time)
    }
    if (props.range) applyRange(props.range)
  } catch {
    failure.value = true
  } finally {
    if (alive && revision === mountRevision) mounting.value = false
  }
}
function applyRange(range: ChartViewportRequest & { revision: number }) {
  if (!active || !adapter || pendingResume || range.revision === appliedRangeRevision) return
  appliedRangeRevision = range.revision
  if ('revealTime' in range) adapter?.revealTime(range.revealTime)
  else if ('seekTime' in range) {
    adapter.seek(range.seekTime)
    appliedSeekRevision = props.seekRevision
  } else if (desktop() && range.focusTime !== undefined) adapter?.resetView(range.focusTime)
  else adapter?.setVisibleRange(range)
}
function followLatest() {
  if (!adapter) return
  clearFill()
  emit('follow')
  adapter.follow(true)
}
watch(
  () => props.bars,
  () => {
    const cutoff = props.bars.at(-1)?.time ?? -Infinity
    if (
      !hoveredFill.value ||
      hoveredFill.value.time > cutoff ||
      !props.events.some((visible) => visible.id === hoveredFill.value?.id)
    )
      clearFill()
    hover.value = null
    draw()
  },
)
watch([() => props.events, () => props.selection, () => props.trade, locale], selected)
watch(
  () => props.range,
  (range) => {
    if (range) applyRange(range)
  },
)
watch(
  () => props.volume,
  (value) => {
    if (active) adapter?.setVolume(value)
  },
)
async function activate() {
  if (!props.visible || !attached) return
  const ticket = ++activation
  await nextTick()
  if (!alive || !props.visible || !attached || ticket !== activation || !host.value) return
  active = true
  resize?.observe(host.value)
  themeObserver?.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class'],
  })
  if (!adapter) {
    await mount()
    return
  }
  adapter.setActive(true)
  const bounds = host.value.getBoundingClientRect()
  adapter.resize(bounds.width, bounds.height)
  adapter.applyTheme(theme())
  adapter.setVolume(props.volume)
  const seek = appliedSeekRevision !== props.seekRevision
  pendingResume = {
    follow: seek || suspendedFollow,
    seek,
    revision: props.seekRevision,
    cutoff: props.seekCutoff,
  }
  draw(true)
  if (props.range) applyRange(props.range)
  const range = adapter.getViewState()
  if (range && !pendingResume) emit('range', range, instrument)
}
function deactivate() {
  if (active) suspendedFollow = props.follow
  active = false
  activation++
  mountRevision++
  clearFill()
  hover.value = null
  cancelAnimationFrame(frame)
  fillResize?.disconnect()
  resize?.disconnect()
  themeObserver?.disconnect()
  adapter?.setActive(false)
}
onMounted(() => {
  resize = new ResizeObserver(() => {
    if (!active) return
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const r = host.value?.getBoundingClientRect()
      if (active && r) adapter?.resize(r.width, r.height)
    })
  })
  themeObserver = new MutationObserver(() => {
    if (active && host.value) adapter?.applyTheme(theme())
  })
  void activate()
})
watch(
  () => props.visible,
  (value) => {
    if (value) void activate()
    else deactivate()
  },
)
onActivated(() => {
  attached = true
  void activate()
})
onDeactivated(() => {
  attached = false
  deactivate()
})
onBeforeUnmount(() => {
  deactivate()
  alive = false
  cancelAnimationFrame(frame)
  resize?.disconnect()
  themeObserver?.disconnect()
  adapter?.destroy()
})
</script>
<template>
  <div
    class="replay-chart-block"
    :data-instrument="instrument"
  >
    <div
      class="replay-quote"
      aria-live="off"
    >
      <div class="replay-quote-date">
        <span>{{ symbol }}</span
        ><time :datetime="quoted ? new Date(quoted.time * 1000).toISOString() : undefined">{{
          quoteDate
        }}</time>
      </div>
      <dl
        class="replay-ohlc"
        :class="
          quoted ? (quoted.close >= quoted.open ? 'is-candle-up' : 'is-candle-down') : undefined
        "
      >
        <div
          v-for="key in ['open', 'high', 'low', 'close'] as const"
          :key="key"
        >
          <dt>{{ t(`replay.${desktop() ? 'ohlcShort' : 'ohlc'}.${key}`) }}</dt>
          <dd>{{ price(quoted?.[key]) }}</dd>
        </div>
        <div>
          <dt>{{ t('replay.priceChange') }}</dt>
          <dd
            :class="{
              'is-positive': (changes.amount ?? 0) > 0,
              'is-negative': (changes.amount ?? 0) < 0,
            }"
          >
            {{ (changes.amount ?? 0) > 0 ? '+' : ''
            }}{{ changes.amount === null ? '—' : price(changes.amount) }}
          </dd>
        </div>
        <div>
          <dt>{{ t('replay.percentChange') }}</dt>
          <dd
            :class="{
              'is-positive': (changes.rate ?? 0) > 0,
              'is-negative': (changes.rate ?? 0) < 0,
            }"
          >
            {{ (changes.rate ?? 0) > 0 ? '+' : ''
            }}{{ formatRatio(changes.rate === null ? null : String(changes.rate), locale) }}
          </dd>
        </div>
        <div>
          <dt>{{ t('replay.volume') }}</dt>
          <dd class="replay-quote-volume">
            {{
              desktop()
                ? formatQuantity(quoted?.volume.toString(), locale)
                : formatDecimal(quoted?.volume.toString(), locale)
            }}
          </dd>
        </div>
      </dl>
    </div>
    <div
      v-if="hoveredTag && hoveredFill"
      ref="fillElement"
      class="replay-chart-local-fill"
      :data-placement="fillPosition?.placement"
      role="tooltip"
      :style="fillStyle"
      @pointerenter="enterFill"
      @pointerleave="leaveFill"
    >
      <ReplayFillTooltip :event="hoveredFill" />
    </div>
    <div
      ref="host"
      class="replay-chart"
      role="img"
      :data-visible-start="bars[0]?.time"
      :data-visible-end="bars.at(-1)?.time"
      :aria-label="t('replay.chartLabel', { symbol, timeframe })"
      :aria-busy="loading || mounting"
      @pointerdown="interact"
      @wheel.passive="interact"
      @pointerleave="scheduleFillClose"
    />
    <LoadingState
      v-if="!failure && (loading || mounting)"
      class="replay-chart-loading"
      fill
    />
    <div
      v-else-if="!failure && !bars.length && loadError"
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
      v-else-if="!failure && !bars.length && emptyLabel"
      class="replay-chart-empty"
      role="status"
    >
      {{ emptyLabel }}
    </div>
    <UTooltip
      v-if="canReturn && bars.length && !failure"
      :text="t('replay.followLatest')"
      :delay-duration="400"
    >
      <button
        class="replay-follow-latest"
        :aria-label="t('replay.followLatest')"
        @click="followLatest"
      >
        <UIcon name="i-lucide-chevrons-right" />
      </button>
    </UTooltip>
    <div
      v-if="failure"
      class="replay-chart-failure"
      role="alert"
    >
      <span>{{ t('replay.errors.chart') }}</span
      ><button
        class="text-button"
        @click="mount"
      >
        {{ t('common.retry') }}
      </button>
    </div>
  </div>
</template>
