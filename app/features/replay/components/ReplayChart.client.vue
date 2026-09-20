<script setup lang="ts">
import ReplayInsightContent from './ReplayInsightContent.vue'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
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
import { fillActionKey } from '../events'
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
  volume: boolean
  symbol: string
}>()
const emit = defineEmits<{
  select: [time: number, markerId?: string]
  range: [value: ChartRange]
  interact: []
  follow: []
  hover: [time: number | null]
}>()
const { t, locale } = useI18n()
const host = useTemplateRef<HTMLElement>('host'),
  hover = ref<ReplayBar | null>(null),
  failure = ref(false),
  canReturn = ref(false)
const cluster = ref<ReplayEvent[]>([])
const hoveredTag = ref<ChartMarkerHit | null>(null)
const hoveredFills = ref<ReplayEvent[]>([])
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
const fillMaxHeight = computed(() => {
  // Bottom-row insight markers must remain clickable even with long content.
  if (hoveredTag.value && hoveredFills.value[0]?.kind === 'insight')
    return Math.max(0, Math.floor(hoveredTag.value.top) - 12)
  return Math.max(86, (host.value?.clientHeight ?? 300) - 44)
})
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
  hoveredFills.value = []
}
const desktop = () => window.matchMedia('(min-width: 761px)').matches
const markerGroups = new Map<string, ReplayEvent[]>()
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
    insight: value('--color-chart-insight'),
    tagText: value('--color-chart-tag-text'),
    down: value(desktop() ? '--color-chart-candle-down' : '--color-chart-down'),
    accent: value('--color-brand'),
    volumeUp: value(desktop() ? '--color-chart-candle-volume-up' : '--color-chart-volume-up'),
    volumeDown: value(desktop() ? '--color-chart-candle-volume-down' : '--color-chart-volume-down'),
  }
}
function markers() {
  markerGroups.clear()
  const bars = props.bars,
    grouped = new Map<string, { bar: ReplayBar; items: ReplayEvent[] }>()
  for (const event of props.events) {
    if (
      event.kind !== 'fill' &&
      !(desktop() && event.kind === 'insight' && event.insight?.scope === 'runtime')
    )
      continue
    const time = event.fill ? Date.parse(event.fill.occurred_at) / 1000 : event.time
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
    const key = `${bar.time}:${event.kind}:${event.fill?.side}`
    const group = grouped.get(key) ?? { bar, items: [] }
    group.items.push(event)
    grouped.set(key, group)
  }
  const values: ChartMarker[] = [...grouped.values()]
    .sort((a, b) => a.bar.time - b.bar.time)
    .map(({ bar, items }) => {
      const e =
        items.find(
          (e) =>
            (props.selection?.fillId && e.selection.fillId === props.selection.fillId) ||
            (props.selection?.insightId && e.selection.insightId === props.selection.insightId),
        ) ?? items[0]!
      markerGroups.set(e.id, items)
      return {
        id: e.id,
        time: bar.time,
        side: e.kind === 'insight' ? 'insight' : e.fill?.side === 'buy' ? 'buy' : 'sell',
        active: e.kind === 'insight' && e.selection.insightId === props.selection?.insightId,
        price: Number(e.fill?.price),
        edgePrice: bar.high,
        label:
          e.kind === 'insight'
            ? items.length > 1
              ? String(items.length)
              : ''
            : `${e.fill?.side === 'buy' ? 'B' : 'S'}${items.length > 1 ? `×${items.length}` : ''}`,
      }
    })
  adapter?.setMarkers(values)
}
function selected() {
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
function draw() {
  if (!adapter) return
  const rows = props.bars
  const saved = adapter.getViewState()
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
  } else if (props.follow && rows.length) adapter.follow()
  else if (saved && !append) adapter.setVisibleRange(saved)
  selected()
}
async function mount() {
  failure.value = false
  try {
    const { createLightweightChart } = await import('~/lib/chart/lightweight')
    if (!alive || !host.value) return
    adapter?.destroy()
    adapter = createLightweightChart(host.value, theme())
    initial = true
    previous = []
    adapter.onRangeChange((range) => emit('range', range))
    adapter.onReturnVisibilityChange((visible) => {
      canReturn.value = visible
    })
    adapter.onSelect((time, marker) => {
      const items = marker ? markerGroups.get(marker) : null
      if (desktop()) {
        if (items?.[0]?.kind === 'insight') emit('select', time, marker)
        const bar = props.bars[nearestBar(props.bars, time)]
        hover.value = bar?.time === time ? bar : null
        return
      }
      if (items && items.length > 1) {
        cluster.value = items
        emit('interact')
      } else emit('select', time, marker)
    })
    adapter.onCrosshair((time, marker) => {
      if (desktop()) {
        if (marker) {
          keepFill()
          hoveredTag.value = marker
          hoveredFills.value = markerGroups.get(marker.id) ?? []
        } else scheduleFillClose()
      }
      const bar = time === null ? undefined : props.bars[nearestBar(props.bars, time)]
      hover.value = bar?.time === time ? bar : null
      emit('hover', time)
    })
    adapter.setVolume(props.volume)
    draw()
    if (props.range) applyRange(props.range)
  } catch {
    failure.value = true
  }
}
function chooseEvent(event: ReplayEvent) {
  emit('select', event.time, event.id)
  cluster.value = []
}
function applyRange(range: ChartViewportRequest) {
  if ('revealTime' in range) adapter?.revealTime(range.revealTime)
  else if ('seekTime' in range) adapter?.seek(range.seekTime)
  else if (desktop() && range.focusTime !== undefined) adapter?.resetView(range.focusTime)
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
    cluster.value = []
    const cutoff = props.bars.at(-1)?.time ?? -Infinity
    if (
      !hoveredFills.value.length ||
      hoveredFills.value.some(
        (event) => event.time > cutoff || !props.events.some((visible) => visible.id === event.id),
      )
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
  (value) => adapter?.setVolume(value),
)
onMounted(() => {
  void mount()
  resize = new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const r = host.value?.getBoundingClientRect()
      if (r) adapter?.resize(r.width, r.height)
    })
  })
  if (host.value) resize.observe(host.value)
  themeObserver = new MutationObserver(() => {
    if (host.value) adapter?.applyTheme(theme())
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class'],
  })
})
onBeforeUnmount(() => {
  clearFill()
  fillResize?.disconnect()
  alive = false
  cancelAnimationFrame(frame)
  resize?.disconnect()
  themeObserver?.disconnect()
  adapter?.destroy()
})
</script>
<template>
  <div class="replay-chart-block">
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
      v-if="cluster.length"
      class="replay-chart-cluster"
      role="group"
      :aria-label="t('replay.events')"
    >
      <button
        v-for="event in cluster"
        :key="event.id"
        class="text-button"
        @click="chooseEvent(event)"
      >
        {{
          `${t(fillActionKey(event.fill?.action ?? '', event.trade?.direction))} · #${event.trade?.sequence}`
        }}
      </button>
      <button
        class="detail-icon-button"
        :aria-label="t('common.close')"
        @click="cluster = []"
      >
        <UIcon name="i-lucide-x" />
      </button>
    </div>
    <div
      v-if="hoveredTag && hoveredFills.length"
      ref="fillElement"
      class="replay-chart-local-fill"
      :class="{ 'is-insight': hoveredFills[0]?.kind === 'insight' }"
      :data-placement="fillPosition?.placement"
      role="tooltip"
      :style="fillStyle"
      @pointerenter="enterFill"
      @pointerleave="leaveFill"
    >
      <ReplayInsightContent
        v-if="hoveredFills[0]?.kind === 'insight'"
        :insights="hoveredFills.flatMap((event) => (event.insight ? [event.insight] : []))"
        :time="hoveredFills[0]?.time"
      />
      <template v-else>
        <strong
          >{{ formatDateTime(hoveredFills[0]?.fill?.occurred_at ?? '') }}
          {{ t('replay.orderDetails') }}</strong
        >
        <div
          v-for="event in hoveredFills"
          :key="event.id"
          class="replay-fill-tooltip-row"
        >
          <span :class="event.fill?.side === 'buy' ? 'is-buy' : 'is-sell'">{{
            t(event.fill?.side === 'buy' ? 'replay.markerKinds.buy' : 'replay.markerKinds.sell')
          }}</span>
          <span
            >{{ formatQuantity(event.fill?.quantity, locale) }}@{{
              price(Number(event.fill?.price))
            }}</span
          >
        </div>
      </template>
    </div>
    <div
      ref="host"
      class="replay-chart"
      role="img"
      :data-visible-start="bars[0]?.time"
      :data-visible-end="bars.at(-1)?.time"
      :aria-label="t('replay.chartLabel', { symbol, timeframe })"
      @pointerdown="interact"
      @wheel.passive="interact"
      @pointerleave="scheduleFillClose"
    />
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
