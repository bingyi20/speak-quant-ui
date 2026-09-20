import Decimal from 'decimal.js'
import { decimal } from './normalize'
import type {
  ReplayBar,
  ReplayEvent,
  ReplayInsight,
  ReplaySelection,
  ReplayTrade,
  ReplayDrawdownRange,
} from './types'

/** Position direction belongs to the trade; buy/sell alone cannot distinguish open/close. */
export function fillActionKey(action: string, direction?: string) {
  const knownAction = ['open', 'increase', 'reduce', 'close'].includes(action)
  return knownAction && (direction === 'long' || direction === 'short')
    ? `replay.fillActions.${direction}.${action}`
    : `replay.actions.${knownAction ? action : 'trade'}`
}

export function buildDrawdownEvent(
  drawdown: ReplayDrawdownRange | null,
  indexes: ReadonlyMap<string, number>,
): ReplayEvent | null {
  const candleId = drawdown?.trough.candleId
  const index = candleId ? indexes.get(candleId) : undefined
  if (!drawdown || !candleId || index === undefined) return null
  return {
    id: 'drawdown',
    kind: 'drawdown',
    index,
    time: drawdown.to,
    sequence: 0,
    selection: {
      candleId,
      range: { from: drawdown.from, to: drawdown.to },
      drawdown,
    },
  }
}

export function buildReplayEvents(
  bars: readonly ReplayBar[],
  trades: readonly ReplayTrade[],
  insights: readonly ReplayInsight[],
  complete: boolean,
  drawdown: ReplayDrawdownRange | null = null,
): ReplayEvent[] {
  const indexes = new Map(bars.map((c, i) => [c.id, i]))
  const events: ReplayEvent[] = []
  for (const trade of trades)
    for (const fill of trade.fills) {
      const index = indexes.get(fill.candle_id)
      if (index === undefined) continue
      events.push({
        id: `fill:${fill.id}`,
        index,
        time: bars[index]!.time,
        kind: 'fill',
        sequence: fill.sequence,
        selection: { candleId: fill.candle_id, tradeId: trade.id, fillId: fill.id },
        fill,
        trade,
      })
    }
  for (const insight of insights) {
    const index =
      insight.scope === 'runtime' && insight.candle_id ? indexes.get(insight.candle_id) : undefined
    if (index === undefined) continue
    events.push({
      id: `insight:${insight.id}`,
      index,
      time: bars[index]!.time,
      kind: 'insight',
      sequence: insight.sequence,
      selection: { insightId: insight.id, candleId: insight.candle_id! },
      insight,
    })
  }
  if (complete) {
    const comparable = trades.filter((t) => t.exit_candle_id && decimal(t.net_pnl) !== null)
    for (const kind of ['best', 'worst'] as const) {
      const sorted = comparable
        .filter((t) =>
          kind === 'best' ? new Decimal(t.net_pnl!).gt(0) : new Decimal(t.net_pnl!).lt(0),
        )
        .sort((a, b) => new Decimal(a.net_pnl!).cmp(b.net_pnl!) * (kind === 'best' ? -1 : 1))
      const trade = sorted[0]
      const index = trade?.exit_candle_id ? indexes.get(trade.exit_candle_id) : undefined
      if (trade && index !== undefined)
        events.push({
          id: kind,
          kind,
          index,
          time: bars[index]!.time,
          sequence: trade.sequence,
          trade,
          selection: { tradeId: trade.id },
        })
    }
    const event = buildDrawdownEvent(drawdown, indexes)
    if (event) events.push(event)
  }
  const order = { fill: 0, insight: 1, best: 2, worst: 3, drawdown: 4 }
  return events.sort(
    (a, b) =>
      a.index - b.index ||
      order[a.kind] - order[b.kind] ||
      a.sequence - b.sequence ||
      a.id.localeCompare(b.id),
  )
}
export function resolveSelection(
  selection: ReplaySelection,
  bars: readonly ReplayBar[],
  trades: readonly Pick<ReplayTrade, 'id' | 'entry_candle_id' | 'exit_candle_id' | 'fills'>[],
  insights: readonly ReplayInsight[],
): ReplaySelection | null {
  const byId = new Map(bars.map((c) => [c.id, c]))
  const insight = selection.insightId
    ? insights.find((i) => i.id === selection.insightId)
    : undefined
  if (selection.insightId && !insight) return null
  // Insight references describe evidence, not another selected entity. Resolve
  // its own anchor/range afresh so linked fills cannot replace either of them.
  const result: ReplaySelection = insight ? { insightId: insight.id } : { ...selection }
  if (insight) {
    if (insight.candle_id) result.candleId = insight.candle_id
    const e = insight.evidence
    if (!result.candleId && typeof e?.entry_candle_id === 'string')
      result.candleId = e.entry_candle_id
    if (typeof e?.entry_candle_id === 'string' && typeof e.exit_candle_id === 'string') {
      const from = byId.get(e.entry_candle_id)?.time,
        to = byId.get(e.exit_candle_id)?.time
      if (from !== undefined && to !== undefined && from <= to) result.range = { from, to }
    }
    if (!result.range && typeof e?.start_at === 'string' && typeof e.end_at === 'string') {
      const from = Date.parse(e.start_at) / 1000,
        to = Date.parse(e.end_at) / 1000
      if (Number.isFinite(from) && Number.isFinite(to) && from <= to) result.range = { from, to }
    }
  }
  const trade = result.tradeId
    ? trades.find((t) => t.id === result.tradeId)
    : result.fillId
      ? trades.find((t) => t.fills.some((f) => f.id === result.fillId))
      : undefined
  if (result.tradeId && !trade) return null
  if (trade) {
    result.tradeId = trade.id
    if (!result.fillId) {
      const entry = byId.get(trade.entry_candle_id),
        exit = trade.exit_candle_id ? byId.get(trade.exit_candle_id) : undefined
      if (!entry || (trade.exit_candle_id && !exit)) return null
      result.range ??= { from: entry.time, to: exit?.time ?? entry.time }
      result.candleId ??= exit?.id ?? entry.id
    }
  }
  if (result.fillId) {
    const fill = trade?.fills.find((f) => f.id === result.fillId)
    if (!fill) return null
    result.candleId = fill.candle_id
    delete result.range
  }
  if (result.candleId && !byId.has(result.candleId)) return null
  if (result.range) {
    const first = bars[0]?.time,
      last = bars.at(-1)?.time
    if (
      first === undefined ||
      last === undefined ||
      result.range.from > last ||
      result.range.to < first
    )
      return null
    result.range = { from: Math.max(first, result.range.from), to: Math.min(last, result.range.to) }
  }
  return result
}
export function groupEvents(
  events: readonly ReplayEvent[],
  start: number,
  end: number,
  width: number,
  pixels = 12,
) {
  const groups: Array<{ position: number; items: ReplayEvent[] }> = []
  if (!(end > start) || width <= 0) return groups
  for (const event of events) {
    const position = (event.time - start) / (end - start)
    if (position < 0 || position > 1) continue
    const last = groups.at(-1)
    if (last && Math.abs(position - last.position) * width < pixels) last.items.push(event)
    else groups.push({ position, items: [event] })
  }
  return groups
}
