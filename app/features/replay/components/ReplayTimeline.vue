<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { nearestBar } from '../normalize'
import { fillActionKey } from '../events'
import type { ReplayBar, ReplayEvent } from '../types'
import { formatDate, formatDateTime } from '~/lib/format'
import ReplayTradeMarker from './ReplayTradeMarker.vue'
const props = defineProps<{
  start: string
  end: string
  current: number | null
  evidenceRange?: { from: number; to: number }
  events: ReplayEvent[]
  bars: readonly ReplayBar[]
  index: number
  disabled?: boolean
}>()
const emit = defineEmits<{ seek: [time: number]; pause: [] }>()
const { t, locale } = useI18n()
const host = useTemplateRef<HTMLElement>('host'),
  width = ref(400),
  openGroup = ref<string | null>(null)
const start = computed(() => props.bars[0]?.time ?? Date.parse(props.start) / 1000),
  end = computed(() => props.bars.at(-1)?.time ?? Date.parse(props.end) / 1000)
const position = computed(() =>
  Math.max(
    0,
    Math.min(1, ((props.current ?? end.value) - start.value) / (end.value - start.value || 1)),
  ),
)
const desktop = ref(false)
let desktopQuery: MediaQueryList | undefined
const syncDesktop = () => {
  desktop.value = desktopQuery?.matches ?? false
}
const eventTime = (event: ReplayEvent) => {
  const timestamp = event.fill ? Date.parse(event.fill.occurred_at) / 1000 : event.time
  return Number.isFinite(timestamp) ? timestamp : event.time
}
interface TimelineGroup {
  position: number
  lane: number
  items: ReplayEvent[]
  hitWidth: number
}
const markerSize = 7
const groups = computed(() => {
  const fills = props.events
    .filter((event) => event.kind === 'fill')
    .slice()
    .sort((a, b) => eventTime(a) - eventTime(b) || a.sequence - b.sequence)
  const groups: TimelineGroup[] = []
  const lanes: Array<{ x: number; group: (typeof groups)[number] } | undefined> = Array(3)
  const plotWidth = Math.max(1, width.value - 20)
  for (const event of fills) {
    const position = Math.max(
      0,
      Math.min(1, (eventTime(event) - start.value) / (end.value - start.value || 1)),
    )
    const x = position * plotWidth
    const lane = lanes.findIndex((last) => !last || x - last.x >= markerSize)
    if (lane === -1) {
      // Keep dense groups local to their first timestamp; do not extend the
      // collision boundary and swallow a continuous stream into one group.
      lanes[2]!.group.items.push(event)
      continue
    }
    const group = { position, lane, items: [event], hitWidth: markerSize }
    groups.push(group)
    lanes[lane] = { x, group }
  }
  // Keep comfortable hit areas where there is room, without covering a
  // neighboring marker when the visible dots are close together.
  for (let lane = 0; lane < lanes.length; lane++) {
    const row = groups.filter((group) => group.lane === lane)
    row.forEach((group, index) => {
      const previous = row[index - 1],
        next = row[index + 1]
      group.hitWidth = Math.min(
        desktop.value ? 10 : 28,
        previous ? (group.position - previous.position) * plotWidth : Infinity,
        next ? (next.position - group.position) * plotWidth : Infinity,
      )
    })
  }
  return groups
})
const markerStyle = (group: TimelineGroup) => ({
  left: `${group.position * 100}%`,
  '--marker-lane': group.lane,
  '--marker-hit-width': `${group.hitWidth}px`,
})
const ticks = computed(() => {
  const count = Math.max(2, Math.min(6, Math.floor(width.value / 100)))
  return Array.from({ length: count }, (_, i) => ({
    position: i / (count - 1),
    label: new Intl.DateTimeFormat(locale.value, {
      ...(end.value - start.value < 86400
        ? { hour: '2-digit' as const, minute: '2-digit' as const, hourCycle: 'h23' as const }
        : end.value - start.value > 86400 * 365
          ? { year: '2-digit' as const, month: '2-digit' as const }
          : { month: '2-digit' as const, day: '2-digit' as const }),
      timeZone: 'UTC',
    }).format((start.value + ((end.value - start.value) * i) / (count - 1)) * 1000),
  }))
})
let observer: ResizeObserver | undefined
const kind = (event: ReplayEvent) => (event.fill?.side === 'buy' ? 'buy' : 'sell')
const kinds = (events: ReplayEvent[]) => [...new Set(events.map(kind))]
const label = (event: ReplayEvent) =>
  [
    event.fill?.symbol ?? event.trade?.symbol,
    t(fillActionKey(event.fill?.action ?? '', event.trade?.direction)),
    `#${event.trade?.sequence}`,
  ]
    .filter(Boolean)
    .join(' · ')
const groupLabel = (items: ReplayEvent[]) =>
  items.length === 1
    ? label(items[0]!)
    : t('replay.eventCount', { count: items.length }) +
      ' · ' +
      kinds(items)
        .map((value) => t(`replay.markerKinds.${value}`))
        .join(' · ') +
      ' · ' +
      formatDate(new Date(items[0]!.time * 1000).toISOString(), locale.value)
watch([groups, () => props.disabled], () => {
  if (
    props.disabled ||
    !groups.value.some((group) => group.items.length > 1 && group.items[0]!.id === openGroup.value)
  )
    openGroup.value = null
})
function setGroupOpen(id: string, open: boolean) {
  if (open) openGroup.value = id
  else if (openGroup.value === id) openGroup.value = null
}
function choose(event: ReplayEvent) {
  openGroup.value = null
  // Event dots are shortcuts to a historical candle, not evidence selection.
  emit('seek', event.time)
}
function keyboard(event: KeyboardEvent) {
  const n = nearestBar(props.bars, props.current ?? end.value),
    jump = Math.max(10, Math.floor(props.bars.length / 20))
  const targets: Record<string, number> = {
    ArrowLeft: n - 1,
    ArrowRight: n + 1,
    ArrowDown: n - 1,
    ArrowUp: n + 1,
    PageDown: n - jump,
    PageUp: n + jump,
    Home: 0,
    End: props.bars.length - 1,
  }
  const target = targets[event.key]
  if (target === undefined) return
  event.preventDefault()
  const bar = props.bars[Math.max(0, Math.min(props.bars.length - 1, target))]
  if (bar) emit('seek', bar.time)
}
onMounted(() => {
  desktopQuery = window.matchMedia('(min-width: 761px)')
  syncDesktop()
  desktopQuery.addEventListener('change', syncDesktop)
  observer = new ResizeObserver((entries) => {
    width.value = entries[0]?.contentRect.width ?? 400
  })
  if (host.value) observer.observe(host.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  desktopQuery?.removeEventListener('change', syncDesktop)
})
</script>
<template>
  <div class="replay-timeline">
    <div
      ref="host"
      class="replay-time-track"
    >
      <div class="replay-track-plot">
        <div
          class="replay-track-progress"
          :style="{ width: `${position * 100}%` }"
        />
        <div
          v-if="evidenceRange && end > start"
          class="replay-track-evidence"
          :style="{
            left: `${Math.max(0, (evidenceRange.from - start) / (end - start)) * 100}%`,
            width: `${(Math.max(0, Math.min(end, evidenceRange.to) - Math.max(start, evidenceRange.from)) / (end - start)) * 100}%`,
          }"
        />
        <div
          v-for="(tick, n) in ticks"
          :key="n"
          class="replay-track-tick"
          :class="{ 'is-first': n === 0, 'is-last': n === ticks.length - 1 }"
          :style="{ left: `${tick.position * 100}%` }"
        >
          <span>{{ tick.label }}</span>
        </div>
        <div
          class="replay-track-cursor"
          :style="{ left: `${position * 100}%` }"
        >
          <span />
        </div>
        <template
          v-for="group in groups"
          :key="group.items[0]!.id"
        >
          <ReplayTradeMarker
            v-if="group.items.length === 1"
            class="replay-track-marker"
            :side="kind(group.items[0]!)"
            :direction="group.items[0]!.trade?.direction"
            :data-event-id="group.items[0]!.id"
            :data-marker-lane="group.lane"
            :style="markerStyle(group)"
            :label="label(group.items[0]!)"
            :title="label(group.items[0]!)"
            :disabled="disabled"
            @click="choose(group.items[0]!)"
          />
          <UPopover
            v-else
            :key="desktop ? 'hover' : 'click'"
            :mode="desktop ? 'hover' : 'click'"
            :open="openGroup === group.items[0]!.id"
            :open-delay="0"
            :close-delay="150"
            :modal="false"
            :content="{ side: 'bottom', align: 'center', sideOffset: 4, collisionPadding: 8 }"
            :ui="{ content: 'replay-marker-popover ring-0' }"
            @update:open="setGroupOpen(group.items[0]!.id, $event)"
          >
            <button
              class="replay-track-marker"
              :data-marker-lane="group.lane"
              :style="markerStyle(group)"
              :aria-label="groupLabel(group.items)"
              :disabled="disabled"
            >
              <UIcon
                name="i-lucide-ellipsis"
                class="replay-marker-overflow"
              />
            </button>
            <template #content>
              <div
                class="replay-marker-choices"
                role="group"
                :aria-label="t('replay.events')"
              >
                <ReplayTradeMarker
                  v-for="event in group.items"
                  :key="event.id"
                  class="replay-marker-choice"
                  :side="kind(event)"
                  :direction="event.trade?.direction"
                  :label="label(event)"
                  :title="`${label(event)} · ${formatDateTime(event.fill?.occurred_at ?? event.time * 1000)}`"
                  :disabled="disabled"
                  @click="choose(event)"
                />
              </div>
            </template>
          </UPopover>
        </template>
      </div>
      <input
        type="range"
        :aria-label="t('replay.timeline')"
        :aria-valuetext="formatDate(new Date((current ?? end) * 1000).toISOString(), locale)"
        :min="start"
        :max="end"
        :value="current ?? end"
        :step="1"
        :disabled="disabled || end <= start"
        @pointerdown="emit('pause')"
        @keydown="keyboard"
        @input="emit('seek', Number(($event.target as HTMLInputElement).value))"
      />
    </div>
    <div class="replay-timeline-footer">
      <div class="replay-track-legend">
        <span
          v-for="value in ['buy', 'sell']"
          :key="value"
          ><i
            class="replay-event-dot"
            :class="`is-${value}`"
          />{{ t(`replay.markerKinds.${value}`) }}</span
        >
      </div>
      <span>{{ start ? props.start.slice(0, 10) : '—' }} — {{ props.end.slice(0, 10) }}</span>
    </div>
  </div>
</template>
