import { expect, it } from 'vitest'
import { createDrawdownHistory, historicalResult } from '~/features/replay/historical-result'
import { revealTrades } from '~/features/replay/visibility'
import { candles, replayTrades } from '../e2e/replay-fixtures'
const indexes = new Map(candles().map((c, n) => [c.id, n]))
it('keeps the historical maximum through recovery and includes initial capital', () => {
  const next = createDrawdownHistory()
  expect(next('90', '100')).toBe('0.1')
  expect(next('120', '100')).toBe('0.1')
  expect(next('60', '100')).toBe('0.5')
  expect(next('130', '100')).toBe('0.5')
  expect(next(null, '100')).toBeNull()
  expect(next('130', '100')).toBeNull()
})
it('excludes future exits from realized statistics while retaining opened trade count', () => {
  const open = historicalResult(
    revealTrades(replayTrades, indexes, 20),
    '0.02',
    '102',
    '100',
    '0.01',
  )
  expect(open).toMatchObject({
    trade_count: 1,
    win_rate: null,
    profit_factor: null,
    net_profit: '2',
  })
  const first = historicalResult(
    revealTrades(replayTrades, indexes, 50),
    '0.03',
    '103',
    '100',
    '0.01',
  )
  expect(first).toMatchObject({ trade_count: 1, win_rate: '1', profit_factor: null })
  const both = historicalResult(revealTrades(replayTrades, indexes, 100), null, null, '100', null)
  expect(both.win_rate).toBe('0.5')
  expect(Number(both.profit_factor)).toBeCloseTo(87 / 63)
  expect(both.net_return_rate).toBeNull()
})
