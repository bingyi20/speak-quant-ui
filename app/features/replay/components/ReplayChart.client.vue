<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import type { ChartAdapter, ChartMarker, ChartRange, ChartTheme } from '~/lib/chart/adapter'
import { formatDecimal } from '~/lib/format'
import { nearestBar, nextBarTime } from '../normalize'
import type { ReplayBar, ReplayEvent, ReplaySelection, ReplayTrade } from '../types'
const props = defineProps<{
  bars: readonly ReplayBar[]
  events: readonly ReplayEvent[]
  selection: ReplaySelection | null
  trade: ReplayTrade | null
  timeframe: string
  mode: 'overview' | 'playback'
  follow: boolean
  range: (ChartRange & { revision: number }) | null
  volume: boolean
  symbol: string
}>()
const emit = defineEmits<{
  select: [time: number, markerId?: string]
  range: [value: ChartRange]
  interact: []
  hover: [time: number | null]
}>()
const { t, locale } = useI18n()
const host = useTemplateRef<HTMLElement>('host'),
  hover = ref<ReplayBar | null>(null),
  failure = ref(false)
const cluster = ref<ReplayEvent[]>([])
const markerGroups = new Map<string, ReplayEvent[]>()
const quoted = computed(() => hover.value ?? props.bars.at(-1))
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
    up: value('--color-chart-up'),
    down: value('--color-chart-down'),
    accent: value('--color-brand'),
    volumeUp: value('--color-chart-volume-up'),
    volumeDown: value('--color-chart-volume-down'),
  }
}
function markers() {
  markerGroups.clear()
  const bars = props.bars,
    grouped = new Map<number, ReplayEvent[]>()
  for (const event of props.events) {
    if (event.kind !== 'fill' && event.kind !== 'insight') continue
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
    const list = grouped.get(bar.time) ?? []
    list.push(event)
    grouped.set(bar.time, list)
  }
  const values: ChartMarker[] = [...grouped]
    .sort((a, b) => a[0] - b[0])
    .map(([time, items]) => {
      const e =
        items.find(
          (e) =>
            (props.selection?.fillId && e.selection.fillId === props.selection.fillId) ||
            (props.selection?.insightId && e.selection.insightId === props.selection.insightId),
        ) ?? items[0]!
      markerGroups.set(e.id, items)
      return {
        id: e.id,
        time,
        direction: e.fill ? (e.fill.side === 'buy' ? 'up' : 'down') : 'neutral',
        label:
          items.length > 1
            ? String(items.length)
            : e.fill
              ? t(
                  `replay.actions.${['open', 'increase', 'reduce', 'close'].includes(e.fill.action) ? e.fill.action : 'trade'}`,
                )
              : '',
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
                { price: Number(trade.entry_price), label: t('replay.entry') },
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
    props.mode === 'playback' &&
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
    if (to > from) adapter.setVisibleRange({ from, to })
    initial = false
  } else if (saved && props.mode === 'overview') adapter.setVisibleRange(saved)
  if (props.mode === 'playback' && props.follow && rows.length) adapter.follow()
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
    adapter.onSelect((time, marker) => {
      const items = marker ? markerGroups.get(marker) : null
      if (items && items.length > 1) {
        cluster.value = items
        emit('interact')
      } else emit('select', time, marker)
    })
    adapter.onCrosshair((time) => {
      const bar = time === null ? undefined : props.bars[nearestBar(props.bars, time)]
      hover.value = bar?.time === time ? bar : null
      emit('hover', time)
    })
    adapter.setVolume(props.volume)
    draw()
    if (props.range) adapter.setVisibleRange(props.range)
  } catch {
    failure.value = true
  }
}
function chooseEvent(event: ReplayEvent) {
  emit('select', event.time, event.id)
  cluster.value = []
}
function reset() {
  if (!adapter) return
  if (props.mode === 'playback') adapter.follow()
  else {
    const rows = props.bars
    if (rows.length > 1)
      adapter.setVisibleRange({
        from: rows[Math.max(0, rows.length - 200)]!.time,
        to: rows.at(-1)!.time,
      })
  }
}
defineExpose({ reset })
watch(
  () => props.bars,
  () => {
    cluster.value = []
    draw()
  },
)
watch([() => props.events, () => props.selection, () => props.trade, locale], selected)
watch(
  () => props.range,
  (range) => {
    if (range) adapter?.setVisibleRange(range)
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
      class="replay-ohlc"
      aria-live="off"
    >
      <span>{{ symbol }}</span
      ><span
        v-for="key in ['open', 'high', 'low', 'close'] as const"
        :key="key"
        >{{ t(`replay.ohlc.${key}`) }} {{ price(quoted?.[key]) }}</span
      >
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
          event.insight?.title ||
          `${t(`replay.actions.${['open', 'increase', 'reduce', 'close'].includes(event.fill?.action ?? '') ? event.fill!.action : 'trade'}`)} · #${event.trade?.sequence}`
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
      ref="host"
      class="replay-chart"
      role="img"
      :aria-label="t('replay.chartLabel', { symbol, timeframe })"
      @pointerdown="emit('interact')"
      @wheel.passive="emit('interact')"
    />
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
