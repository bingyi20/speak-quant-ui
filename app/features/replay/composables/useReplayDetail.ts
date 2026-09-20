import type { ChartViewportRequest } from '~/lib/chart/adapter'
import { defaultViewportRange, evidenceViewportRange } from '~/lib/chart/viewport'
import { historicalResult } from '../historical-result'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useNuxtApp } from '#app'
import { useAuthStore } from '~/features/auth'
import { createReplayApi } from '../api'
import { createReplayDataState } from '../data-state'
import { buildDrawdownEvent, buildReplayEvents, resolveSelection } from '../events'
import { evidenceIds, nearestBar, nextBarTime, normalizeState } from '../normalize'
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
  const requestedRange = shallowRef<(ChartViewportRequest & { revision: number }) | null>(null)
  const follow = ref(true),
    scrollTop = ref(0)
  const snapshots = new Map<string, ReplayViewSnapshot>()
  const consumedAutoKeys = new Set<string>()
  const eventCatalog = computed(() =>
    buildReplayEvents(
      data.axis.value,
      data.trades.value,
      data.insights.value,
      data.candlesComplete.value && data.tradesComplete.value,
    ),
  )
  // Moving the equity trough must not rebuild the full candle/fill index.
  const events = computed(() => {
    const drawdown = buildDrawdownEvent(currentDrawdownRange.value, data.indexById)
    return drawdown ? [...eventCatalog.value, drawdown] : eventCatalog.value
  })
  const processEvents = computed(() =>
    eventCatalog.value.filter((e) => e.kind === 'fill' || e.kind === 'insight'),
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
  const currentHistory = computed(() =>
    initializing.value || gapTime.value !== null || !currentBar.value
      ? null
      : (data.equityHistory.get(currentBar.value.id) ?? null),
  )
  const currentDrawdownRange = computed(() =>
    atEnd.value ? data.drawdownRange.value : (currentHistory.value?.range ?? null),
  )
  const currentState = computed(() => {
    if (
      !currentHistory.value ||
      currentLoading.value ||
      currentCandle.value?.id !== currentBar.value?.id
    )
      return null
    const state = normalizeState(
      currentCandle.value?.state,
      data.detail.value?.conditions.initial_capital ?? '0',
    )
    return state ? { ...state, drawdown: currentHistory.value.currentDrawdown } : null
  })
  const summaryResult = computed(() => {
    if (atEnd.value) return data.detail.value?.result ?? null
    // Do not retain the previous candle's equity while the next state is loading.
    if (
      initializing.value ||
      !data.tradesComplete.value ||
      currentLoading.value ||
      gapTime.value ||
      !currentBar.value ||
      !currentHistory.value
    )
      return null
    return historicalResult(
      visibleTrades.value,
      currentState.value?.equity ?? null,
      data.detail.value?.conditions.initial_capital ?? '0',
      currentHistory.value.maximumDrawdown,
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
  // Explicit navigation links may use related trades without selecting them.
  const relatedInsightTrade = computed(() => {
    const ids = evidenceIds(selectedInsight.value?.evidence ?? null)
    return (
      visibleTrades.value.find(
        (trade) =>
          ids.trades.includes(trade.id) || trade.fills.some((fill) => ids.fills.includes(fill.id)),
      ) ?? null
    )
  })
  let frame = 0,
    intent = 0,
    seekGeneration = 0,
    evidenceGeneration = 0,
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
    evidenceGeneration++
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
  function requestRange(range: ChartViewportRequest) {
    if (
      'revealTime' in range
        ? !Number.isFinite(range.revealTime)
        : 'seekTime' in range
          ? !Number.isFinite(range.seekTime)
          : !(range.to > range.from)
    )
      return
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
    // Result shortcuts inspect the same evidence as trade cards. Keep one
    // selection/reveal path so neither entry resets the scale or replay clock.
    return locate(resolved, false)
  }
  function focusEvidenceViewport(target: ReplaySelection, mode: 'fit' | 'reveal' = 'fit') {
    const bar = target.candleId ? data.axis.value[data.indexById.get(target.candleId) ?? -1] : null
    if (mode === 'reveal') {
      const time = target.range?.to ?? bar?.time
      if (time !== undefined) requestRange({ revealTime: time })
      return
    }
    const step =
      data.axis.value.length > 1
        ? Math.max(1, data.axis.value[1]!.time - data.axis.value[0]!.time)
        : 3600
    const isDesktop = window.matchMedia('(min-width: 761px)').matches
    const isInterval =
      target.range &&
      nearestBar(data.axis.value, target.range.from) !==
        nearestBar(data.axis.value, target.range.to)
    const pointTime = bar?.time ?? target.range?.from
    if (isDesktop && !isInterval && pointTime !== undefined) {
      requestRange({ ...defaultViewportRange(pointTime, step), focusTime: pointTime })
    } else if (target.range) {
      requestRange(evidenceViewportRange(target.range, step))
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
  function currentViewportRange() {
    const bar = data.axis.value[index.value]
    if (!bar) return null
    const step =
      (nextBarTime(bar.time, data.detail.value!.strategy.execution_timeframe) ?? bar.time + 3600) -
      bar.time
    return defaultViewportRange(bar.time, step, window.matchMedia('(min-width: 761px)').matches)
  }
  function focusCurrentViewport() {
    const time = renderedBars.value.at(-1)?.time
    if (time !== undefined) requestRange({ seekTime: time })
  }
  async function seek(next: number) {
    pause()
    selection.value = null
    follow.value = true
    locateError.value = ''
    const ticket = seekGeneration
    gapTime.value = null
    currentError.value = ''
    currentCandle.value = null
    const bounded = Math.max(0, Math.min(data.axis.value.length - 1, next))
    if (!data.axis.value[bounded]) return
    index.value = bounded
    // Navigation is immediate; a delayed account-state response must not move
    // the viewport again after the user has already panned, zoomed or reset it.
    focusCurrentViewport()
    const range = currentViewportRange()!
    await Promise.all([
      readAt(bounded, ticket),
      data.displayTimeframe.value !== data.detail.value?.strategy.execution_timeframe
        ? data.setTimeframe(data.displayTimeframe.value, range)
        : Promise.resolve(),
    ])
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
        follow.value = true
        index.value = prior
        currentCandle.value = null
        return
      }
    }
    await seek(n)
  }
  function resolveVisibleSelection(target: ReplaySelection) {
    return resolveSelection(target, data.axis.value, visibleTrades.value, visibleInsights.value)
  }
  async function locate(target: ReplaySelection, movePlayhead = true) {
    // Evidence inspection changes the viewport, not the playback clock.
    if (movePlayhead) pause()
    const evidenceTicket = ++evidenceGeneration
    const ticket = seekGeneration
    locateError.value = ''
    follow.value = movePlayhead
    if (movePlayhead) gapTime.value = null
    await data.setTimeframe(data.detail.value?.strategy.execution_timeframe ?? '')
    if (ticket !== seekGeneration || evidenceTicket !== evidenceGeneration) return
    const resolved = resolveVisibleSelection(target)
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
    if (ticket !== seekGeneration || evidenceTicket !== evidenceGeneration) return
    if (resolved.range && currentBar.value)
      selection.value = {
        ...resolved,
        range: {
          from: resolved.range.from,
          to: Math.min(resolved.range.to, currentBar.value.time),
        },
      }
    if (ticket !== seekGeneration || evidenceTicket !== evidenceGeneration) return
    focusEvidenceViewport(selection.value ?? resolved, movePlayhead ? 'fit' : 'reveal')
  }
  function toggleTrade(tradeId: string) {
    if (selection.value?.tradeId === tradeId) {
      // Deselect locally; do not seek, change timeframe or resume chart following.
      evidenceGeneration++
      selection.value = null
      locateError.value = ''
      return
    }
    return locate({ tradeId }, false)
  }
  function inspectInsight(target: ReplaySelection) {
    evidenceGeneration++
    // Like pan/zoom, inspection detaches the viewport but never interrupts playback.
    follow.value = false
    if (target.insightId && selection.value?.insightId === target.insightId) {
      selection.value = null
      return
    }
    const resolved = resolveVisibleSelection(target)
    if (!resolved) return
    if (resolved.range && currentBar.value)
      resolved.range = {
        from: resolved.range.from,
        to: Math.min(resolved.range.to, currentBar.value.time),
      }
    locateError.value = ''
    selection.value = resolved
  }
  watch(currentBar, (bar) => {
    const target = selection.value
    if (!bar || !target?.tradeId || target.fillId || target.insightId) return
    // An inspected position can still be open while playback advances. Extend
    // its shade until the exit is revealed, without issuing a viewport request.
    const resolved = resolveVisibleSelection({ tradeId: target.tradeId })
    if (!resolved?.range) return
    const range = selectedTrade.value?.isComplete
      ? resolved.range
      : { ...resolved.range, to: bar.time }
    if (range.from !== target.range?.from || range.to !== target.range?.to)
      selection.value = { ...resolved, range }
  })
  watch(currentDrawdownRange, (range) => {
    if (!selection.value?.drawdown) return
    selection.value = range
      ? {
          candleId: range.trough.candleId ?? undefined,
          range: { from: range.from, to: range.to },
          drawdown: range,
        }
      : null
  })
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
    // Resume the existing viewport policy; a pause is not a navigation request.
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
  function question(target?: ReplaySelection): ReplayQuestionReference | null {
    if (!data.detail.value) return null
    pause()
    const s = target ?? selection.value
    const trade = visibleTrades.value.find((trade) => trade.id === s?.tradeId)
    const insight = visibleInsights.value.find((insight) => insight.id === s?.insightId)
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
        insight?.title ||
        (trade ? `#${trade.sequence} · ${data.detail.value.name}` : data.detail.value.name),
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
    currentDrawdownRange,
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
    relatedInsightTrade,
    pause,
    previewResult,
    play,
    start,
    locate,
    toggleTrade,
    inspectInsight,
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
