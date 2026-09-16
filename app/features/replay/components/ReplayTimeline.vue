<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { nearestBar } from '../normalize'
import { groupEvents } from '../events'
import type { ReplayBar, ReplayEvent } from '../types'
import { formatDate } from '~/lib/format'
const props = defineProps<{
  start: string
  end: string
  current: number | null
  evidenceRange?: { from: number; to: number }
  events: ReplayEvent[]
  bars: readonly ReplayBar[]
  playback: boolean
  index: number
  disabled?: boolean
}>()
const emit = defineEmits<{ seek: [time: number]; select: [event: ReplayEvent]; pause: [] }>()
const { t, locale } = useI18n()
const host = useTemplateRef<HTMLElement>('host'),
  width = ref(400),
  selected = ref<ReplayEvent[]>([])
const start = computed(() => Date.parse(props.start) / 1000),
  end = computed(() => Date.parse(props.end) / 1000)
const groups = computed(() => groupEvents(props.events, start.value, end.value, width.value))
let observer: ResizeObserver | undefined
const eventLabel = (e: ReplayEvent) =>
  props.playback && e.index > props.index
    ? t('replay.event')
    : e.insight?.title ||
      (e.kind === 'fill'
        ? `${t(`replay.actions.${['open', 'increase', 'reduce', 'close'].includes(e.fill?.action ?? '') ? e.fill!.action : 'trade'}`)} · #${e.trade?.sequence}`
        : t(`replay.${e.kind}`))
function choose(event: ReplayEvent) {
  selected.value = []
  emit('select', event)
}
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    width.value = entries[0]?.contentRect.width ?? 400
  })
  if (host.value) observer.observe(host.value)
})
function keyboard(event: KeyboardEvent) {
  const n = nearestBar(props.bars, props.current ?? start.value)
  const jump = Math.max(10, Math.floor(props.bars.length / 20))
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
  emit('pause')
  const bar = props.bars[Math.max(0, Math.min(props.bars.length - 1, target))]
  if (bar) emit('seek', bar.time)
}
onBeforeUnmount(() => observer?.disconnect())
</script>
<template>
  <div
    ref="host"
    class="replay-timeline"
    :class="{ 'is-playback': playback }"
  >
    <label
      class="sr-only"
      for="replay-time-range"
      >{{ t('replay.timeline') }}</label
    >
    <div
      v-if="evidenceRange && end > start"
      class="replay-timeline-evidence"
      :style="{
        left: `${Math.max(0, (evidenceRange.from - start) / (end - start)) * 100}%`,
        width: `${Math.min(1, (evidenceRange.to - evidenceRange.from) / (end - start)) * 100}%`,
      }"
      aria-hidden="true"
    />
    <input
      id="replay-time-range"
      type="range"
      :min="start"
      :max="end"
      :value="current ?? start"
      :step="1"
      :disabled="disabled || end <= start"
      :aria-valuetext="formatDate(new Date((current ?? start) * 1000).toISOString(), locale)"
      @pointerdown="emit('pause')"
      @keydown="keyboard"
      @input="emit('seek', Number(($event.target as HTMLInputElement).value))"
    />
    <div class="replay-event-track">
      <button
        v-for="(group, n) in groups"
        :key="n"
        type="button"
        :style="{ left: `${group.position * 100}%` }"
        :class="{ 'is-selected': group.items.some((e) => e.index === index) }"
        :aria-label="
          group.items.length > 1
            ? t('replay.eventCount', { count: group.items.length })
            : eventLabel(group.items[0]!)
        "
        @click="
          group.items.length === 1
            ? choose(group.items[0]!)
            : ((selected = group.items), emit('pause'))
        "
      >
        <span>{{ group.items.length > 1 ? group.items.length : '·' }}</span>
      </button>
    </div>
    <div class="replay-timeline-dates">
      <time :datetime="props.start">{{ props.start.slice(0, 10) }}</time
      ><time :datetime="props.end">{{ props.end.slice(0, 10) }}</time>
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
        {{ eventLabel(event) }}</button
      ><button
        class="detail-icon-button"
        :aria-label="t('common.close')"
        @click="selected = []"
      >
        <UIcon name="i-lucide-x" />
      </button>
    </div>
  </div>
</template>
