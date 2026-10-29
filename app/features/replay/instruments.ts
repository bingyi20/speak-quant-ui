import type { ReplayDetail, ReplayInstrument, ReplayInstrumentIdentity } from './types'

const periods = (values: unknown[]) => [
  ...new Set(
    values.filter(
      (value): value is string => typeof value === 'string' && /^\d+[mhdwM]$/.test(value),
    ),
  ),
]

/** Only frozen bindings/snapshots establish identity; identical symbols may have different markets. */
export function replayInstruments(detail: ReplayDetail | null): ReplayInstrument[] {
  if (!detail) return []
  const bindings = detail.conditions.instruments ?? detail.instruments
  if (!bindings || !Object.keys(bindings).length)
    return [
      {
        role: '',
        symbol: detail.conditions.symbol ?? '',
        market_type: detail.conditions.market_type,
        contract_type: detail.conditions.contract_type,
        timeframes: [detail.strategy.execution_timeframe],
      },
    ]
  return Object.entries(bindings).map(([role, binding]) => {
    const snapshot = detail.instrument_snapshots?.[role]
    const levels = detail.conditions.timeframe_bindings?.[role]
    const timeframes = periods(
      snapshot?.required_feeds ?? [
        ...(binding.tradable !== false ? [detail.strategy.execution_timeframe] : []),
        ...Object.values(typeof levels === 'object' ? levels : {}),
      ],
    )
    return {
      ...binding,
      role,
      symbol: snapshot?.symbol ?? binding.symbol,
      market_type: snapshot?.market_type ?? binding.market_type,
      contract_type: snapshot?.contract_type ?? binding.contract_type,
      instrument_id: snapshot?.instrument_id ?? snapshot?.id ?? binding.instrument_id,
      timeframes,
    }
  })
}

export function tradeInstrument(
  trade: ReplayInstrumentIdentity,
  instruments: readonly ReplayInstrument[],
): ReplayInstrument | null {
  const instrument =
    instruments.find((item) => !!trade.instrument_role && item.role === trade.instrument_role) ??
    instruments.find((item) => !!trade.instrument_id && item.instrument_id === trade.instrument_id)
  if (instrument) return instrument
  if (!trade.instrument_role && !trade.instrument_id && instruments.length === 1)
    return instruments[0] ?? null
  return trade.symbol
    ? {
        role: trade.instrument_role ?? '',
        instrument_id: trade.instrument_id ?? undefined,
        symbol: trade.symbol,
        market_type: trade.market_type ?? undefined,
        contract_type: trade.contract_type,
        timeframes: [],
      }
    : null
}
