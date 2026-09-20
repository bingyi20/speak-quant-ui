import { expect, it } from 'vitest'
import {
  createDrawdownHistory,
  historicalResult,
  verifiedDrawdownRange,
  EQUITY_RATE_DIGITS,
} from '~/features/replay/historical-result'
import { normalizeState } from '~/features/replay/normalize'
import { formatRatio } from '~/lib/format'
import { revealTrades } from '~/features/replay/visibility'
import { candles, iso, replayTrades } from '../e2e/replay-fixtures'

const indexes = new Map(candles().map((c, n) => [c.id, n]))
const equityCandles = (values: Array<string | null>) =>
  candles(values.length).map((c, i) => ({
    ...c,
    state: { ...c.state!, equity: values[i]!, drawdown_rate: '0.99', cumulative_return_rate: '9' },
  }))
const history = (values: Array<string | null>, capital = '10') => {
  const next = createDrawdownHistory(capital, iso(0), '1h')
  return equityCandles(values).map(next)
}
it('uses one immutable prefix for drawdown and its equity peak-to-trough range through recovery and rewind', () => {
  const snapshots = history(['12', '15', '13', '9', '14'])
  expect(snapshots[2]?.currentDrawdown).toMatch(/^0\.133333333333333/)
  expect(snapshots[2]?.maximumDrawdown).toBe(snapshots[2]?.currentDrawdown)
  expect(snapshots[3]).toMatchObject({ currentDrawdown: '0.4', maximumDrawdown: '0.4' })
  expect(snapshots[4]?.currentDrawdown).toMatch(/^0\.066666666666666/)
  expect(snapshots[4]?.maximumDrawdown).toBe('0.4')
  expect(snapshots[4]?.range).toBe(snapshots[3]?.range)
  expect(snapshots[4]?.range).toMatchObject({
    from: Date.parse(iso(1)) / 1000,
    to: Date.parse(iso(3)) / 1000,
    peak: { candleId: 'c-1', equity: '15', closeTime: Date.parse(iso(2)) / 1000 },
    trough: { candleId: 'c-3', equity: '9', closeTime: Date.parse(iso(4)) / 1000 },
  })
  // Reading the earlier prefix does not carry the later maximum/trough back in time.
  expect(snapshots[2]?.range?.trough).toMatchObject({ candleId: 'c-2', equity: '13' })
  expect(snapshots[2]?.maximumDrawdown).not.toBe('0.4')
  expect(historicalResult([], '9', '10', snapshots[3]!.maximumDrawdown).net_return_rate).toBe(
    '-0.1',
  )
})
it('includes initial capital, keeps the first tied peak and maximum, and has no range without losses', () => {
  const first = history(['990'], '1000')[0]!
  expect(first).toMatchObject({ currentDrawdown: '0.01', maximumDrawdown: '0.01' })
  expect(first.range?.peak).toEqual({
    candleId: null,
    time: Date.parse(iso(0)) / 1000,
    closeTime: Date.parse(iso(0)) / 1000,
    equity: '1000',
  })
  expect(first.range?.trough.candleId).toBe('c-0')
  const tied = history(['100', '120', '100', '120', '100', '130'], '100')
  expect(tied[0]?.range).toBeNull()
  expect(tied[4]?.peak.candleId).toBe('c-1')
  expect(tied[4]?.range).toBe(tied[2]?.range)
  expect(tied[5]?.range).toBe(tied[2]?.range)
  expect(history(['10', '11', '12']).every((p) => p?.range === null)).toBe(true)
})
it('cannot bridge missing state, invalid equity, time gaps or missing pages, but rebuilding repaired history works', () => {
  for (const bad of [null, 'NaN', 'Infinity', 'oops', '']) {
    const prefixes = history(['12', bad, '9'])
    expect(prefixes[0]).not.toBeNull()
    expect(prefixes.slice(1)).toEqual([null, null])
  }
  for (const capital of ['0', '-1', 'bad']) expect(history(['12'], capital)).toEqual([null])
  for (const missing of ['time', 'sequence', 'state'] as const) {
    const raw = equityCandles(['12', '15', '9'])
    const next = createDrawdownHistory('10', iso(0), '1h')
    expect(next(raw[0]!)).not.toBeNull()
    const broken =
      missing === 'time'
        ? { ...raw[1]!, time: iso(2) }
        : missing === 'sequence'
          ? { ...raw[1]!, sequence: 3 }
          : { ...raw[1]!, state: null }
    expect(next(broken)).toBeNull()
    expect(next(raw[2]!)).toBeNull()
  }
  expect(createDrawdownHistory('10', iso(0), '1h')(equityCandles(['12', '15'])[1]!)).toBeNull()
  expect(history(['12', '15', '9'])[2]?.maximumDrawdown).toBe('0.4')
})
it('uses net equity for compounding and floating profit without adding trade rates or subtracting costs again', () => {
  const rows = history(['1100', '1210'], '1000')
  expect(historicalResult([], '1210', '1000', rows[1]!.maximumDrawdown)).toMatchObject({
    net_return_rate: '0.21',
    net_profit: '210',
  })
  const losing = history(['1100', '990'], '1000')[1]!
  expect(historicalResult([], '990', '1000', losing.maximumDrawdown)).toMatchObject({
    net_return_rate: '-0.01',
    max_drawdown_rate: '0.1',
  })
  expect(
    normalizeState(
      {
        position: 'long',
        equity: '1038.748',
        cumulative_return_rate: '9',
        unrealized_pnl: '38.748',
        cash: '0',
      },
      '1000',
    )?.cumulative,
  ).toBe('0.038748')
  expect(formatRatio('0.038748', 'en-US', EQUITY_RATE_DIGITS)).toBe('3.8748%')
  expect(historicalResult([], '999.000999000999000999', '1000', null).net_profit).toBe(
    '-0.999000999000999001',
  )
})
it('verifies full-run evidence at display precision without altering backend totals or introducing a temporary final peak', () => {
  const final = history(['1000', '1100', '1000'], '1000')[2]!
  expect(verifiedDrawdownRange(final, '0.0909090909')).toBe(final.range)
  expect(verifiedDrawdownRange(final, '0.09095')).toBeNull()
  expect(verifiedDrawdownRange(final, '0.153846')).toBeNull()
  expect(verifiedDrawdownRange(final, '-0.0909090909')).toBeNull()
  expect(verifiedDrawdownRange(null, '0.1')).toBeNull()
})
it('excludes future exits and partial reductions from closed-trade statistics while retaining opened trade count', () => {
  const partial = structuredClone(replayTrades)
  partial[0]!.fills.push({
    ...partial[0]!.fills[1]!,
    id: 'reduce',
    action: 'reduce',
    candle_id: 'c-30',
    realized_pnl: '50',
  })
  const open = historicalResult(revealTrades(partial, indexes, 30), '102', '100', '0.01')
  expect(open).toMatchObject({
    trade_count: 1,
    win_rate: null,
    profit_factor: null,
    net_profit: '2',
  })
  const first = historicalResult(revealTrades(replayTrades, indexes, 50), '103', '100', '0.01')
  expect(first).toMatchObject({ trade_count: 1, win_rate: '1', profit_factor: null })
  const both = historicalResult(revealTrades(replayTrades, indexes, 100), null, '100', null)
  expect(both.win_rate).toBe('0.5')
  expect(Number(both.profit_factor)).toBeCloseTo(87 / 63)
  expect(both.net_return_rate).toBeNull()
})
