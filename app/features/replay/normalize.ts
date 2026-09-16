import Decimal from 'decimal.js'
import type { ReplayBar, ReplayCandle, ReplayCandleState, ReplayEvidence } from './types'

export function decimal(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  try {
    const n = new Decimal(value)
    return n.isFinite() ? n.toString() : null
  } catch {
    return null
  }
}
export function toBar(c: ReplayCandle): ReplayBar {
  const time = Date.parse(c.time) / 1000
  const closeTime = c.close_time ? Date.parse(c.close_time) / 1000 : undefined
  if (closeTime !== undefined && (!Number.isFinite(closeTime) || closeTime < time))
    throw new Error('Invalid candle close time')
  const values = [c.open, c.high, c.low, c.close, c.volume].map((v) => Number(decimal(v) ?? NaN))
  if (
    !c.id ||
    !Number.isFinite(time) ||
    !values.every(Number.isFinite) ||
    values[1]! < Math.max(values[0]!, values[3]!) ||
    values[2]! > Math.min(values[0]!, values[3]!)
  )
    throw new Error('Invalid candle')
  return {
    id: c.id,
    time,
    closeTime,
    open: values[0]!,
    high: values[1]!,
    low: values[2]!,
    close: values[3]!,
    volume: values[4]!,
  }
}
export function normalizeState(state: ReplayCandleState | null | undefined, capital: string) {
  const equity = decimal(state?.equity)
  if (!state || equity === null) return null
  const quantity = decimal(state.position_quantity ?? state.position)
  const direction = ['long', 'short', 'flat'].includes(state.position ?? '')
    ? state.position!
    : quantity === null
      ? null
      : new Decimal(quantity).isZero()
        ? 'flat'
        : new Decimal(quantity).isPositive()
          ? 'long'
          : 'short'
  let cumulative = decimal(state.cumulative_return_rate)
  const initial = decimal(capital)
  if (cumulative === null && initial !== null && new Decimal(initial).greaterThan(0))
    cumulative = new Decimal(equity).div(initial).minus(1).toString()
  return {
    direction,
    quantity,
    equity,
    cumulative,
    drawdown: decimal(state.drawdown_rate),
    unrealized: decimal(state.unrealized_pnl),
    realized: decimal(state.realized_pnl),
    cash: decimal(state.cash),
    averagePrice: decimal(state.position_average_price),
    rules: state.rules ?? {},
  }
}
export function evidenceIds(e: ReplayEvidence | null) {
  return {
    trades: [
      ...new Set([
        ...(Array.isArray(e?.trade_ids) ? e.trade_ids.filter((v) => typeof v === 'string') : []),
        ...(typeof e?.trade_id === 'string' ? [e.trade_id] : []),
      ]),
    ],
    fills: Array.isArray(e?.fill_ids) ? e.fill_ids.filter((v) => typeof v === 'string') : [],
  }
}
export function timeframeSeconds(value: string): number | null {
  const m = /^(\d+)(m|h|d|w)$/.exec(value)
  return m ? Number(m[1]) * { m: 60, h: 3600, d: 86400, w: 604800 }[m[2] as 'm'] : null
}
export function nextBarTime(time: number, timeframe: string): number | null {
  const seconds = timeframeSeconds(timeframe)
  if (seconds) return time + seconds
  const m = /^(\d+)M$/.exec(timeframe)
  if (!m) return null
  const date = new Date(time * 1000)
  date.setUTCMonth(date.getUTCMonth() + Number(m[1]))
  return date.getTime() / 1000
}
export function nearestBar(bars: readonly ReplayBar[], time: number) {
  if (!bars.length) return -1
  let lo = 0,
    hi = bars.length - 1
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (bars[mid]!.time < time) lo = mid + 1
    else hi = mid
  }
  return lo > 0 && Math.abs(bars[lo - 1]!.time - time) < Math.abs(bars[lo]!.time - time)
    ? lo - 1
    : lo
}
