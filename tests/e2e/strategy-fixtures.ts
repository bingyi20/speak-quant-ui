import type { Page } from '@playwright/test'
import { envelope } from './auth-fixtures'
import type { CurrentStrategy, StrategyNode } from '../../app/features/strategy/types'
import type { ReplaySummary } from '../../app/features/replay/types'

export const replay = (id: string, node: string, name = id): ReplaySummary => ({
  id,
  strategy_node_id: node,
  name,
  result_type: 'traded',
  symbol: 'BTC/USDT',
  market_type: 'spot',
  contract_type: null,
  execution_timeframe: '1h',
  auxiliary_timeframes: [],
  start_at: '2025-01-01T00:00:00Z',
  end_at: '2025-12-31T23:00:00Z',
  net_return_rate: '0.186',
  max_drawdown_rate: '0.082',
  trade_count: 126,
  quality_status: 'normal',
  created_at: '2026-09-15T10:00:00Z',
})
export const currentStrategy: CurrentStrategy = {
  id: 'strategy-1',
  conversation_id: '01K4ABCDE00000000000000001',
  name: 'BTC 双均线策略',
  change_summary: '止损从 2% 调整为 3%',
  status: 'tested',
  revision: 3,
  current_node_id: 'node-current',
  updated_at: '2026-09-15T10:00:00Z',
  design: {
    format: 'markdown',
    content: '# 当前设计\n\n使用双均线交叉入场。\n\n## 止损\n\n止损为 3%。',
  },
  code: {
    language: 'python',
    content: '# Current strategy\nstop_pct = 0.03\nprint("<script>alert(1)</script>")',
  },
  replays: [
    replay('replay-1', 'node-current', 'BTC 均线验证'),
    replay('replay-old', 'node-old', '历史区间验证'),
  ],
}
export const historyNode: StrategyNode = {
  id: 'node-old',
  strategy_id: 'strategy-1',
  name: '双均线策略',
  change_summary: '增加成交量过滤',
  formed_at: '2026-09-14T10:00:00Z',
  design: { format: 'markdown', content: '# 历史设计\n\n加入成交量过滤。' },
  code: { language: 'python', content: '# Frozen code\nvolume_filter = True\nstop_pct = 0.02' },
  replays: [replay('replay-old', 'node-old', '历史区间验证')],
}
export async function stubStrategyDetails(
  page: Page,
  current = currentStrategy,
  nodes = [historyNode],
) {
  await page.route(/\/api\/conversations\/[^/?]+\/strategy$/, (route) =>
    route.fulfill({ json: envelope(current) }),
  )
  await page.route(/\/api\/strategies\/[^/?]+\/history(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({
        current: { id: current.id, name: current.name },
        items: nodes.map((n) => ({
          id: n.id,
          name: n.name,
          change_summary: n.change_summary,
          formed_at: n.formed_at,
          replay_count: n.replays.length,
        })),
        page: 1,
        size: 100,
        total: nodes.length,
        total_pages: 1,
      }),
    }),
  )
  await page.route(/\/api\/strategy-nodes\/[^/?]+$/, (route) => {
    const node = nodes.find((n) => route.request().url().endsWith(n.id))
    return route.fulfill({ status: node ? 200 : 404, json: envelope(node) })
  })
  await page.route(/\/api\/replays\/[^/?]+$/, (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!
    const summary =
      current.replays.find((r) => r.id === id) ?? replay(id, 'node-current', 'BTC 均线验证')
    return route.fulfill({
      json: envelope({
        id,
        name: summary.name,
        status: 'completed',
        result_type: summary.result_type,
        strategy: {
          node_id: summary.strategy_node_id,
          name: current.name,
          execution_timeframe: '1h',
        },
        conditions: {
          symbol: 'BTC/USDT',
          start_at: summary.start_at,
          end_at: summary.end_at,
          initial_capital: '10000',
        },
        result: { ...summary, win_rate: '0.6', net_profit: '1860', total_fee: '120' },
        result_summary: '趋势行情中的表现更好。',
        research_goal: null,
        change_summary: null,
        validated_insight: null,
        risk_and_limitation: null,
        error: null,
      }),
    })
  })
}
