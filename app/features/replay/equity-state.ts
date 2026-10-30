import { ref, shallowRef } from 'vue'
import type { ReplayApi } from './api'
import { decimal, nextBarTime, ReplayDecimal } from './normalize'
import type {
  ReplayDetail,
  ReplayEquityCurve,
  ReplayEquityCurvePage,
  ReplayEquityCurvePoint,
} from './types'

const metadataKeys = [
  'capital_currency',
  'execution_timeframe',
  'initial_capital',
  'start_at',
  'end_at',
] as const

function validatePage(
  page: ReplayEquityCurvePage,
  replay: ReplayDetail,
  metadata: ReplayEquityCurve | null,
  previous: ReplayEquityCurvePoint | undefined,
) {
  const start = Date.parse(page.start_at),
    end = Date.parse(page.end_at),
    initial = decimal(page.initial_capital)
  if (
    !page.capital_currency ||
    !Array.isArray(page.items) ||
    typeof page.has_more !== 'boolean' ||
    (page.next_cursor !== null && typeof page.next_cursor !== 'string') ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start >= end ||
    start !== Date.parse(replay.conditions.start_at) ||
    end !== Date.parse(replay.conditions.end_at) ||
    page.execution_timeframe !==
      (replay.conditions.execution_timeframe ?? replay.strategy.execution_timeframe) ||
    initial === null ||
    new ReplayDecimal(initial).lte(0) ||
    !new ReplayDecimal(initial).eq(replay.conditions.initial_capital) ||
    (metadata && metadataKeys.some((key) => page[key] !== metadata[key]))
  )
    throw new Error('Invalid equity metadata')

  for (const point of page.items) {
    const time = Date.parse(point.time),
      equity = decimal(point.equity),
      rate = decimal(point.net_return_rate),
      drawdown = decimal(point.drawdown_rate)
    if (
      !Number.isSafeInteger(point.sequence) ||
      point.sequence !== (previous ? previous.sequence + 1 : 0) ||
      !Number.isFinite(time) ||
      time < start ||
      time > end ||
      (previous && time <= Date.parse(previous.time)) ||
      typeof point.equity !== 'string' ||
      typeof point.net_return_rate !== 'string' ||
      typeof point.drawdown_rate !== 'string' ||
      equity === null ||
      rate === null ||
      drawdown === null ||
      new ReplayDecimal(drawdown).lt(0) ||
      point.is_initial !== (point.sequence === 0)
    )
      throw new Error('Invalid equity point')
    if (point.is_initial) {
      if (
        time !== start ||
        point.open_time !== null ||
        !new ReplayDecimal(equity).eq(initial) ||
        !new ReplayDecimal(rate).isZero() ||
        !new ReplayDecimal(drawdown).isZero()
      )
        throw new Error('Invalid initial equity')
    } else {
      const opened = point.open_time === null ? NaN : Date.parse(point.open_time),
        next = nextBarTime(opened / 1000, page.execution_timeframe),
        previousOpen = previous?.open_time ? Date.parse(previous.open_time) / 1000 : null,
        expectedOpen =
          previousOpen === null ? null : nextBarTime(previousOpen, page.execution_timeframe)
      const firstLimit = nextBarTime(start / 1000, page.execution_timeframe)
      if (
        !Number.isFinite(opened) ||
        opened < start ||
        opened >= time ||
        next === null ||
        time > next * 1000 ||
        (point.sequence === 1 && (firstLimit === null || opened >= firstLimit * 1000)) ||
        (expectedOpen !== null && opened !== expectedOpen * 1000)
      )
        throw new Error('Invalid equity clock')
    }
    previous = point
  }
}

/** One current-replay cache. Partial pages remain private until the entire chain is valid. */
export function createReplayEquityState(api: Pick<ReplayApi, 'equityCurve'>) {
  const equityCurve = shallowRef<ReplayEquityCurve | null>(null)
  const equityLoading = ref(false),
    equityError = ref(''),
    equityComplete = ref(false)
  let generation = 0,
    controller: AbortController | undefined,
    pending: Promise<void> | undefined

  function cancel() {
    generation++
    controller?.abort()
    controller = undefined
    pending = undefined
    equityLoading.value = false
  }
  function reset() {
    cancel()
    equityCurve.value = null
    equityComplete.value = false
    equityError.value = ''
  }
  function load(id: string, replay: ReplayDetail, ownerSignal: AbortSignal): Promise<void> {
    if (equityComplete.value || replay.status !== 'completed' || ownerSignal.aborted)
      return Promise.resolve()
    if (pending) return pending
    const g = ++generation
    controller = new AbortController()
    const signal = AbortSignal.any([ownerSignal, controller.signal])
    const valid = () => g === generation && !signal.aborted
    equityLoading.value = true
    equityError.value = ''
    pending = (async () => {
      const rows: ReplayEquityCurvePoint[] = []
      let metadata: ReplayEquityCurve | null = null,
        cursor: string | undefined
      const cursors = new Set<string>()
      try {
        do {
          const page = await api.equityCurve(
            id,
            { limit: 2000, ...(cursor ? { cursor } : {}) },
            signal,
          )
          if (!valid()) return
          validatePage(page, replay, metadata, rows.at(-1))
          if (
            page.has_more &&
            (!page.items.length || !page.next_cursor || cursors.has(page.next_cursor))
          )
            throw new Error('Invalid equity cursor')
          if (!metadata)
            metadata = {
              capital_currency: page.capital_currency,
              execution_timeframe: page.execution_timeframe,
              initial_capital: page.initial_capital,
              start_at: page.start_at,
              end_at: page.end_at,
              items: rows,
            }
          for (const point of page.items) rows.push(point)
          if (!page.has_more) {
            if (rows.length < 2) throw new Error('Missing equity samples')
            const last = rows.at(-1)!,
              following = nextBarTime(Date.parse(last.open_time!) / 1000, page.execution_timeframe),
              nextClose =
                following === null ? null : nextBarTime(following, page.execution_timeframe)
            if (nextClose === null || nextClose * 1000 <= Date.parse(page.end_at))
              throw new Error('Incomplete equity curve')
            equityCurve.value = metadata
            equityComplete.value = true
            return
          }
          cursor = page.next_cursor!
          cursors.add(cursor)
          await new Promise((resolve) => setTimeout(resolve, 0))
        } while (valid())
      } catch {
        if (valid()) equityError.value = 'replay.errors.equity'
      } finally {
        if (g === generation) {
          equityLoading.value = false
          pending = undefined
        }
      }
    })()
    return pending
  }
  return { equityCurve, equityLoading, equityError, equityComplete, load, cancel, reset }
}
