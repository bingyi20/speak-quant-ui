import { describe, expect, it, vi } from 'vitest'
import { createReplayEquityState } from '~/features/replay/equity-state'
import { createReplayDataState } from '~/features/replay/data-state'
import type { ReplayApi } from '~/features/replay/api'
import type { ReplayEquityCurvePage, ReplayEquityCurvePoint } from '~/features/replay/types'
import { iso, replayDetail } from '../e2e/replay-fixtures'

const detail = {
  ...replayDetail,
  conditions: { ...replayDetail.conditions, end_at: iso(4) },
}
const points: ReplayEquityCurvePoint[] = Array.from({ length: 5 }, (_, sequence) => ({
  sequence,
  time: sequence === 0 ? iso(0) : new Date(Date.parse(iso(sequence)) - 1).toISOString(),
  open_time: sequence === 0 ? null : iso(sequence - 1),
  equity: sequence === 0 ? '10000' : sequence === 4 ? '-2.000000001' : '10000.123456789012345678',
  net_return_rate:
    sequence === 0 ? '0' : sequence === 4 ? '-1.0002000000001' : '0.0000123456789012345678',
  drawdown_rate: sequence === 4 ? '1.0002000000001' : '0',
  is_initial: sequence === 0,
}))
function page(items = points, next: string | null = null): ReplayEquityCurvePage {
  return {
    capital_currency: 'USDT',
    execution_timeframe: '1h',
    initial_capital: '10000.00000000',
    start_at: iso(0),
    end_at: iso(4),
    items,
    next_cursor: next,
    has_more: next !== null,
  }
}
function setup() {
  const api = { equityCurve: vi.fn<ReplayApi['equityCurve']>().mockResolvedValue(page()) }
  const state = createReplayEquityState(api)
  const owner = new AbortController()
  return { api, state, owner, load: () => state.load(detail.id, detail, owner.signal) }
}

describe('independent replay account curve', () => {
  it('publishes only the entire cursor chain and preserves loss, Decimal precision and close milliseconds', async () => {
    const { api, state, load } = setup()
    let finish!: (result: ReplayEquityCurvePage) => void
    api.equityCurve
      .mockResolvedValueOnce(page(points.slice(0, 3), 'second'))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
    const pending = load()
    expect(load()).toBe(pending)
    await vi.waitFor(() => expect(api.equityCurve).toHaveBeenCalledTimes(2))
    expect(state.equityCurve.value).toBeNull()
    expect(state.equityLoading.value).toBe(true)
    expect(api.equityCurve.mock.calls[1]?.[1]).toEqual({ limit: 2000, cursor: 'second' })
    finish(page(points.slice(3)))
    await pending
    expect(state.equityComplete.value).toBe(true)
    expect(state.equityCurve.value?.items).toEqual(points)
    expect(state.equityCurve.value?.items.at(-1)?.equity).toBe('-2.000000001')
    await load()
    expect(api.equityCurve).toHaveBeenCalledTimes(2)
  })

  it('retries failed pagination from a clean chain without exposing a partial curve', async () => {
    const { api, state, load } = setup()
    api.equityCurve
      .mockResolvedValueOnce(page(points.slice(0, 2), 'second'))
      .mockRejectedValueOnce(new Error('offline'))
    await load()
    expect(state.equityCurve.value).toBeNull()
    expect(state.equityComplete.value).toBe(false)
    expect(state.equityError.value).toBe('replay.errors.equity')
    await load()
    expect(api.equityCurve.mock.calls[2]?.[1]).toEqual({ limit: 2000 })
    expect(state.equityCurve.value?.items).toEqual(points)
    expect(state.equityError.value).toBe('')
  })

  it.each([
    ['repeated cursor', page(points.slice(2, 4), 'second')],
    ['empty continuing page', page([], 'third')],
    ['missing cursor', { ...page(points.slice(2)), has_more: true }],
    ['sequence gap', page(points.slice(3))],
    ['duplicate boundary', page(points.slice(1))],
    ['changed metadata', { ...page(points.slice(2)), capital_currency: 'USD' }],
    ['invalid value', page(points.slice(2).map((point) => ({ ...point, equity: 'NaN' })))],
    ['premature final page', page(points.slice(2, 3))],
    [
      'time gap',
      page(points.slice(2).map((point) => ({ ...point, open_time: iso(point.sequence) }))),
    ],
  ])('rejects %s without connecting incomplete points', async (_reason, secondPage) => {
    const { api, state, load } = setup()
    api.equityCurve
      .mockResolvedValueOnce(page(points.slice(0, 2), 'second'))
      .mockResolvedValueOnce(secondPage)
    await load()
    expect(state.equityCurve.value).toBeNull()
    expect(state.equityComplete.value).toBe(false)
    expect(state.equityError.value).toBe('replay.errors.equity')
    expect(api.equityCurve).toHaveBeenCalledTimes(2)
  })

  it('accepts v3 execution boundaries exactly at end_at and calendar-month sampling', async () => {
    const { api, state, owner } = setup()
    const monthly = {
      ...detail,
      conditions: {
        ...detail.conditions,
        execution_timeframe: '1M',
        start_at: '2025-01-01T00:00:00Z',
        end_at: '2025-03-01T00:00:00Z',
      },
    }
    const monthlyPoints = points.slice(0, 3).map((point, index) => ({
      ...point,
      time: `2025-0${index + 1}-01T00:00:00Z`,
      open_time: index === 0 ? null : `2025-0${index}-01T00:00:00Z`,
    }))
    api.equityCurve.mockResolvedValue({
      ...page(monthlyPoints),
      execution_timeframe: '1M',
      start_at: monthly.conditions.start_at,
      end_at: monthly.conditions.end_at,
    })
    await state.load(detail.id, monthly, owner.signal)
    expect(state.equityCurve.value?.items.at(-1)?.time).toBe(monthly.conditions.end_at)
    expect(state.equityComplete.value).toBe(true)
  })

  it.each(['reset', 'cancel'] as const)(
    'discards late results after %s and aborts the request',
    async (action) => {
      const { api, state, load } = setup()
      let finish!: (result: ReplayEquityCurvePage) => void
      api.equityCurve.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
      const pending = load()
      state[action]()
      expect(api.equityCurve.mock.calls[0]?.[2]?.aborted).toBe(true)
      finish(page())
      await pending
      expect(state.equityCurve.value).toBeNull()
      expect(state.equityLoading.value).toBe(false)
      expect(state.equityError.value).toBe('')
    },
  )

  it('loads independently of candles and clears cached account data when the replay owner resets', async () => {
    const api: ReplayApi = {
      detail: vi.fn().mockResolvedValue(detail),
      list: vi.fn(),
      candles: vi.fn().mockRejectedValue(new Error('Candle assets unavailable')),
      trades: vi.fn().mockResolvedValue({ items: [], page: 1, total_pages: 1 }),
      report: vi.fn(),
      equityCurve: vi.fn().mockResolvedValue(page()),
    }
    const state = createReplayDataState(api)
    await state.load(detail.id)
    expect(api.equityCurve).not.toHaveBeenCalled()
    await state.loadEquityCurve()
    expect(state.equityComplete.value).toBe(true)
    state.reset()
    expect(state.equityCurve.value).toBeNull()
    expect(state.equityComplete.value).toBe(false)
  })
})
