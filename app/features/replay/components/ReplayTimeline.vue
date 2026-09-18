<script setup lang="ts">
import ReplayInsightContent from './ReplayInsightContent.vue'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { nearestBar } from '../normalize'
import { fillActionKey, groupEvents } from '../events'
import type { ReplayBar, ReplayEvent } from '../types'
import { formatDate } from '~/lib/format'
const props = defineProps<{
  start: string
  end: string
  current: number | null
  evidenceRange?: { from: number; to: number }
  selectedInsightId?: string
  events: ReplayEvent[]
  bars: readonly ReplayBar[]
  index: number
  disabled?: boolean
}>()
const emit = defineEmits<{ seek: [time: number]; select: [event: ReplayEvent]; pause: [] }>()
const { t, locale } = useI18n()
const host = useTemplateRef<HTMLElement>('host'),
  width = ref(400),
  selected = ref<ReplayEvent[]>([])
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
const groups = computed(() =>
  desktop.value
    ? props.events
        .filter((event) => event.kind === 'fill' || event.kind === 'insight')
        .map((event) => ({
          position: Math.max(
            0,
            Math.min(1, (eventTime(event) - start.value) / (end.value - start.value || 1)),
          ),
          items: [event],
        }))
    : groupEvents(props.events, start.value, end.value, width.value - 20, 32),
)
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
const kind = (event: ReplayEvent) =>
  event.fill ? (event.fill.side === 'buy' ? 'buy' : 'sell') : 'insight'
const kinds = (events: ReplayEvent[]) => [...new Set(events.map(kind))]
const label = (event: ReplayEvent) =>
  event.insight?.title ||
  `${t(fillActionKey(event.fill?.action ?? '', event.trade?.direction))} · #${event.trade?.sequence}`
const groupLabel = (items: ReplayEvent[]) =>
  items.length === 1
    ? label(items[0]!)
    : kinds(items)
        .map((value) => t(`replay.markerKinds.${value}`))
        .join(' · ') +
      ' · ' +
      formatDate(new Date(items[0]!.time * 1000).toISOString(), locale.value)
watch([() => props.index, () => props.events], () => {
  selected.value = []
})
function choose(event: ReplayEvent) {
  selected.value = []
  emit('select', event)
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
        <UPopover
          v-for="(group, n) in groups"
          :key="n"
          mode="hover"
          :open="desktop && group.items[0]?.kind === 'insight' ? undefined : false"
          :open-delay="120"
          :close-delay="220"
          :content="{ side: 'top', sideOffset: 6, collisionPadding: 12 }"
          :ui="{ content: 'replay-insight-hover-surface' }"
        >
          <button
            class="replay-track-marker"
            :class="desktop ? `replay-marker-${kind(group.items[0]!)}` : undefined"
            :data-event-id="desktop ? group.items[0]!.id : undefined"
            :style="{ left: `${group.position * 100}%` }"
            :aria-label="groupLabel(group.items)"
            :aria-pressed="
              desktop && group.items[0]?.kind === 'insight'
                ? group.items[0].selection.insightId === selectedInsightId
                : undefined
            "
            :title="group.items[0]?.kind === 'insight' ? undefined : groupLabel(group.items)"
            :disabled="disabled"
            @click="
              group.items.length === 1
                ? choose(group.items[0]!)
                : ((selected = group.items), emit('pause'))
            "
          >
            <span
              v-for="value in kinds(group.items)"
              :key="value"
              class="replay-event-dot"
              :class="`is-${value}`"
            />
          </button>
          <template #content
            ><ReplayInsightContent
              :insights="group.items.flatMap((event) => (event.insight ? [event.insight] : []))"
              :time="group.items[0]?.time"
          /></template>
        </UPopover>
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
          v-for="value in ['buy', 'sell', 'insight']"
          :key="value"
          ><i
            class="replay-event-dot"
            :class="`is-${value}`"
          />{{ t(`replay.markerKinds.${value}`) }}</span
        >
      </div>
      <span>{{ start ? props.start.slice(0, 10) : '—' }} — {{ props.end.slice(0, 10) }}</span>
    </div>
    <div
      v-if="selected.length"
      class="replay-event-picker"
      role="group"
      :aria-label="t('replay.events')"
    >
      <button
        v-for="event in selected"
        :key="event.id"
        class="text-button"
        @click="choose(event)"
      >
        {{ label(event) }} · {{ formatDate(new Date(event.time * 1000).toISOString(), locale) }}
      </button>
      <button
        class="detail-icon-button"
        :aria-label="t('common.close')"
        @click="selected = []"
      >
        <UIcon name="i-lucide-x" />
      </button>
    </div>
  </div>
</template>
