import { historicalResult } from '../historical-result'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useNuxtApp } from '#app'
import { useAuthStore } from '~/features/auth'
import { createReplayApi } from '../api'
import { createReplayDataState } from '../data-state'
import { buildReplayEvents, resolveSelection } from '../events'
import { nearestBar, nextBarTime, normalizeState } from '../normalize'
import { advancePlayback } from '../playback-state'
import { closedBars, revealTrades } from '../visibility'
import type {
  ReplayCandle,
  ReplayQuestionReference,
  ReplaySelection,
  ReplayViewSnapshot,
} from '../types'

export function useReplayDetail(
  id: () => string | null,
  revision: () => number,
  autoKey: () => string | null = () => null,
  visible: () => boolean = () => true,
) {
  const api = createReplayApi(useNuxtApp().$http),
    auth = useAuthStore()
  const data = createReplayDataState(api)
  const initializing = ref(true)
  const status = ref<'paused' | 'playing' | 'event-hold' | 'buffering'>('paused')
  const index = ref(-1),
    speed = ref(8)
  const selection = shallowRef<ReplaySelection | null>(null)
  const currentCandle = shallowRef<ReplayCandle | null>(null)
  const currentLoading = ref(false),
    currentError = ref(''),
    locateError = ref(''),
    gapTime = ref<number | null>(null)
  const tab = ref<'insights' | 'trades'>('insights'),
    expanded = ref(false)
  const viewRange = shallowRef<{ from: number; to: number } | null>(null)
  const requestedRange = shallowRef<{ from: number; to: number; revision: number } | null>(null)
  const follow = ref(true),
    scrollTop = ref(0)
  const snapshots = new Map<string, ReplayViewSnapshot>()
  const consumedAutoKeys = new Set<string>()
  const events = computed(() =>
    buildReplayEvents(
      data.axis.value,
      data.trades.value,
      data.insights.value,
      data.candlesComplete.value && data.tradesComplete.value,
      data.drawdownRange.value,
    ),
  )
  const processEvents = computed(() =>
    events.value.filter((e) => e.kind === 'fill' || e.kind === 'insight'),
  )
  const currentBar = computed(() => data.axis.value[index.value] ?? null)
  const atEnd = computed(
    () =>
      !initializing.value &&
      data.candlesComplete.value &&
      index.value === data.axis.value.length - 1,
  )
  const cutoff = computed(() =>
    currentBar.value
      ? (currentBar.value.closeTime ??
        nextBarTime(currentBar.value.time, data.detail.value?.strategy.execution_timeframe ?? '') ??
        currentBar.value.time)
      : -Infinity,
  )
  const visibleTrades = computed(() => revealTrades(data.trades.value, data.indexById, index.value))
  const currentState = computed(() =>
    normalizeState(
      currentCandle.value?.state,
      data.detail.value?.conditions.initial_capital ?? '0',
    ),
  )
  const summaryResult = computed(() => {
    if (atEnd.value) return data.detail.value?.result ?? null
    // Do not retain the previous candle's equity while the next state is loading.
    if (
      initializing.value ||
      !data.tradesComplete.value ||
      currentLoading.value ||
      gapTime.value ||
      !currentBar.value
    )
      return null
    return historicalResult(
      visibleTrades.value,
      currentState.value?.cumulative ?? null,
      currentState.value?.equity ?? null,
      data.detail.value?.conditions.initial_capital ?? '0',
      data.historicalDrawdowns.get(currentBar.value.id) ?? null,
    )
  })
  const playing = computed(() => status.value !== 'paused')
  const baseSpeed = computed(() => {
    const value = data.detail.value?.playback?.default_speed ?? 8
    return Number.isFinite(value) && value > 0 && value <= 64 ? value : 8
  })
  const speeds = computed(() =>
    (data.detail.value?.playback?.available_speeds ?? [1, 2, 4, 8, 16]).filter(
      (n) => Number.isFinite(n) && n > 0 && n <= 64,
    ),
  )
  const canPlay = computed(
    () =>
      data.detail.value?.status === 'completed' &&
      !initializing.value &&
      data.candlesComplete.value &&
      data.axis.value.length > 0 &&
      data.tradesComplete.value &&
      speeds.value.length > 0 &&
      !data.displayLoading.value,
  )
  const visibleInsights = computed(() =>
    data.insights.value.filter((insight) =>
      insight.scope === 'global'
        ? atEnd.value
        : !!insight.candle_id && (data.indexById.get(insight.candle_id) ?? Infinity) <= index.value,
    ),
  )
  const renderedBars = computed(() => {
    if (initializing.value && index.value < 0) return restore ? [] : data.bars.value
    return data.displayTimeframe.value === data.detail.value?.strategy.execution_timeframe
      ? data.axis.value.slice(0, index.value + 1)
      : closedBars(data.bars.value, cutoff.value, data.displayTimeframe.value)
  })
  const renderedEvents = computed(() =>
    processEvents.value.filter((event) => event.index <= index.value),
  )
  const selectedTrade = computed(
    () => visibleTrades.value.find((t) => t.id === selection.value?.tradeId) ?? null,
  )
  const selectedInsight = computed(
    () => visibleInsights.value.find((i) => i.id === selection.value?.insightId) ?? null,
  )
  let frame = 0,
    intent = 0,
    seekGeneration = 0,
    lastFrame = 0,
    accumulator = 0,
    lastAdvance = 0,
    holdUntil = 0
  let currentId: string | null = null,
    pendingAuto: string | null = null
  let restore: ReplayViewSnapshot | undefined,
    polling: ReturnType<typeof setTimeout> | undefined,
    pollFailures = 0
  let rangeRevision = 0,
    alive = true
  function pause() {
    intent++
    seekGeneration++
    cancelAnimationFrame(frame)
    status.value = 'paused'
    currentLoading.value = false
    pendingAuto = null
  }
  function save() {
    if (!currentId || initializing.value) return
    snapshots.delete(currentId)
    snapshots.set(currentId, {
      index: index.value,
      speed: speed.value,
      timeframe: data.displayTimeframe.value,
      range: viewRange.value,
      selection: selection.value,
      tab: tab.value,
      expanded: expanded.value,
      scrollTop: scrollTop.value,
    })
    while (snapshots.size > 10) snapshots.delete(snapshots.keys().next().value!)
  }
  function requestRange(range: { from: number; to: number }) {
    if (!(range.to > range.from)) return
    requestedRange.value = { ...range, revision: ++rangeRevision }
  }
  function previewResult(target: ReplaySelection) {
    const resolved = resolveSelection(
      target,
      data.axis.value,
      data.trades.value,
      data.insights.value,
    )
    if (!resolved?.range || resolved.range.to > (currentBar.value?.time ?? -Infinity)) return
    pause()
    follow.value = false
    locateRange(resolved)
  }
  function locateRange(target: ReplaySelection) {
    const bar = target.candleId ? data.axis.value[data.indexById.get(target.candleId) ?? -1] : null
    const step =
      data.axis.value.length > 1
        ? Math.max(1, data.axis.value[1]!.time - data.axis.value[0]!.time)
        : 3600
    if (target.range) {
      const margin = Math.max(step * 8, (target.range.to - target.range.from) * 0.1)
      requestRange({ from: target.range.from - margin, to: target.range.to + margin })
    } else if (bar) requestRange({ from: bar.time - step * 50, to: bar.time + step * 50 })
  }
  async function readAt(next: number, ticket: number) {
    const bar = data.axis.value[next]
    if (!bar) {
      currentCandle.value = null
      return false
    }
    const ownerId = currentId
    currentLoading.value = true
    currentError.value = ''
    try {
      const raw = await data.readCandle(bar.id)
      if (ticket !== seekGeneration || ownerId !== currentId || !alive) return false
      currentCandle.value = raw
      index.value = next
      if (!raw) currentError.value = 'replay.errors.state'
      return !!raw
    } catch {
      if (ticket === seekGeneration && ownerId === currentId) {
        currentCandle.value = null
        index.value = next
        currentError.value = 'replay.errors.state'
      }
      return false
    } finally {
      if (ticket === seekGeneration) currentLoading.value = false
    }
  }
  async function seek(next: number) {
    pause()
    selection.value = null
    locateError.value = ''
    const ticket = seekGeneration
    gapTime.value = null
    currentError.value = ''
    currentCandle.value = null
    const bounded = Math.max(0, Math.min(data.axis.value.length - 1, next))
    if (!data.axis.value[bounded]) return
    index.value = bounded
    const bar = data.axis.value[bounded]!
    const step =
      (nextBarTime(bar.time, data.detail.value!.strategy.execution_timeframe) ?? bar.time + 3600) -
      bar.time
    const range = { from: bar.time - step * 50, to: bar.time + step * 8 }
    await Promise.all([
      readAt(bounded, ticket),
      data.displayTimeframe.value !== data.detail.value?.strategy.execution_timeframe
        ? data.setTimeframe(data.displayTimeframe.value, range)
        : Promise.resolve(),
    ])
    if (ticket !== seekGeneration) return
    requestRange(range)
    follow.value = true
  }
  async function seekTime(time: number) {
    pause()
    selection.value = null
    const bars = data.axis.value,
      n = nearestBar(bars, time)
    if (!data.candlesComplete.value && time > (bars.at(-1)?.time ?? 0)) {
      locateError.value = 'replay.errors.indexing'
      return
    }
    locateError.value = ''
    if (n < 0) return
    const prior = bars[n]!.time <= time ? n : n - 1
    if (prior >= 0 && prior + 1 < bars.length) {
      const expected = nextBarTime(
        bars[prior]!.time,
        data.detail.value!.strategy.execution_timeframe,
      )
      if (expected && time >= expected && time < bars[prior + 1]!.time) {
        gapTime.value = time
        index.value = prior
        currentCandle.value = null
        return
      }
    }
    await seek(n)
  }
  async function locate(target: ReplaySelection, movePlayhead = true) {
    pause()
    const ticket = seekGeneration
    locateError.value = ''
    follow.value = movePlayhead
    if (movePlayhead) gapTime.value = null
    await data.setTimeframe(data.detail.value?.strategy.execution_timeframe ?? '')
    if (ticket !== seekGeneration) return
    const resolved = resolveSelection(
      target,
      data.axis.value,
      visibleTrades.value,
      visibleInsights.value,
    )
    if (!resolved) {
      if (target.insightId && data.insights.value.some((i) => i.id === target.insightId)) {
        selection.value = { insightId: target.insightId }
        tab.value = 'insights'
        expanded.value = true
      }
      locateError.value = data.candlesComplete.value
        ? 'replay.errors.locate'
        : 'replay.errors.indexing'
      return
    }
    selection.value = resolved
    expanded.value = true
    tab.value = resolved.insightId ? 'insights' : resolved.tradeId ? 'trades' : tab.value
    const insight = visibleInsights.value.find((i) => i.id === resolved.insightId)
    const openTrade = visibleTrades.value.find(
      (trade) => trade.id === resolved.tradeId && !trade.isComplete,
    )
    if (openTrade && !resolved.fillId && !insight && currentBar.value)
      resolved.range = {
        from: resolved.range?.from ?? currentBar.value.time,
        to: currentBar.value.time,
      }
    const n =
      insight?.scope === 'global' || (openTrade && !resolved.fillId && !insight)
        ? undefined
        : resolved.candleId
          ? data.indexById.get(resolved.candleId)
          : resolved.range
            ? nearestBar(data.axis.value, resolved.range.to)
            : undefined
    if (movePlayhead && n !== undefined) {
      index.value = n
      currentCandle.value = null
      await readAt(n, ticket)
    }
    if (ticket !== seekGeneration) return
    if (resolved.range && currentBar.value)
      selection.value = {
        ...resolved,
        range: {
          from: resolved.range.from,
          to: Math.min(resolved.range.to, currentBar.value.time),
        },
      }
    if (ticket !== seekGeneration) return
    locateRange(selection.value ?? resolved)
  }
  async function selectCandle(time: number) {
    pause()
    const selected = renderedBars.value.find((bar) => bar.time === time)
    if (!selected) return
    let n = nearestBar(data.axis.value, time)
    if (data.displayTimeframe.value !== data.detail.value?.strategy.execution_timeframe) {
      const close = selected.closeTime ?? nextBarTime(time, data.displayTimeframe.value)
      if (close === null) return
      n = data.axis.value.findLastIndex(
        (bar) =>
          (bar.closeTime ??
            nextBarTime(bar.time, data.detail.value!.strategy.execution_timeframe) ??
            Infinity) <= close,
      )
    }
    if (n < 0) return
    await seek(n)
    if (index.value === n) selection.value = { candleId: data.axis.value[n]!.id }
  }
  async function tick(now: number, token: number) {
    if (token !== intent || !alive || !visible() || !playing.value) return
    const delta = lastFrame ? Math.min(100, now - lastFrame) : 0
    lastFrame = now
    if (now < holdUntil) {
      frame = requestAnimationFrame((t) => {
        void tick(t, token)
      })
      return
    }
    if (status.value === 'event-hold') status.value = 'playing'
    accumulator += (delta * speed.value) / 1000
    if ((accumulator >= 1 || status.value === 'buffering') && now - lastAdvance >= 100) {
      lastAdvance = now
      const steps = Math.floor(accumulator)
      const result = advancePlayback(
        index.value,
        steps,
        data.axis.value,
        processEvents.value,
        data.detail.value!.strategy.execution_timeframe,
        data.candlesComplete.value,
        window.matchMedia('(min-width: 761px)').matches
          ? Math.min(150, 1000 / speed.value)
          : undefined,
      )
      accumulator = Math.max(0, accumulator - steps)
      if (result.gap) {
        pause()
        index.value = result.index
        gapTime.value = nextBarTime(
          data.axis.value[result.index]!.time,
          data.detail.value!.strategy.execution_timeframe,
        )
        currentCandle.value = null
        return
      }
      if (result.buffering) {
        if (data.errors.candles) {
          pause()
          return
        }
        status.value = 'buffering'
      } else {
        if (result.index !== index.value) {
          status.value = 'buffering'
          const ok = await readAt(result.index, seekGeneration)
          if (token !== intent) return
          if (!ok) {
            pause()
            return
          }
        }
        if (result.ended) {
          pause()
          return
        }
        status.value = result.hold ? 'event-hold' : 'playing'
        holdUntil = result.hold ? now + result.hold : 0
      }
    }
    if (token === intent)
      frame = requestAnimationFrame((t) => {
        void tick(t, token)
      })
  }
  async function play() {
    if (!canPlay.value || !visible() || document.hidden || gapTime.value !== null) return
    pause()
    const ticket = seekGeneration
    await data.setTimeframe(data.detail.value!.strategy.execution_timeframe)
    if (ticket !== seekGeneration) return
    selection.value = null
    locateError.value = ''
    status.value = 'playing'
    lastFrame = 0
    lastAdvance = 0
    holdUntil = 0
    accumulator = 0
    follow.value = true
    const token = intent
    frame = requestAnimationFrame((t) => {
      void tick(t, token)
    })
  }
  async function start() {
    if (!canPlay.value) return
    await seek(0)
    if (index.value === 0 && !currentError.value) await play()
  }
  async function setTimeframe(value: string) {
    pause()
    const ticket = seekGeneration,
      range = viewRange.value
    const ok = await data.setTimeframe(value, range ?? undefined)
    if (ok && ticket === seekGeneration) {
      selection.value = null
      if (range) requestRange(range)
    }
  }
  function question(): ReplayQuestionReference | null {
    if (!data.detail.value) return null
    pause()
    const s = selection.value
    return {
      context: {
        replay_id: data.detail.value.id,
        ...(s?.tradeId ? { trade_id: s.tradeId } : {}),
        ...(s?.fillId ? { fill_id: s.fillId } : {}),
        ...(s?.insightId ? { insight_id: s.insightId } : {}),
        ...(currentBar.value
          ? { timestamp: new Date(currentBar.value.time * 1000).toISOString() }
          : {}),
      },
      label:
        selectedInsight.value?.title ||
        (selectedTrade.value
          ? `#${selectedTrade.value.sequence} · ${data.detail.value.name}`
          : data.detail.value.name),
    }
  }
  function schedulePoll() {
    clearTimeout(polling)
    if (
      !currentId ||
      !visible() ||
      document.hidden ||
      !['queued', 'running'].includes(data.detail.value?.status ?? '')
    )
      return
    polling = setTimeout(
      async () => {
        if (!currentId) return
        await data.load(currentId, false, true)
        pollFailures = data.error.value ? pollFailures + 1 : 0
        schedulePoll()
      },
      Math.min(30000, 5000 * 2 ** pollFailures),
    )
  }
  const stopWatch = watch(
    [id, () => auth.user?.id, () => auth.isAuthenticated],
    ([replayId, owner, authenticated], previous) => {
      save()
      pause()
      clearTimeout(polling)
      if (previous && previous[1] !== owner) {
        snapshots.clear()
        consumedAutoKeys.clear()
      }
      currentId = authenticated && owner ? replayId : null
      data.reset()
      currentCandle.value = null
      currentLoading.value = false
      currentError.value = ''
      locateError.value = ''
      gapTime.value = null
      initializing.value = true
      index.value = -1
      selection.value = null
      expanded.value = false
      tab.value = 'insights'
      scrollTop.value = 0
      viewRange.value = null
      requestedRange.value = null
      restore = currentId ? snapshots.get(currentId) : undefined
      if (!currentId) return
      const key = autoKey()
      pendingAuto = key && !consumedAutoKeys.has(key) ? key : null
      if (pendingAuto) consumedAutoKeys.add(pendingAuto)
      const ownerId = currentId,
        preferredSpeed = restore?.speed
      void data.load(currentId, !!pendingAuto).then(() => {
        if (ownerId !== currentId || !alive) return
        speed.value = preferredSpeed ?? baseSpeed.value
        const supported = [...speeds.value, ...[0.5, 1, 2, 5, 10].map((n) => n * baseSpeed.value)]
        if (!supported.includes(speed.value)) speed.value = baseSpeed.value
        schedulePoll()
      })
    },
    { immediate: true, flush: 'sync' },
  )
  watch(revision, () => {
    if (currentId) void data.load(currentId, false, true).then(schedulePoll)
  })
  watch(visible, (value) => {
    if (!value) pause()
    schedulePoll()
  })
  watch(
    [canPlay, () => data.phases.insights, () => data.errors.candles, () => data.errors.trades],
    () => {
      if (!pendingAuto) return
      if (
        data.errors.candles ||
        data.errors.trades ||
        data.errors.insights ||
        data.detail.value?.result_type === 'no_trades'
      ) {
        pendingAuto = null
        return
      }
      if (canPlay.value && data.phases.insights === 'ready') {
        pendingAuto = null
        if (
          !document.hidden &&
          !matchMedia('(prefers-reduced-motion: reduce)').matches &&
          visible()
        )
          void start()
      }
    },
  )
  watch(
    () => data.candlesComplete.value,
    async (complete) => {
      if (!complete || !initializing.value) return
      const snapshot = restore
      restore = undefined
      const owner = currentId,
        ticket = seekGeneration
      index.value = snapshot
        ? Math.min(data.axis.value.length - 1, Math.max(0, snapshot.index))
        : data.axis.value.length - 1
      await readAt(index.value, ticket)
      if (currentId !== owner || !alive) return
      if (ticket !== seekGeneration) {
        initializing.value = false
        return
      }
      if (snapshot) {
        selection.value = snapshot.selection
        tab.value = snapshot.tab
        expanded.value = snapshot.expanded
        scrollTop.value = snapshot.scrollTop
        if (data.availableTimeframes.value.includes(snapshot.timeframe))
          await data.setTimeframe(snapshot.timeframe, snapshot.range ?? undefined)
        if (currentId !== owner || !alive) return
        if (ticket !== seekGeneration) {
          initializing.value = false
          return
        }
        if (snapshot.range) requestRange(snapshot.range)
      }
      initializing.value = false
    },
  )
  const visibility = () => {
    if (document.hidden) pause()
    schedulePoll()
  }
  onMounted(() => document.addEventListener('visibilitychange', visibility))
  onBeforeUnmount(() => {
    alive = false
    stopWatch()
    pause()
    clearTimeout(polling)
    data.reset()
    snapshots.clear()
    document.removeEventListener('visibilitychange', visibility)
  })
  return {
    ...data,
    api,
    initializing,
    atEnd,
    cutoff,
    visibleTrades,
    status,
    index,
    speed,
    speeds,
    baseSpeed,
    selection,
    currentCandle,
    currentBar,
    currentState,
    summaryResult,
    currentLoading,
    currentError,
    locateError,
    gapTime,
    tab,
    expanded,
    viewRange,
    requestedRange,
    follow,
    scrollTop,
    events,
    processEvents,
    playing,
    canPlay,
    visibleInsights,
    renderedBars,
    renderedEvents,
    selectedTrade,
    selectedInsight,
    pause,
    previewResult,
    play,
    start,
    locate,
    selectCandle,
    seek,
    seekTime,
    setTimeframe,
    question,
    requestRange,
    save,
    refresh: () => (currentId ? data.load(currentId, false, true) : Promise.resolve()),
  }
}
export type ReplayDetailState = ReturnType<typeof useReplayDetail>
