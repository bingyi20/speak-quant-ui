export interface ReplaySummary {
  id: string
  name: string
  result_type: string
  strategy_node_id: string
  symbol: string
  market_type: string
  contract_type: string | null
  execution_timeframe: string
  auxiliary_timeframes: string[]
  start_at: string
  end_at: string
  net_return_rate: string | null
  max_drawdown_rate: string | null
  trade_count: number
  quality_status: string
  created_at: string
}
export interface ReplayDetail {
  id: string
  name: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  result_type: string | null
  strategy: { node_id: string | null; name: string; execution_timeframe: string }
  conditions: {
    symbol: string
    start_at: string
    end_at: string
    initial_capital: string
  }
  result: {
    net_return_rate: string | null
    max_drawdown_rate: string | null
    trade_count: number
    win_rate: string | null
    net_profit: string | null
    total_fee: string | null
  } | null
  research_goal: string | null
  change_summary: string | null
  result_summary: string | null
  validated_insight: string | null
  risk_and_limitation: string | null
  error: { key: string; message: string } | null
}
