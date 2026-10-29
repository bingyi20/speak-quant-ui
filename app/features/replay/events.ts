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

/** Cross-instrument candle IDs differ; execution timestamps share one account axis. */
export function replayEventIndex(
  bars: readonly ReplayBar[],
  indexes: ReadonlyMap<string, number>,
  candleId: string,
  occurredAt?: string | null,
  instrumentRole?: string | null,
) {
  const indexed = indexes.get(candleId)
  if (indexed !== undefined || !instrumentRole || !occurredAt) return indexed
  const time = Date.parse(occurredAt) / 1000
  if (!Number.isFinite(time)) return undefined
  let lo = 0,
    hi = bars.length - 1,
    found = -1
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (bars[mid]!.time <= time) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  const bar = bars[found]
  return bar && time <= (bar.closeTime ?? bar.time) ? found : undefined
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
      const index = replayEventIndex(
        bars,
        indexes,
        fill.candle_id,
        fill.occurred_at,
        fill.instrument_role ?? trade.instrument_role,
      )
      if (index === undefined) continue
      events.push({
        id: `fill:${fill.id}`,
        index,
        time: trade.instrument_role ? Date.parse(fill.occurred_at) / 1000 : bars[index]!.time,
        kind: 'fill',
        sequence: fill.sequence,
        selection: {
          candleId: fill.candle_id,
          tradeId: trade.id,
          fillId: fill.id,
          ...(trade.instrument_role
            ? { instrumentRole: trade.instrument_role, time: Date.parse(fill.occurred_at) / 1000 }
            : {}),
        },
        fill,
        trade,
      })
    }
  for (const insight of insights) {
    const trade = trades.find(
      (item) =>
        item.entry_candle_id === insight.candle_id ||
        item.exit_candle_id === insight.candle_id ||
        item.fills.some((fill) => fill.candle_id === insight.candle_id),
    )
    const role =
      typeof insight.evidence?.instrument_role === 'string'
        ? insight.evidence.instrument_role
        : trade?.instrument_role
    const at =
      trade?.fills.find((fill) => fill.candle_id === insight.candle_id)?.occurred_at ??
      (trade?.exit_candle_id === insight.candle_id ? trade.exit_at : trade?.entry_at)
    const index =
      insight.scope === 'runtime' && insight.candle_id
        ? replayEventIndex(bars, indexes, insight.candle_id, at, role)
        : undefined
    if (index === undefined) continue
    events.push({
      id: `insight:${insight.id}`,
      index,
      time: bars[index]!.time,
      kind: 'insight',
      sequence: insight.sequence,
      selection: {
        insightId: insight.id,
        candleId: insight.candle_id!,
        ...(role ? { instrumentRole: role, time: bars[index]!.time } : {}),
      },
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
      const index = trade?.exit_candle_id
        ? replayEventIndex(
            bars,
            indexes,
            trade.exit_candle_id,
            trade.exit_at,
            trade.instrument_role,
          )
        : undefined
      if (trade && index !== undefined)
        events.push({
          id: kind,
          kind,
          index,
          time: bars[index]!.time,
          sequence: trade.sequence,
          trade,
          selection: {
            tradeId: trade.id,
            ...(trade.instrument_role ? { instrumentRole: trade.instrument_role } : {}),
          },
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
  trades: readonly Pick<
    ReplayTrade,
    | 'id'
    | 'entry_candle_id'
    | 'exit_candle_id'
    | 'fills'
    | 'entry_at'
    | 'exit_at'
    | 'instrument_role'
  >[],
  insights: readonly ReplayInsight[],
): ReplaySelection | null {
  const byId = new Map(bars.map((c) => [c.id, c]))
  const relatedTimes = new Map<string, { time: number; role: string }>()
  for (const trade of trades) {
    if (!trade.instrument_role) continue
    const put = (id: string | null, at: string | null) => {
      const time = at ? Date.parse(at) / 1000 : NaN
      if (id && Number.isFinite(time)) relatedTimes.set(id, { time, role: trade.instrument_role! })
    }
    put(trade.entry_candle_id, trade.entry_at)
    put(trade.exit_candle_id, trade.exit_at)
    for (const fill of trade.fills) put(fill.candle_id, fill.occurred_at)
  }
  const candleTime = (id: string) => byId.get(id)?.time ?? relatedTimes.get(id)?.time
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
    const related = insight.candle_id ? relatedTimes.get(insight.candle_id) : undefined
    const role = typeof e?.instrument_role === 'string' ? e.instrument_role : related?.role
    if (role) {
      result.instrumentRole = role
      result.time = insight.candle_id ? candleTime(insight.candle_id) : undefined
    }
    if (!result.candleId && typeof e?.entry_candle_id === 'string')
      result.candleId = e.entry_candle_id
    if (typeof e?.entry_candle_id === 'string' && typeof e.exit_candle_id === 'string') {
      const from = candleTime(e.entry_candle_id),
        to = candleTime(e.exit_candle_id)
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
    if (trade.instrument_role) result.instrumentRole = trade.instrument_role
    if (!result.fillId) {
      const entry = byId.get(trade.entry_candle_id),
        exit = trade.exit_candle_id ? byId.get(trade.exit_candle_id) : undefined
      if (!trade.instrument_role && (!entry || (trade.exit_candle_id && !exit))) return null
      const from = entry?.time ?? Date.parse(trade.entry_at) / 1000
      const to = exit?.time ?? (trade.exit_at ? Date.parse(trade.exit_at) / 1000 : from)
      if (!Number.isFinite(from) || !Number.isFinite(to)) return null
      result.range ??= { from, to }
      result.candleId ??= trade.exit_candle_id ?? trade.entry_candle_id
      if (trade.instrument_role) result.time = to
    }
  }
  if (result.fillId) {
    const fill = trade?.fills.find((f) => f.id === result.fillId)
    if (!fill) return null
    result.candleId = fill.candle_id
    if (trade?.instrument_role) result.time = Date.parse(fill.occurred_at) / 1000
    delete result.range
  }
  if (
    result.candleId &&
    !byId.has(result.candleId) &&
    (!result.instrumentRole || !Number.isFinite(result.time))
  )
    return null
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
