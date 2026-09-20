import { decimal, equityPerformance, nextBarTime, ReplayDecimal as Decimal } from './normalize'
import type {
  ReplayCandle,
  ReplayEquityHistory,
  ReplayEquityPoint,
  ReplayDrawdownRange,
  ReplayResult,
  ReplayTradeView,
} from './types'

export const EQUITY_RATE_DIGITS = 4

/** One immutable prefix result for both metrics and peak-to-trough evidence. */
export function createDrawdownHistory(capital: string, startAt: string, timeframe: string) {
  const initial = decimal(capital),
    start = Date.parse(startAt) / 1000
  let valid = initial !== null && new Decimal(initial).gt(0) && Number.isFinite(start)
  let peak: ReplayEquityPoint = {
    candleId: null,
    time: start,
    closeTime: start,
    equity: initial ?? '0',
  }
  let maximum = new Decimal(0),
    range: ReplayDrawdownRange | null = null
  let previous: { time: number; sequence: number } | null = null
  return (candle: ReplayCandle): ReplayEquityHistory | null => {
    if (!valid) return null
    const value = decimal(candle.state?.equity),
      time = Date.parse(candle.time) / 1000
    const expected = nextBarTime(previous?.time ?? start, timeframe)
    const closeTime = candle.close_time
      ? Date.parse(candle.close_time) / 1000
      : nextBarTime(time, timeframe)
    if (
      value === null ||
      !candle.id ||
      !Number.isFinite(time) ||
      closeTime === null ||
      !Number.isFinite(closeTime) ||
      closeTime <= time ||
      candle.sequence !== (previous?.sequence ?? 0) + 1 ||
      expected === null ||
      (previous ? time !== expected : time < start || time >= expected)
    ) {
      valid = false
      return null
    }
    previous = { time, sequence: candle.sequence }
    const current = new Decimal(value)
    const point = () => ({ candleId: candle.id, time, closeTime, equity: value })
    // Ties retain the first peak and first maximum interval, including initial capital.
    if (current.gt(peak.equity)) peak = point()
    const drawdown = new Decimal(peak.equity).minus(current).div(peak.equity)
    if (drawdown.gt(maximum)) {
      maximum = drawdown
      range = { from: peak.time, to: time, peak, trough: point(), rate: drawdown.toString() }
    }
    return {
      peak,
      currentDrawdown: drawdown.toString(),
      maximumDrawdown: maximum.toString(),
      range,
    }
  }
}

/** Keep backend totals authoritative; show full-run evidence only when independently verified. */
export function verifiedDrawdownRange(
  history: ReplayEquityHistory | null,
  expected: string | null | undefined,
) {
  const rate = decimal(expected)
  return history &&
    rate !== null &&
    new Decimal(rate).gte(0) &&
    new Decimal(history.maximumDrawdown).toFixed(EQUITY_RATE_DIGITS + 2) ===
      new Decimal(rate).toFixed(EQUITY_RATE_DIGITS + 2)
    ? history.range
    : null
}

export function historicalResult(
  trades: readonly ReplayTradeView[],
  equity: string | null,
  capital: string,
  drawdown: string | null,
): ReplayResult {
  const closed = trades.filter((trade) => trade.isComplete)
  const performance = equityPerformance(equity, capital)
  const valid = closed.every((trade) => decimal(trade.net_pnl) !== null)
  let profits = new Decimal(0),
    losses = new Decimal(0),
    wins = 0
  for (const trade of closed) {
    const value = decimal(trade.net_pnl)
    if (value === null) continue
    const pnl = new Decimal(value)
    if (pnl.gt(0)) {
      profits = profits.plus(pnl)
      wins++
    } else if (pnl.lt(0)) losses = losses.minus(pnl)
  }
  return {
    net_return_rate: performance?.rate ?? null,
    max_drawdown_rate: drawdown,
    trade_count: trades.length,
    win_rate: valid && closed.length ? new Decimal(wins).div(closed.length).toString() : null,
    profit_factor: valid && losses.gt(0) ? profits.div(losses).toString() : null,
    net_profit: performance?.profit ?? null,
    total_fee: null,
  }
}
