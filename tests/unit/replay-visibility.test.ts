import { expect, it } from 'vitest'
import { candleChange, closedBars, revealTrades } from '~/features/replay/visibility'
import { toBar } from '~/features/replay/normalize'
import { candles, replayTrades } from '../e2e/replay-fixtures'
const bars = candles().map(toBar)
const indexes = new Map(bars.map((bar, index) => [bar.id, index]))
it('reveals fills at the historical position without exposing a later exit or final totals', () => {
  const original = structuredClone(replayTrades)
  expect(revealTrades(replayTrades, indexes, 19)).toEqual([])
  const [open] = revealTrades(replayTrades, indexes, 20)
  expect(open).toMatchObject({
    status: 'open',
    isComplete: false,
    entry_price: '95200',
    exit_price: null,
    exit_at: null,
    exit_reason: null,
    net_pnl: null,
    gross_pnl: null,
    quantity: null,
    fee: null,
    return_rate: null,
    holding_seconds: null,
  })
  expect(open!.fills.map((fill) => fill.id)).toEqual(['f-1'])
  const [closed] = revealTrades(replayTrades, indexes, 50)
  expect(closed).toMatchObject({ isComplete: true, net_pnl: '87', exit_price: '96100' })
  expect(closed!.fills).toHaveLength(2)
  expect(revealTrades(replayTrades, indexes, 80)[1]).toMatchObject({
    status: 'open',
    direction: 'short',
    exit_reason: null,
  })
  expect(revealTrades(replayTrades, indexes, 100)[1]).toMatchObject({
    isComplete: true,
    net_pnl: '-63',
  })
  expect(revealTrades(replayTrades, indexes, 20)[0]!.fills).toHaveLength(1)
  expect(replayTrades).toEqual(original)
})
it('cannot reveal unmapped fills or infer a closed trade from its final API status', () => {
  const indexesWithoutExit = new Map(indexes)
  indexesWithoutExit.delete('c-50')
  expect(revealTrades(replayTrades, indexesWithoutExit, 199)[0]).toMatchObject({
    status: 'open',
    net_pnl: null,
    isComplete: false,
  })
  expect(revealTrades(replayTrades, indexesWithoutExit, 199)[0]!.fills).toHaveLength(1)
})
it('auxiliary candles appear only after close, including legacy rows with a known timeframe', () => {
  const auxiliary = bars
    .filter((_, index) => index % 4 === 0)
    .map((bar) => ({ ...bar, closeTime: bar.time + 14400 }))
  expect(closedBars(auxiliary, bars[2]!.closeTime!, '4h')).toHaveLength(0)
  expect(closedBars(auxiliary, bars[3]!.closeTime!, '4h').map((bar) => bar.id)).toEqual(['c-0'])
  expect(closedBars(auxiliary, bars[20]!.closeTime!, '4h').at(-1)!.id).toBe('c-16')
  expect(closedBars([{ ...bars[0]!, closeTime: null }], bars[2]!.closeTime!, '4h')).toHaveLength(0)
  expect(closedBars([{ ...bars[0]!, closeTime: null }], bars[3]!.closeTime!, '4h')).toHaveLength(1)
  expect(closedBars([{ ...bars[0]!, closeTime: null }], Infinity, 'unknown')).toHaveLength(0)
})
it('quote change uses adjacent previous close and leaves unavailable comparisons blank', () => {
  const previous = { ...bars[0]!, close: 100 },
    bar = { ...bars[1]!, open: 102, close: 105 }
  expect(candleChange(bar, previous, '1h')).toEqual({ amount: 5, rate: 0.05 })
  expect(candleChange(bar, undefined, '1h')).toEqual({ amount: null, rate: null })
  expect(candleChange(bars[2], previous, '1h')).toEqual({ amount: null, rate: null })
  expect(candleChange(bar, { ...previous, close: 0 }, '1h')).toEqual({ amount: null, rate: null })
})
