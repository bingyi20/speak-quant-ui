import { createDrawdownHistory, verifiedDrawdownRange } from './historical-result'
import { computed, reactive, ref, shallowRef } from 'vue'
import { BoundedCache } from '~/lib/chart/cache'
import type { ReplayApi } from './api'
import { timeframeSeconds, toBar } from './normalize'
import type {
  CandleQuery,
  ReplayBar,
  ReplayCandle,
  ReplayCandlePage,
  ReplayDetail,
  ReplayDrawdownRange,
  ReplayEquityHistory,
  ReplayInsight,
  ReplayReport,
  ReplayTrade,
} from './types'

type Resource = 'candles' | 'trades' | 'insights' | 'report'
type Phase = 'idle' | 'loading' | 'ready' | 'error'
const emptyPhases = (): Record<Resource, Phase> => ({
  candles: 'idle',
  trades: 'idle',
  insights: 'idle',
  report: 'idle',
})
const emptyErrors = (): Record<Resource, string> => ({
  candles: '',
  trades: '',
  insights: '',
  report: '',
})
interface CandlePageIndex {
  cursor?: string
  ids: string[]
}

export function createReplayDataState(api: ReplayApi) {
  const detail = shallowRef<ReplayDetail | null>(null)
  const loading = ref(false),
    error = ref('')
  const phases = reactive(emptyPhases()),
    errors = reactive(emptyErrors())
  const axis = shallowRef<ReplayBar[]>([]),
    preview = shallowRef<ReplayBar[]>([])
  const trades = shallowRef<ReplayTrade[]>([]),
    insights = shallowRef<ReplayInsight[]>([])
  const report = shallowRef<ReplayReport | null>(null)
  const candlesComplete = ref(false),
    tradesComplete = ref(false)
  const availableTimeframes = ref<string[]>([]),
    displayTimeframe = ref(''),
    displayLoading = ref(false),
    displayError = ref('')
  const displayBars = shallowRef<ReplayBar[]>([])
  const drawdownRange = shallowRef<ReplayDrawdownRange | null>(null)
  const equityHistory = new Map<string, ReplayEquityHistory | null>()
  let appendDrawdown: ReturnType<typeof createDrawdownHistory> | null = null
  const indexById = new Map<string, number>()
  const pageById = new Map<string, number>(),
    pages: CandlePageIndex[] = []
  const rawCache = new BoundedCache<number, ReplayCandle[]>(12)
  const windowCache = new BoundedCache<string, ReplayCandle>(400)
  const inFlight = new Map<string, Promise<ReplayCandlePage>>()
  const mainBars = computed(() => {
    if (!preview.value.length || candlesComplete.value) return axis.value
    const loaded = new Set(axis.value.map((c) => c.id))
    return [...axis.value, ...preview.value.filter((c) => !loaded.has(c.id))].sort(
      (a, b) => a.time - b.time,
    )
  })
  const bars = computed(() =>
    displayTimeframe.value === detail.value?.strategy.execution_timeframe
      ? mainBars.value
      : displayBars.value,
  )
  let controller = new AbortController(),
    generation = 0,
    displayGeneration = 0
  let displayRequest: AbortController | undefined
  let currentId = '',
    nextCursor: string | undefined,
    tradePage = 1
  let scanning = false,
    trading = false
  const displayWindow = shallowRef<{ timeframe: string; from: number; to: number } | null>(null)
  const valid = (g: number) => g === generation && !controller.signal.aborted
  function cancel() {
    generation++
    displayGeneration++
    controller.abort()
    displayRequest?.abort()
    inFlight.clear()
    scanning = false
    trading = false
    loading.value = false
    displayLoading.value = false
  }
  function reset() {
    cancel()
    controller = new AbortController()
    currentId = ''
    detail.value = null
    error.value = ''
    Object.assign(phases, emptyPhases())
    Object.assign(errors, emptyErrors())
    axis.value = []
    preview.value = []
    trades.value = []
    insights.value = []
    report.value = null
    displayBars.value = []
    availableTimeframes.value = []
    displayTimeframe.value = ''
    displayError.value = ''
    equityHistory.clear()
    appendDrawdown = null
    indexById.clear()
    pageById.clear()
    pages.length = 0
    rawCache.clear()
    windowCache.clear()
    candlesComplete.value = false
    tradesComplete.value = false
    drawdownRange.value = null
    displayWindow.value = null
    nextCursor = undefined
    tradePage = 1
  }
  // Two candle requests at most; user seeks/window changes precede queued scan work.
  let activeRequests = 0
  const queue: Array<{ start: () => void; signal: AbortSignal }> = []
  function drain() {
    while (activeRequests < 2 && queue.length) {
      const next = queue.shift()!
      if (!next.signal.aborted) next.start()
    }
  }
  function scheduledCandles(
    id: string,
    query: CandleQuery,
    signal: AbortSignal,
    priority: boolean,
  ) {
    return new Promise<ReplayCandlePage>((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      let started = false
      const abort = () => {
        if (!started) {
          const n = queue.indexOf(task)
          if (n >= 0) queue.splice(n, 1)
        }
        reject(new DOMException('Aborted', 'AbortError'))
      }
      const task = {
        signal,
        start() {
          started = true
          activeRequests++
          void api
            .candles(id, query, signal)
            .then(resolve, reject)
            .finally(() => {
              signal.removeEventListener('abort', abort)
              activeRequests--
              drain()
            })
        },
      }
      signal.addEventListener('abort', abort, { once: true })
      if (priority) queue.unshift(task)
      else queue.push(task)
      drain()
    })
  }
  async function page(query: CandleQuery, signal = controller.signal, priority = false) {
    const key = JSON.stringify([generation, currentId, query])
    const existing = inFlight.get(key)
    if (existing && signal === controller.signal) return existing
    const request = scheduledCandles(currentId, query, signal, priority)
    if (signal === controller.signal) inFlight.set(key, request)
    try {
      return await request
    } finally {
      if (inFlight.get(key) === request) inFlight.delete(key)
    }
  }
  function acceptCapabilities(result: ReplayCandlePage) {
    const execution = detail.value!.strategy.execution_timeframe
    if (result.timeframe !== execution) throw new Error('Candle timeframe mismatch')
    // Older APIs expose no capability list: retain the single execution timeframe.
    if (Array.isArray(result.available_timeframes))
      availableTimeframes.value = [
        ...new Set([
          execution,
          ...result.available_timeframes.filter(
            (t) => typeof t === 'string' && /^\d+[mhdwM]$/.test(t),
          ),
        ]),
      ]
  }
  async function loadPreview(atStart: boolean) {
    const d = detail.value
    if (!d) return
    const g = generation
    const start = Date.parse(d.conditions.start_at),
      end = Date.parse(d.conditions.end_at)
    const window = (timeframeSeconds(d.strategy.execution_timeframe) ?? 86400) * 200 * 1000
    try {
      const result = await page({
        limit: 2000,
        from: new Date(atStart ? start : Math.max(start, end - window)).toISOString(),
        to: new Date(atStart ? Math.min(end, start + window) : end).toISOString(),
      })
      if (!valid(g)) return
      acceptCapabilities(result)
      preview.value = result.items.map(toBar)
      result.items.forEach((c) => windowCache.set(c.id, c))
    } catch {
      /* The canonical scan has its own visible retry state. */
    }
  }
  async function loadCandles() {
    if (scanning || candlesComplete.value || detail.value?.status !== 'completed') return
    const g = generation
    scanning = true
    phases.candles = 'loading'
    errors.candles = ''
    const seen = new Set<string>()
    try {
      do {
        const cursor = nextCursor,
          result = await page({ limit: 2000, ...(cursor ? { cursor } : {}) })
        if (!valid(g)) return
        acceptCapabilities(result)
        if (
          result.has_more &&
          (!result.items.length ||
            !result.next_cursor ||
            result.next_cursor === cursor ||
            seen.has(result.next_cursor))
        )
          throw new Error('Non-progressing cursor')
        const rows = result.items.map(toBar)
        let last = axis.value.at(-1)
        const pageIndex = pages.length,
          localIds = new Set<string>()
        for (let i = 0; i < rows.length; i++) {
          const c = rows[i]!
          if (localIds.has(c.id) || indexById.has(c.id) || (last && c.time <= last.time))
            throw new Error('Conflicting candle index')
          last = c
          localIds.add(c.id)
        }
        for (let i = 0; i < rows.length; i++) {
          const c = rows[i]!
          indexById.set(c.id, axis.value.length + i)
          pageById.set(c.id, pageIndex)
          equityHistory.set(c.id, appendDrawdown?.(result.items[i]!) ?? null)
        }
        pages.push({ cursor, ids: rows.map((c) => c.id) })
        rawCache.set(pageIndex, result.items)
        axis.value = [...axis.value, ...rows]
        nextCursor = result.next_cursor ?? undefined
        if (nextCursor) seen.add(nextCursor)
        if (!result.has_more) {
          const count = detail.value?.counts?.candles
          if (count !== undefined && count !== axis.value.length)
            throw new Error('Incomplete candle history')
          candlesComplete.value = true
          preview.value = []
          phases.candles = 'ready'
          drawdownRange.value = verifiedDrawdownRange(
            equityHistory.get(axis.value.at(-1)?.id ?? '') ?? null,
            detail.value?.result?.max_drawdown_rate,
          )
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 0))
      } while (valid(g))
    } catch {
      if (valid(g)) {
        phases.candles = 'error'
        errors.candles = 'replay.errors.candles'
      }
    } finally {
      if (valid(g)) scanning = false
    }
  }
  async function readCandle(id: string): Promise<ReplayCandle | null> {
    const n = pageById.get(id)
    if (n === undefined) return windowCache.get(id) ?? null
    const cached = rawCache.get(n)
    if (cached) return cached.find((c) => c.id === id) ?? null
    const g = generation,
      entry = pages[n]!
    const result = await page({ limit: 2000, ...(entry.cursor ? { cursor: entry.cursor } : {}) })
    if (!valid(g)) return null
    acceptCapabilities(result)
    if (
      result.items.length !== entry.ids.length ||
      result.items.some((c, i) => c.id !== entry.ids[i])
    )
      throw new Error('Frozen page changed')
    rawCache.set(n, result.items)
    return result.items.find((c) => c.id === id) ?? null
  }
  async function loadTrades() {
    if (trading || tradesComplete.value || detail.value?.status !== 'completed') return
    const g = generation
    trading = true
    phases.trades = 'loading'
    errors.trades = ''
    try {
      do {
        const result = await api.trades(currentId, tradePage, controller.signal)
        if (!valid(g)) return
        const rows = new Map(trades.value.map((t) => [t.id, t]))
        result.items.forEach((t) => rows.set(t.id, t))
        if (
          result.page !== tradePage ||
          (tradePage < result.total_pages && rows.size === trades.value.length)
        )
          throw new Error('Invalid trade pagination')
        trades.value = [...rows.values()].sort((a, b) => a.sequence - b.sequence)
        tradePage++
        if (tradePage > result.total_pages) {
          tradesComplete.value = true
          phases.trades = 'ready'
          break
        }
      } while (valid(g))
    } catch {
      if (valid(g)) {
        phases.trades = 'error'
        errors.trades = 'replay.errors.trades'
      }
    } finally {
      if (valid(g)) trading = false
    }
  }
  async function loadInsights() {
    if (phases.insights === 'loading' || detail.value?.status !== 'completed') return
    const g = generation
    phases.insights = 'loading'
    errors.insights = ''
    try {
      const result = await api.insights(currentId, controller.signal)
      if (valid(g)) {
        insights.value = result.items.slice().sort((a, b) => a.sequence - b.sequence)
        phases.insights = 'ready'
      }
    } catch {
      if (valid(g)) {
        phases.insights = 'error'
        errors.insights = 'replay.errors.insights'
      }
    }
  }
  async function loadReport() {
    if (report.value || phases.report === 'loading' || detail.value?.status !== 'completed') return
    const g = generation
    phases.report = 'loading'
    errors.report = ''
    try {
      const result = await api.report(currentId, controller.signal)
      if (!valid(g)) return
      if (result.format !== 'markdown' || typeof result.content !== 'string')
        throw new Error('Invalid report')
      report.value = result
      phases.report = 'ready'
    } catch {
      if (valid(g)) {
        phases.report = 'error'
        errors.report = 'replay.errors.report'
      }
    }
  }
  async function load(id: string, atStart = false, preserve = false) {
    if (!preserve || currentId !== id) {
      reset()
      currentId = id
    }
    const g = generation
    loading.value = !detail.value
    error.value = ''
    try {
      const result = await api.detail(id, controller.signal)
      if (!valid(g)) return
      if (result.id !== id) throw new Error('Replay identity mismatch')
      const previousStatus = detail.value?.status
      detail.value = result
      if (result.status === 'completed' && previousStatus !== 'completed') {
        appendDrawdown = createDrawdownHistory(
          result.conditions.initial_capital,
          result.conditions.start_at,
          result.strategy.execution_timeframe,
        )
        displayTimeframe.value = result.strategy.execution_timeframe
        availableTimeframes.value = [result.strategy.execution_timeframe]
        void loadPreview(atStart)
        void loadCandles()
        void loadTrades()
        void loadInsights()
      }
    } catch {
      if (valid(g)) error.value = 'replay.errors.detail'
    } finally {
      if (valid(g)) loading.value = false
    }
  }
  async function setTimeframe(timeframe: string, range?: { from: number; to: number }) {
    if (!detail.value || !availableTimeframes.value.includes(timeframe)) return false
    displayRequest?.abort()
    const dg = ++displayGeneration,
      g = generation
    displayError.value = ''
    if (timeframe === detail.value.strategy.execution_timeframe) {
      displayTimeframe.value = timeframe
      displayBars.value = []
      displayLoading.value = false
      return true
    }
    const request = new AbortController()
    displayRequest = request
    const signal = AbortSignal.any([controller.signal, request.signal])
    displayLoading.value = true
    const d = detail.value
    const end = Date.parse(d.conditions.end_at) / 1000,
      start = Date.parse(d.conditions.start_at) / 1000
    const step = timeframeSeconds(timeframe) ?? 86400
    const from = Math.max(start, (range?.from ?? end - step * 200) - step * 30)
    const to = Math.min(end, (range?.to ?? end) + step * 30)
    const rows: ReplayBar[] = []
    let cursor: string | undefined
    const cursors = new Set<string>()
    try {
      if (from >= to) throw new Error('Invalid timeframe window')
      do {
        const result = await page(
          {
            timeframe,
            from: new Date(from * 1000).toISOString(),
            to: new Date(to * 1000).toISOString(),
            limit: 2000,
            ...(cursor ? { cursor } : {}),
          },
          signal,
          true,
        )
        if (!valid(g) || dg !== displayGeneration) return false
        if (result.timeframe !== timeframe) throw new Error('Timeframe mismatch')
        const chunk = result.items.map(toBar)
        for (const row of chunk) {
          if (rows.length && row.time <= rows.at(-1)!.time)
            throw new Error('Invalid candle ordering')
          rows.push(row)
        }
        if (!result.has_more) break
        if (!result.next_cursor || cursors.has(result.next_cursor) || !chunk.length)
          throw new Error('Invalid cursor')
        cursor = result.next_cursor
        cursors.add(cursor)
      } while (!signal.aborted)
      if (!valid(g) || dg !== displayGeneration) return false
      displayBars.value = rows
      displayTimeframe.value = timeframe
      displayWindow.value = { timeframe, from, to }
      return true
    } catch {
      if (valid(g) && dg === displayGeneration && !signal.aborted)
        displayError.value = 'replay.errors.timeframe'
      return false
    } finally {
      if (valid(g) && dg === displayGeneration) displayLoading.value = false
    }
  }
  function retry(resource: Resource) {
    // A failed final-page/count check has no resumable cursor. Rebuild the
    // canonical prefix instead of appending page one onto a truncated history.
    if (
      resource === 'candles' &&
      !scanning &&
      !nextCursor &&
      axis.value.length &&
      phases.candles === 'error'
    ) {
      axis.value = []
      indexById.clear()
      pageById.clear()
      pages.length = 0
      rawCache.clear()
      equityHistory.clear()
      drawdownRange.value = null
      const d = detail.value!
      appendDrawdown = createDrawdownHistory(
        d.conditions.initial_capital,
        d.conditions.start_at,
        d.strategy.execution_timeframe,
      )
    }
    return { candles: loadCandles, trades: loadTrades, insights: loadInsights, report: loadReport }[
      resource
    ]()
  }
  return {
    detail,
    loading,
    error,
    phases,
    errors,
    axis,
    bars,
    mainBars,
    indexById,
    trades,
    insights,
    report,
    candlesComplete,
    tradesComplete,
    availableTimeframes,
    displayTimeframe,
    displayLoading,
    displayError,
    drawdownRange,
    equityHistory,
    displayWindow,
    load,
    reset,
    cancel,
    retry,
    loadReport,
    readCandle,
    setTimeframe,
  }
}
export type ReplayDataState = ReturnType<typeof createReplayDataState>
