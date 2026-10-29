import type { Page } from '@playwright/test'
import { envelope } from './auth-fixtures'
import { candles, iso, replayDetail, replayTrades, stubReplay } from './replay-fixtures'

export const portfolioInstruments = {
  asset_a: {
    instrument_id: 'btc-spot',
    symbol: 'BTC/USDT',
    market_type: 'spot',
    contract_type: null,
    leverage: null,
    tradable: true,
    allowed_directions: ['long'],
  },
  asset_b: {
    instrument_id: 'eth-perpetual',
    symbol: 'ETH/USDT',
    market_type: 'futures',
    contract_type: 'perpetual',
    leverage: '2',
    tradable: true,
    allowed_directions: ['long', 'short'],
  },
  hedge: {
    instrument_id: 'btc-perpetual',
    symbol: 'BTC/USDT',
    market_type: 'futures',
    contract_type: 'perpetual',
    leverage: '1',
    tradable: true,
    allowed_directions: ['long', 'short'],
  },
  benchmark: {
    instrument_id: 'sol-spot',
    symbol: 'SOL/USDT',
    market_type: 'spot',
    contract_type: null,
    leverage: null,
    tradable: false,
    allowed_directions: [],
  },
} as const

export type PortfolioRole = keyof typeof portfolioInstruments
const periods: Record<PortfolioRole, string[]> = {
  asset_a: ['1h', '4h'],
  asset_b: ['1h', '2h'],
  hedge: ['1h'],
  benchmark: ['4h'],
}
export const portfolioDetail = {
  ...replayDetail,
  name: '多标的组合验证',
  strategy: { ...replayDetail.strategy, name: '跨市场组合策略', auxiliary_timeframes: [] },
  runtime_contract: {
    api_version: 3,
    instrument_roles: Object.fromEntries(
      Object.entries(portfolioInstruments).map(([role, instrument]) => [
        role,
        { tradable: instrument.tradable, allowed_directions: instrument.allowed_directions },
      ]),
    ),
  },
  conditions: {
    start_at: iso(0),
    end_at: iso(200),
    initial_capital: '10000',
    execution_timeframe: '1h',
    instruments: portfolioInstruments,
    timeframe_bindings: {
      asset_a: { level_1: '1h', level_2: '4h' },
      asset_b: { level_1: '2h' },
      hedge: { level_1: '1h' },
      benchmark: { level_1: '4h' },
    },
    signal_levels: {
      asset_a: 'level_1',
      asset_b: 'level_1',
      hedge: 'level_1',
      benchmark: 'level_1',
    },
  },
  instrument_snapshots: Object.fromEntries(
    Object.entries(portfolioInstruments).map(([role, instrument]) => [
      role,
      {
        ...instrument,
        id: instrument.instrument_id,
        instrument_role: role,
        required_feeds: periods[role as PortfolioRole],
      },
    ]),
  ),
  counts: {
    candles: 800,
    execution_steps: 200,
    candles_by_instrument: { asset_a: 250, asset_b: 300, hedge: 200, benchmark: 50 },
    trades: 3,
    insights: 0,
  },
  result: { ...replayDetail.result!, trade_count: 3 },
}

export function portfolioCandles(role: PortfolioRole, timeframe: string) {
  const step = Number.parseInt(timeframe),
    base = { asset_a: 95000, asset_b: 3200, hedge: 95100, benchmark: 150 }[role]
  return candles()
    .filter((_, i) => i % step === 0)
    .map((c) => {
      const n = c.sequence - 1
      return {
        ...c,
        id: `${role}-${timeframe}-${n}`,
        instrument: role,
        instrument_id: portfolioInstruments[role].instrument_id,
        close_time: iso(n + step),
        open: String(base + n),
        high: String(base + n + 10),
        low: String(base + n - 10),
        close: String(base + n + 1),
        state:
          timeframe === '1h'
            ? {
                ...c.state!,
                position: role === 'asset_a' ? 'long' : 'short',
                position_quantity: role === 'asset_a' ? '0.1' : '-0.1',
              }
            : null,
      }
    })
}

export const portfolioTrades = (['asset_a', 'asset_b', 'hedge'] as const).map((role, n) => {
  const identity = {
    ...portfolioInstruments[role],
    instrument_role: role,
    group_id: 'shared-group',
  }
  const source = replayTrades[n === 0 ? 0 : 1]!,
    start = n === 1 ? 80 : 20,
    end = n === 1 ? 100 : 50,
    base = role === 'asset_b' ? 3200 : 95000
  return {
    ...source,
    ...identity,
    id: `portfolio-trade-${role}`,
    sequence: n + 1,
    entry_candle_id: `${role}-1h-${start}`,
    exit_candle_id: `${role}-1h-${end}`,
    entry_at: iso(start),
    exit_at: iso(end),
    entry_price: String(base + start),
    exit_price: String(base + end),
    fills: source.fills.map((fill, i) => ({
      ...fill,
      ...identity,
      id: `portfolio-fill-${role}-${i}`,
      // asset_a and hedge execute simultaneously; sequence still uniquely orders all legs.
      sequence:
        role === 'asset_a' ? (i === 0 ? 1 : 3) : role === 'hedge' ? (i === 0 ? 2 : 4) : 5 + i,
      batch_id: `${i === 0 ? 'open' : 'close'}-${n === 1 ? 'later' : 'paired'}`,
      candle_id: `${role}-1h-${i === 0 ? start : end}`,
      occurred_at: iso(i === 0 ? start : end),
      price: String(base + (i === 0 ? start : end)),
    })),
  }
})

export async function stubPortfolio(
  page: Page,
  options: { equityAt?: (index: number) => string } = {},
) {
  await stubReplay(page, { empty: true })
  const candleRequests: URL[] = [],
    tradeRequests: URL[] = [],
    invalidRequests: string[] = []
  await page.route(/\/api\/replays\/[^/?]+$/, (route) =>
    route.fulfill({ json: envelope(portfolioDetail) }),
  )
  await page.route(/\/api\/replays\/[^/?]+\/candles(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url()),
      query = url.searchParams,
      role = query.get('instrument') as PortfolioRole
    candleRequests.push(url)
    const available = periods[role]
    const timeframe = query.get('timeframe') ?? (available?.includes('1h') ? '1h' : available?.[0])
    if (!available || !timeframe || !available.includes(timeframe)) {
      invalidRequests.push(url.search)
      return route.fulfill({
        status: 400,
        json: { code: 40000, message: 'Invalid instrument or timeframe' },
      })
    }
    const rows = portfolioCandles(role, timeframe)
      .map((c) =>
        options.equityAt && c.state
          ? { ...c, state: { ...c.state, equity: options.equityAt(c.sequence - 1) } }
          : c,
      )
      .filter(
        (c) =>
          (!query.get('from') || Date.parse(c.time) >= Date.parse(query.get('from')!)) &&
          (!query.get('to') || Date.parse(c.close_time) <= Date.parse(query.get('to')!)),
      )
    const prefix = `${role}:${timeframe}:`,
      cursor = query.get('cursor')
    if (cursor && !cursor.startsWith(prefix)) {
      invalidRequests.push(url.search)
      return route.fulfill({
        status: 400,
        json: { code: 40000, message: 'Cursor belongs to another feed' },
      })
    }
    const offset = cursor ? Number(cursor.slice(prefix.length)) : 0,
      items = rows.slice(offset, offset + Math.min(Number(query.get('limit') ?? 2000), 73)),
      more = offset + items.length < rows.length
    return route.fulfill({
      json: envelope({
        instrument: role,
        instrument_id: portfolioInstruments[role].instrument_id,
        timeframe,
        execution_timeframe: '1h',
        available_timeframes: available,
        items,
        has_more: more,
        next_cursor: more ? `${prefix}${offset + items.length}` : null,
      }),
    })
  })
  await page.route(/\/api\/replays\/[^/?]+\/trades(?:\?.*)?$/, (route) => {
    const url = new URL(route.request().url()),
      current = Number(url.searchParams.get('page') ?? 1)
    tradeRequests.push(url)
    return route.fulfill({
      json: envelope({
        items: portfolioTrades.slice((current - 1) * 2, current * 2),
        page: current,
        size: 2,
        total: 3,
        total_pages: 2,
      }),
    })
  })
  return { candleRequests, tradeRequests, invalidRequests }
}
