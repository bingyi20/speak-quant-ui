import { describe, expect, it, vi } from 'vitest'
import { createReplayDataState } from '~/features/replay/data-state'
import type { ReplayApi } from '~/features/replay/api'
import { normalizeState, toBar, nextBarTime } from '~/features/replay/normalize'
import { buildReplayEvents, resolveSelection } from '~/features/replay/events'
import { isReplayMessageContext } from '~/features/conversation/submission'
import { candles, replayDetail, replayTrades, replayInsights } from '../e2e/replay-fixtures'
function setup() {
  const raw = candles(6)
  const api: ReplayApi = {
    detail: vi.fn().mockResolvedValue(replayDetail),
    list: vi.fn(),
    candles: vi
      .fn()
      .mockResolvedValue({ timeframe: '1h', items: raw, has_more: false, next_cursor: null }),
    trades: vi.fn().mockResolvedValue({ items: replayTrades, page: 1, total_pages: 1 }),
    insights: vi.fn().mockResolvedValue({ items: replayInsights }),
    report: vi
      .fn()
      .mockResolvedValue({ format: 'markdown', content: '# Report', generated_at: '' }),
  }
  return { api, raw, state: createReplayDataState(api) }
}
describe('replay resources and identity', () => {
  it('keeps Decimal precision, missing state and zero semantically distinct', () => {
    expect(normalizeState(null, '10000')).toBeNull()
    expect(normalizeState({ position: 'flat', equity: null }, '10000')).toBeNull()
    expect(
      normalizeState(
        { position: 'flat', equity: '10000', position_quantity: '0', unrealized_pnl: '0' },
        '10000',
      ),
    ).toMatchObject({ direction: 'flat', quantity: '0', cumulative: '0', unrealized: '0' })
    expect(
      normalizeState({ position: '-0.1', equity: '10000.00000001' }, '10000')?.cumulative,
    ).toBe('1e-12')
    expect(() => toBar({ ...candles(1)[0]!, high: '-1' })).toThrow()
    expect(nextBarTime(Date.parse('2025-02-01') / 1000, '1M')).toBe(Date.parse('2025-03-01') / 1000)
  })
  it('uses ID/time instead of range-local sequence and gates timeframe capability', async () => {
    const { api, state, raw } = setup()
    vi.mocked(api.candles).mockImplementation(async (_id, q) => ({
      timeframe: '1h',
      items: q.from ? raw.slice(-2).map((c) => ({ ...c, sequence: 1 })) : raw,
      has_more: false,
      next_cursor: null,
    }))
    await state.load('replay-1')
    await vi.waitFor(() => expect(state.candlesComplete.value).toBe(true))
    expect(state.axis.value).toHaveLength(6)
    expect(state.indexById.get('c-5')).toBe(5)
    expect(state.availableTimeframes.value).toEqual(['1h'])
    expect(await state.setTimeframe('4h')).toBe(false)
  })
  it('retains committed pages on failure, retries cursor and rejects non-progressing responses', async () => {
    const { api, state, raw } = setup()
    let fail = true
    vi.mocked(api.candles).mockImplementation(async (_id, q) => {
      if (q.from) return { timeframe: '1h', items: [], has_more: false, next_cursor: null }
      if (q.cursor && fail) throw new Error('offline')
      return {
        timeframe: '1h',
        items: q.cursor ? raw.slice(3) : raw.slice(0, 3),
        has_more: !q.cursor,
        next_cursor: q.cursor ? null : 'next',
      }
    })
    await state.load('replay-1')
    await vi.waitFor(() => expect(state.phases.candles).toBe('error'))
    expect(state.axis.value).toHaveLength(3)
    fail = false
    await state.retry('candles')
    expect(state.axis.value).toHaveLength(6)
    expect(state.candlesComplete.value).toBe(true)
    state.reset()
    vi.mocked(api.candles).mockResolvedValue({
      timeframe: '1h',
      items: raw,
      has_more: true,
      next_cursor: null,
    })
    await state.load('replay-1')
    await vi.waitFor(() => expect(state.phases.candles).toBe('error'))
    expect(state.axis.value).toHaveLength(0)
  })
  it('discards responses after owner/reset and rejects duplicate candle IDs', async () => {
    const { api, state, raw } = setup()
    let finish!: (v: typeof replayDetail) => void
    vi.mocked(api.detail).mockReturnValue(
      new Promise((r) => {
        finish = r
      }),
    )
    const pending = state.load('replay-1')
    state.reset()
    finish(replayDetail)
    await pending
    expect(state.detail.value).toBeNull()
    vi.mocked(api.detail).mockResolvedValue(replayDetail)
    vi.mocked(api.candles).mockResolvedValue({
      timeframe: '1h',
      items: [raw[0], { ...raw[1], id: raw[0]!.id }],
      has_more: false,
      next_cursor: null,
    })
    await state.load('replay-1')
    await vi.waitFor(() => expect(state.phases.candles).toBe('error'))
    expect(state.indexById.size).toBe(0)
  })
  it('switches server-supplied candles without altering canonical state; failed switch retains view', async () => {
    const { api, state, raw } = setup()
    vi.mocked(api.candles).mockImplementation(async (_id, q) => ({
      timeframe: q.timeframe ?? '1h',
      available_timeframes: ['1h', '4h'],
      items: raw,
      has_more: false,
      next_cursor: null,
    }))
    await state.load('replay-1')
    await vi.waitFor(() => expect(state.candlesComplete.value).toBe(true))
    const axis = state.axis.value
    expect(await state.setTimeframe('4h')).toBe(true)
    expect(state.axis.value).toBe(axis)
    expect(state.displayTimeframe.value).toBe('4h')
    vi.mocked(api.candles).mockRejectedValue(new Error('offline'))
    expect(await state.setTimeframe('4h')).toBe(false)
    expect(state.bars.value).toHaveLength(6)
    await state.setTimeframe('1h')
    expect(state.bars.value).toBe(axis)
  })
  it('reloads an evicted raw page using its canonical cursor and keeps reports lazy', async () => {
    const { api, state } = setup()
    const raw = candles(26)
    vi.mocked(api.candles).mockImplementation(async (_id, q) => {
      const n = Number(q.cursor ?? 0)
      return {
        timeframe: '1h',
        items: q.from ? [] : raw.slice(n, n + 2),
        has_more: !q.from && n + 2 < raw.length,
        next_cursor: n + 2 < raw.length ? String(n + 2) : null,
      }
    })
    await state.load('replay-1')
    await vi.waitFor(() => expect(state.candlesComplete.value).toBe(true))
    const before = vi.mocked(api.candles).mock.calls.length
    expect((await state.readCandle('c-0'))?.id).toBe('c-0')
    expect(vi.mocked(api.candles).mock.calls.length).toBe(before + 1)
    expect(api.report).not.toHaveBeenCalled()
    await state.loadReport()
    await state.loadReport()
    expect(api.report).toHaveBeenCalledTimes(1)
  })
})
describe('replay evidence and context', () => {
  const bars = candles().map(toBar)
  it('resolves singular/array evidence, exact fills and unanchored global insights', () => {
    expect(
      resolveSelection({ insightId: 'i-1' }, bars, replayTrades, replayInsights),
    ).toMatchObject({ tradeId: 't-1', range: { from: bars[20]!.time, to: bars[50]!.time } })
    expect(
      resolveSelection({ insightId: 'i-2' }, bars, replayTrades, replayInsights),
    ).toMatchObject({ tradeId: 't-2', fillId: 'f-4', candleId: 'c-100' })
    expect(resolveSelection({ insightId: 'i-global' }, bars, replayTrades, replayInsights)).toEqual(
      { insightId: 'i-global', tradeId: undefined, fillId: undefined, candleId: undefined },
    )
    expect(
      resolveSelection({ tradeId: 't-1', fillId: 'f-4' }, bars, replayTrades, replayInsights),
    ).toBeNull()
    expect(
      resolveSelection({ candleId: 'other-replay' }, bars, replayTrades, replayInsights),
    ).toBeNull()
  })
  it('orders fills before insights and only produces comparable result shortcuts once complete', () => {
    const events = buildReplayEvents(bars, replayTrades, replayInsights, true)
    expect(events.filter((e) => e.index === 100).map((e) => e.kind)).toEqual([
      'fill',
      'insight',
      'worst',
    ])
    expect(events.find((e) => e.kind === 'best')?.trade?.id).toBe('t-1')
    expect(
      buildReplayEvents(bars.slice(0, 81), replayTrades, replayInsights, false).map((e) => e.kind),
    ).toEqual(['fill', 'fill', 'fill'])
  })
  it('only accepts the backend context whitelist', () => {
    expect(
      isReplayMessageContext({
        replay_id: 'replay-1',
        trade_id: 't-1',
        timestamp: '2025-01-01T00:00:00Z',
      }),
    ).toBe(true)
    for (const value of [
      {},
      { replay_id: 'a', strategy_node_id: 'x' },
      { replay_id: 'a', timestamp: 'bad' },
      { replay_id: 'a', fill_id: 42 },
      { replay_id: '../other' },
    ])
      expect(isReplayMessageContext(value)).toBe(false)
  })
})
