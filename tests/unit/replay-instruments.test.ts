import { describe, expect, it, vi } from 'vitest'
import type { ReplayApi } from '~/features/replay/api'
import type {
  CandleQuery,
  ReplayCandlePage,
  ReplayDetail,
  ReplayTrade,
} from '~/features/replay/types'
import { createReplayDataState } from '~/features/replay/data-state'
import { replayInstruments, tradeInstrument } from '~/features/replay/instruments'
import { buildReplayEvents, resolveSelection } from '~/features/replay/events'
import { revealTrades } from '~/features/replay/visibility'
import { toBar } from '~/features/replay/normalize'
import { candles, iso, replayDetail, replayTrades } from '../e2e/replay-fixtures'

const detail: ReplayDetail = {
  ...replayDetail,
  conditions: {
    ...replayDetail.conditions,
    symbol: undefined,
    end_at: iso(6),
    instruments: {
      reference: { symbol: 'SOL/USDT', market_type: 'spot', tradable: false },
      spot: { symbol: 'BTC/USDT', market_type: 'spot', tradable: true },
      future: {
        symbol: 'BTC/USDT',
        market_type: 'futures',
        contract_type: 'perpetual',
        tradable: true,
      },
    },
  },
  instrument_snapshots: {
    reference: { id: 'sol', symbol: 'SOL/USDT', required_feeds: ['4h'] },
    spot: { id: 'btc-spot', symbol: 'BTC/USDT', market_type: 'spot', required_feeds: ['1h', '4h'] },
    future: {
      id: 'btc-future',
      symbol: 'BTC/USDT',
      market_type: 'futures',
      contract_type: 'perpetual',
      required_feeds: ['1h', '2h'],
    },
  },
  counts: {
    candles: 18,
    trades: 2,
    insights: 0,
    execution_steps: 6,
    candles_by_instrument: { spot: 8, future: 8, reference: 2 },
  },
}
const allCandles = candles(6)
function result(query: CandleQuery = {}): ReplayCandlePage {
  const instrument = query.instrument ?? 'spot'
  const timeframe = query.timeframe ?? '1h'
  const snapshot = detail.instrument_snapshots![instrument]!
  return {
    instrument,
    instrument_id: snapshot.id,
    timeframe,
    available_timeframes: snapshot.required_feeds,
    items: allCandles.map((candle) => ({ ...candle, id: `${instrument}-${candle.id}` })),
    has_more: false,
    next_cursor: null,
  }
}
function setup() {
  const api: ReplayApi = {
    detail: vi.fn().mockResolvedValue(detail),
    list: vi.fn(),
    candles: vi.fn().mockImplementation(async (_id, query) => result(query)),
    trades: vi.fn().mockResolvedValue({ items: [], page: 1, total_pages: 1 }),
    report: vi.fn(),
  }
  return { api, state: createReplayDataState(api) }
}

describe('frozen replay instruments', () => {
  it('keeps same-symbol markets separate and preserves legacy single instruments', () => {
    const instruments = replayInstruments(detail)
    expect(instruments.map((item) => item.role)).toEqual(['reference', 'spot', 'future'])
    expect(tradeInstrument({ instrument_id: 'btc-future' }, instruments)?.market_type).toBe(
      'futures',
    )
    expect(tradeInstrument({ symbol: 'BTC/USDT' }, instruments)?.role).toBe('')
    expect(replayInstruments(replayDetail)).toMatchObject([
      { role: '', symbol: 'BTC/USDT', timeframes: ['1h'] },
    ])
  })

  it('uses one tradable execution axis, distinct instrument queries and readonly capabilities', async () => {
    const { api, state } = setup()
    await state.load('replay-1')
    await vi.waitFor(() => expect(state.candlesComplete.value).toBe(true))
    const axis = state.axis.value
    expect(state.axisInstrument.value).toBe('spot')
    expect(axis).toHaveLength(6)
    expect(await state.setInstrument('future')).toBe(true)
    expect(state.selectedInstrument.value?.market_type).toBe('futures')
    expect(state.bars.value[0]?.id).toBe('future-c-0')
    expect(state.availableTimeframes.value).toEqual(['1h', '2h'])
    expect(state.axis.value).toBe(axis)
    expect(await state.setTimeframe('4h')).toBe(false)
    expect(await state.setInstrument('reference')).toBe(true)
    expect(state.displayTimeframe.value).toBe('4h')
    expect(state.availableTimeframes.value).toEqual(['4h'])
    expect(api.trades).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.candles).mock.calls.every(([, query]) => !!query?.instrument)).toBe(true)
  })

  it('keeps cursors inside the selected instrument and rejects wrong returned identities', async () => {
    const { api, state } = setup()
    await state.load('replay-1')
    await vi.waitFor(() => expect(state.candlesComplete.value).toBe(true))
    vi.mocked(api.candles).mockImplementation(async (_id, query = {}) => ({
      ...result(query),
      items: result(query).items.slice(query.cursor ? 3 : 0, query.cursor ? 6 : 3),
      has_more: !query.cursor,
      next_cursor: query.cursor ? null : 'future-page-2',
    }))
    expect(await state.setInstrument('future')).toBe(true)
    expect(state.bars.value).toHaveLength(6)
    expect(api.candles).toHaveBeenLastCalledWith(
      'replay-1',
      expect.objectContaining({ instrument: 'future', timeframe: '1h', cursor: 'future-page-2' }),
      expect.any(AbortSignal),
    )
    vi.mocked(api.candles).mockResolvedValue(result({ instrument: 'spot', timeframe: '4h' }))
    expect(await state.setInstrument('reference')).toBe(false)
    expect(state.displayInstrument.value).toBe('future')
    expect(state.bars.value[0]?.id).toBe('future-c-0')
  })

  it('cancels a late switch, preserves the last good chart on failure and discards reset work', async () => {
    const { api, state } = setup()
    await state.load('replay-1')
    await vi.waitFor(() => expect(state.candlesComplete.value).toBe(true))
    let finish!: (value: ReplayCandlePage) => void
    let signal!: AbortSignal
    vi.mocked(api.candles).mockImplementation((_id, _query, requestSignal) => {
      signal = requestSignal!
      return new Promise((resolve) => {
        finish = resolve
      })
    })
    const pending = state.setInstrument('future')
    expect(await state.setInstrument('spot')).toBe(true)
    expect(signal.aborted).toBe(true)
    finish(result({ instrument: 'future' }))
    expect(await pending).toBe(false)
    expect(state.displayInstrument.value).toBe('spot')
    expect(state.bars.value[0]?.id).toBe('spot-c-0')
    vi.mocked(api.candles).mockRejectedValue(new Error('offline'))
    expect(await state.setInstrument('future')).toBe(false)
    expect(state.displayInstrument.value).toBe('spot')
    expect(state.displayError.value).toBeTruthy()
    state.reset()
    expect(state.instruments.value).toEqual([])
  })
})

describe('shared replay timeline', () => {
  const bars = allCandles.map(toBar)
  const indexes = new Map(bars.map((bar, index) => [bar.id, index]))
  const trades: ReplayTrade[] = ['spot', 'future'].map((role, i) => ({
    ...replayTrades[0]!,
    id: role,
    instrument_role: role,
    sequence: i + 1,
    entry_at: iso(0),
    exit_at: iso(3),
    entry_candle_id: `${role}-c-0`,
    exit_candle_id: `${role}-c-3`,
    fills: replayTrades[0]!.fills.map((fill, n) => ({
      ...fill,
      id: `${role}-${n}`,
      instrument_role: role,
      sequence: n * 2 + i + 1,
      candle_id: `${role}-c-${n * 3}`,
      occurred_at: iso(n * 3),
    })),
  }))
  it('retains simultaneous fills from both legs in global sequence order', () => {
    const events = buildReplayEvents(bars, [...trades].reverse(), [], false)
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4])
    expect(events.map((event) => event.index)).toEqual([0, 0, 3, 3])
    expect(events[1]?.selection).toMatchObject({ instrumentRole: 'future', candleId: 'future-c-0' })
    expect(revealTrades(trades, indexes, 0, bars)).toHaveLength(2)
    expect(
      revealTrades(trades, indexes, 0, bars).every(
        (trade) => !trade.isComplete && trade.fills.length === 1,
      ),
    ).toBe(true)
    expect(revealTrades(trades, indexes, 3, bars).every((trade) => trade.isComplete)).toBe(true)
  })
  it('resolves a different leg using its frozen timestamps without replacing its candle IDs', () => {
    expect(resolveSelection({ tradeId: 'future' }, bars, trades, [])).toMatchObject({
      instrumentRole: 'future',
      candleId: 'future-c-3',
      range: { from: bars[0]!.time, to: bars[3]!.time },
    })
    const insight = {
      id: 'i-multi',
      sequence: 1,
      scope: 'runtime' as const,
      type: 'trade_outcome',
      candle_id: 'future-c-3',
      title: '',
      content: '',
      is_validated: true,
      suggestion: null,
      tradeoff: null,
      evidence: { instrument_role: 'future', trade_id: 'future' },
    }
    expect(buildReplayEvents(bars, trades, [insight], false).at(-1)?.insight?.id).toBe('i-multi')
    expect(resolveSelection({ insightId: insight.id }, bars, trades, [insight])).toMatchObject({
      instrumentRole: 'future',
      candleId: 'future-c-3',
      time: bars[3]!.time,
    })
  })
})
