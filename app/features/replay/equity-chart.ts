import type { ReplayEquityCurvePoint } from './types'

export interface EquityChartPoint {
  time: number
  value: number
  source: ReplayEquityCurvePoint
}

/** The API's effective time is authoritative, including subsecond legacy closes. */
export function equityChartPoints(points: readonly ReplayEquityCurvePoint[]): EquityChartPoint[] {
  let previousTime = -Infinity
  return points.map((source) => {
    const time = Date.parse(source.time) / 1000
    const value = Number(source.equity)
    if (!Number.isFinite(time) || !Number.isFinite(value) || time <= previousTime)
      throw new Error('Invalid equity chart point')
    previousTime = time
    return { time, value, source }
  })
}

/** An inclusive cutoff must never reveal the next execution boundary early. */
export function equityVisibleCount(points: readonly EquityChartPoint[], cutoff: number): number {
  if (Number.isNaN(cutoff)) return 0
  let low = 0,
    high = points.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (points[middle]!.time <= cutoff) low = middle + 1
    else high = middle
  }
  return low
}

/** Future timestamps reserve the whole replay axis without exposing future equity. */
export function equityChartTimeline(
  points: readonly EquityChartPoint[],
  start: number,
  end: number,
): number[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)
    throw new Error('Invalid equity chart range')
  if (points.some((point) => point.time < start || point.time > end))
    throw new Error('Equity chart point outside replay range')
  const last = points.at(-1)?.time
  // Legacy closes can be one millisecond before the frozen end boundary.
  // LWC gives every distinct timestamp a full logical slot, so adding that
  // boundary would misleadingly turn a 1 ms tail into an entire chart period.
  const closesAtEnd = last !== undefined && Math.round(end * 1000) - Math.round(last * 1000) <= 1
  return [
    ...(points[0]?.time === start ? [] : [start]),
    ...points.map((point) => point.time),
    ...(closesAtEnd ? [] : [end]),
  ]
}
