import { nextBarTime } from './normalize'
import type { ReplayBar, ReplayTrade, ReplayTradeView } from './types'

export function closedBars(bars: readonly ReplayBar[], cutoff: number, timeframe: string) {
  return bars.filter((bar) => {
    const close = bar.closeTime ?? nextBarTime(bar.time, timeframe)
    return close !== null && close <= cutoff
  })
}

/** A view of a trade at one historical candle; never mutate the frozen API record. */
export function revealTrades(
  trades: readonly ReplayTrade[],
  indexes: ReadonlyMap<string, number>,
  index: number,
): ReplayTradeView[] {
  return trades
    .filter((trade) => (indexes.get(trade.entry_candle_id) ?? Infinity) <= index)
    .map((trade) => {
      const fills = trade.fills.filter((fill) => (indexes.get(fill.candle_id) ?? Infinity) <= index)
      const isComplete =
        !!trade.exit_candle_id && (indexes.get(trade.exit_candle_id) ?? Infinity) <= index
      if (isComplete) return { ...trade, fills, isComplete }
      return {
        ...trade,
        fills,
        isComplete,
        status: 'open',
        entry_price: fills.find((fill) => fill.action === 'open')?.price ?? null,
        exit_candle_id: null,
        exit_at: null,
        exit_price: null,
        exit_reason: null,
        quantity: null,
        net_pnl: null,
        gross_pnl: null,
        return_rate: null,
        fee: null,
        funding_cost: null,
        slippage_cost: null,
        holding_seconds: null,
      }
    })
}

export function candleChange(
  bar: ReplayBar | undefined,
  previous: ReplayBar | undefined,
  timeframe: string,
) {
  // A gap or a truncated window cannot establish the previous candle's close.
  if (
    !bar ||
    !previous ||
    nextBarTime(previous.time, timeframe) !== bar.time ||
    previous.close === 0
  )
    return { amount: null, rate: null }
  return { amount: bar.close - previous.close, rate: (bar.close - previous.close) / previous.close }
}
