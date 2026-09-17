import Decimal from 'decimal.js'
import { decimal } from './normalize'
import type { ReplayResult, ReplayTradeView } from './types'

/** Prefix maximum drawdown includes initial capital and never bridges missing equity. */
export function createDrawdownHistory() {
  let peak: Decimal | null = null,
    maximum = new Decimal(0),
    valid = true
  return (equity: string | null | undefined, capital: string) => {
    const value = decimal(equity),
      initial = decimal(capital)
    if (value === null || initial === null || new Decimal(initial).lte(0)) valid = false
    if (!valid) return null
    peak ??= new Decimal(initial!)
    const current = new Decimal(value!)
    peak = Decimal.max(peak, current)
    maximum = Decimal.max(maximum, peak.minus(current).div(peak))
    return maximum.toString()
  }
}

export function historicalResult(
  trades: readonly ReplayTradeView[],
  cumulative: string | null,
  equity: string | null,
  capital: string,
  drawdown: string | null,
): ReplayResult {
  const closed = trades.filter((trade) => trade.isComplete)
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
    net_return_rate: cumulative,
    max_drawdown_rate: drawdown,
    trade_count: trades.length,
    win_rate: valid && closed.length ? new Decimal(wins).div(closed.length).toString() : null,
    profit_factor: valid && losses.gt(0) ? profits.div(losses).toString() : null,
    net_profit:
      decimal(equity) !== null && decimal(capital) !== null
        ? new Decimal(equity!).minus(capital).toString()
        : null,
    total_fee: null,
  }
}
