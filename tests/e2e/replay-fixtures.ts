import type { Page } from '@playwright/test'
import type {
  ReplayDetail,
  ReplayCandle,
  ReplayTrade,
  ReplayInsight,
} from '../../app/features/replay/types'
import { envelope } from './auth-fixtures'
import { conversationId, message, replayCard, stubConversation } from './conversation-fixtures'
const start = Date.parse('2025-01-01T00:00:00Z')
export const iso = (n: number) => new Date(start + n * 3600_000).toISOString()
export function candles(count = 200): ReplayCandle[] {
  return Array.from({ length: count }, (_, i) => {
    const open = 95000 + Math.sin(i / 9) * 800 + i * 15,
      close = open + Math.sin(i) * 140
    return {
      id: `c-${i}`,
      sequence: i + 1,
      time: iso(i),
      close_time: iso(i + 1),
      open: open.toFixed(2),
      close: close.toFixed(2),
      high: (Math.max(open, close) + 150).toFixed(2),
      low: (Math.min(open, close) - 130).toFixed(2),
      volume: String(200 + (i % 90)),
      state: {
        position: i >= 20 && i < 50 ? 'long' : 'flat',
        position_quantity: i >= 20 && i < 50 ? '0.1' : '0',
        equity: String(10000 + i),
        cash: '10000',
        unrealized_pnl: '0',
        realized_pnl: String(i),
        drawdown_rate: '0',
      },
    }
  })
}
export const replayDetail: ReplayDetail = {
  id: 'replay-1',
  conversation_id: conversationId,
  strategy_id: 'strategy-1',
  name: 'BTC 均线验证',
  status: 'completed',
  result_type: 'traded',
  strategy: {
    node_id: 'node-old',
    name: 'BTC 双均线策略',
    change_summary: '增加成交量过滤',
    execution_timeframe: '1h',
    auxiliary_timeframes: ['4h'],
    direction: 'both',
  },
  conditions: {
    symbol: 'BTC/USDT',
    market_type: 'spot',
    leverage: '1',
    start_at: iso(0),
    end_at: iso(200),
    initial_capital: '10000',
  },
  result: {
    net_return_rate: '0.0199',
    max_drawdown_rate: '0',
    trade_count: 2,
    win_rate: '0.5',
    net_profit: '199',
    total_fee: '6',
    profit_factor: '2.2',
    quality_warnings: [],
  },
  playback: { default_speed: 16, available_speeds: [1, 4, 8, 16] },
  research_goal: '验证趋势信号',
  change_summary: null,
  result_summary: '趋势行情中的表现更好。',
  validated_insight: null,
  risk_and_limitation: null,
  error: null,
}
export const replayTrades: ReplayTrade[] = [
  {
    id: 't-1',
    sequence: 1,
    direction: 'long',
    status: 'closed',
    entry_candle_id: 'c-20',
    exit_candle_id: 'c-50',
    entry_at: iso(20),
    exit_at: iso(50),
    entry_price: '95200',
    exit_price: '96100',
    quantity: '0.1',
    gross_pnl: '90',
    net_pnl: '87',
    return_rate: '0.0091',
    fee: '3',
    funding_cost: '0',
    slippage_cost: '0',
    exit_reason: 'take_profit',
    holding_seconds: 108000,
    fills: [
      {
        id: 'f-1',
        sequence: 1,
        action: 'open',
        side: 'buy',
        candle_id: 'c-20',
        occurred_at: iso(20),
        price: '95200',
        quantity: '0.1',
        fee: '1.5',
        realized_pnl: '0',
        position_before: '0',
        position_after: '0.1',
        reason: 'signal',
      },
      {
        id: 'f-2',
        sequence: 2,
        action: 'close',
        side: 'sell',
        candle_id: 'c-50',
        occurred_at: iso(50),
        price: '96100',
        quantity: '0.1',
        fee: '1.5',
        realized_pnl: '87',
        position_before: '0.1',
        position_after: '0',
        reason: 'take_profit',
      },
    ],
  },
  {
    id: 't-2',
    sequence: 2,
    direction: 'short',
    status: 'closed',
    entry_candle_id: 'c-80',
    exit_candle_id: 'c-100',
    entry_at: iso(80),
    exit_at: iso(100),
    entry_price: '96300',
    exit_price: '96900',
    quantity: '0.1',
    gross_pnl: '-60',
    net_pnl: '-63',
    return_rate: '-0.0065',
    fee: '3',
    funding_cost: '0',
    slippage_cost: '0',
    exit_reason: 'stop_loss',
    holding_seconds: 72000,
    fills: [
      {
        id: 'f-3',
        sequence: 3,
        action: 'open',
        side: 'sell',
        candle_id: 'c-80',
        occurred_at: iso(80),
        price: '96300',
        quantity: '0.1',
        fee: '1.5',
        realized_pnl: '0',
        position_before: '0',
        position_after: '-0.1',
        reason: 'signal',
      },
      {
        id: 'f-4',
        sequence: 4,
        action: 'close',
        side: 'buy',
        candle_id: 'c-100',
        occurred_at: iso(100),
        price: '96900',
        quantity: '0.1',
        fee: '1.5',
        realized_pnl: '-63',
        position_before: '-0.1',
        position_after: '0',
        reason: 'stop_loss',
      },
    ],
  },
]
export const replayInsights: ReplayInsight[] = [
  {
    id: 'i-1',
    sequence: 1,
    scope: 'global',
    type: 'finding',
    candle_id: null,
    title: '趋势区间表现更好',
    content: '趋势延续时，策略获得正收益。',
    evidence: {
      trade_id: 't-1',
      entry_candle_id: 'c-20',
      exit_candle_id: 'c-50',
      summary: '第一次交易验证趋势信号',
    },
    is_validated: true,
    suggestion: null,
    tradeoff: null,
  },
  {
    id: 'i-2',
    sequence: 2,
    scope: 'runtime',
    type: 'risk',
    candle_id: 'c-100',
    title: '反向信号触发止损',
    content: '这次空头交易出现亏损。',
    evidence: { trade_ids: ['t-2'], fill_ids: ['f-4'] },
    is_validated: false,
    suggestion: '可以检查趋势过滤。',
    tradeoff: '减少逆势机会。',
  },
  {
    id: 'i-global',
    sequence: 3,
    scope: 'global',
    type: 'finding',
    candle_id: null,
    title: '总体观察',
    content: '没有可定位的单一证据。',
    evidence: null,
    is_validated: false,
    suggestion: null,
    tradeoff: null,
  },
]
export async function stubReplay(
  page: Page,
  options: { multi?: boolean; empty?: boolean; failCandles?: boolean; failSendOnce?: boolean } = {},
) {
  const { calls } = await stubConversation(page, {
    initialMessages: [message('replay-message', 1, 'assistant', '回测已完成。', [replayCard])],
    failSendOnce: options.failSendOnce,
    noQuestions: true,
  })
  const requested: string[] = []
  let failed = false
  await page.route(/\/api\/replays\/[^/?]+$/, (route) =>
    route.fulfill({
      json: envelope({
        ...replayDetail,
        ...(options.empty
          ? {
              result_type: 'no_trades',
              result: {
                ...replayDetail.result,
                trade_count: 0,
                win_rate: null,
                profit_factor: null,
              },
            }
          : {}),
      }),
    }),
  )
  await page.route(/\/api\/replays\/[^/?]+\/candles(?:\?.*)?$/, (route) => {
    const query = new URL(route.request().url()).searchParams,
      timeframe = query.get('timeframe') ?? '1h'
    requested.push(route.request().url())
    if (options.failCandles && !query.has('from') && !failed) {
      failed = true
      return route.fulfill({ status: 500, json: { detail: 'failed' } })
    }
    const items = candles().filter(
      (c, i) =>
        (timeframe === '1h' || i % 4 === 0) &&
        (!query.get('from') || Date.parse(c.time) >= Date.parse(query.get('from')!)) &&
        (!query.get('to') || Date.parse(c.time) < Date.parse(query.get('to')!)),
    )
    return route.fulfill({
      json: envelope({
        timeframe,
        ...(options.multi ? { execution_timeframe: '1h', available_timeframes: ['1h', '4h'] } : {}),
        items:
          timeframe === '1h'
            ? items
            : items.map((c) => ({ ...c, close_time: iso(c.sequence - 1 + 4), state: null })),
        has_more: false,
        next_cursor: null,
      }),
    })
  })
  await page.route(/\/api\/replays\/[^/?]+\/trades(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({
        items: options.empty ? [] : replayTrades,
        page: 1,
        size: 100,
        total: options.empty ? 0 : 2,
        total_pages: 1,
      }),
    }),
  )
  await page.route(/\/api\/replays\/[^/?]+\/insights$/, (route) =>
    route.fulfill({ json: envelope({ items: options.empty ? [] : replayInsights }) }),
  )
  await page.route(/\/api\/replays\/[^/?]+\/report$/, (route) =>
    route.fulfill({
      json: envelope({
        format: 'markdown',
        content: '# 回测研究报告\n\n净收益为 199 USDT。',
        generated_at: iso(200),
      }),
    }),
  )
  await page.route(/\/api\/conversations\/[^/?]+\/replays(?:\?.*)?$/, (route) =>
    route.fulfill({ json: envelope({ items: [], page: 1, total_pages: 1, total: 0, size: 20 }) }),
  )
  return { calls, requested }
}
