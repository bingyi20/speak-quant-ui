import type { ConversationSummary } from '../../app/features/conversation/types'

// Test-only conversation fixtures; application code never imports these.
export function createMockHistory(): ConversationSummary[] {
  const titles = [
    'BTC 均线趋势策略',
    'ETH 放量突破的入场时机',
    '多周期共振：日线趋势与小时线信号',
    '布林带均值回归策略',
    '低波动行情下的网格交易',
    '动量轮动与仓位分配',
    'BTC 周末行情的量价特征',
    '止损距离对趋势策略的影响',
    'RSI 超卖后的反弹机会',
    '不同市场环境下的突破策略对比',
    '成交量过滤是否能减少假突破',
    '双均线参数的稳健性研究',
  ]
  return titles.map((title, index) => {
    const timestamp = new Date(Date.UTC(2026, 8, 5, 10 - index)).toISOString()
    return {
      id: `01K4ABCDE00000000000000${String(index + 1).padStart(3, '0')}`,
      title,
      status: 'researching',
      is_favorite: index < 3,
      last_message_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    }
  })
}
