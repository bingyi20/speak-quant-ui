import type { Page } from '#shared/types/http'

export interface ReplayInstrumentBinding {
  instrument_id?: string
  symbol: string
  market_type?: string
  contract_type?: string | null
  tradable?: boolean
  leverage?: string | null
}
export interface ReplayInstrumentSnapshot extends ReplayInstrumentBinding {
  id?: string
  instrument_role?: string
  required_feeds?: string[]
}
export interface ReplayInstrument extends ReplayInstrumentBinding {
  role: string
  timeframes: string[]
}
export interface ReplayInstrumentIdentity {
  instrument_id?: string | null
  instrument_role?: string | null
  symbol?: string | null
  market_type?: string | null
  contract_type?: string | null
  batch_id?: string | null
  group_id?: string | null
}
export interface ReplaySummary {
  id: string
  name: string
  result_type: string
  strategy_node_id: string
  symbol: string | null
  market_type: string | null
  contract_type: string | null
  instruments?: Record<string, ReplayInstrumentBinding>
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
export interface ReplayResult {
  net_return_rate: string | null
  max_drawdown_rate: string | null
  trade_count: number
  win_rate: string | null
  net_profit: string | null
  total_fee: string | null
  profit_factor?: string | null
  /** Frozen full-run annualized ratio, independent of playback and chart selection. */
  sharpe_ratio?: string | null
  sharpe?: ReplaySharpe | null
  payoff_ratio?: string | null
  gross_return_rate?: string | null
  initial_capital?: string | null
  win_count?: number
  loss_count?: number
  flat_count?: number
  total_funding_cost?: string | null
  total_slippage_cost?: string | null
  liquidation_count?: number
  long_metrics?: Record<string, string | number | null> | null
  short_metrics?: Record<string, string | number | null> | null
  quality_status?: string
  quality_warnings?: Array<string | { key?: string; message?: string; label?: string }>
}
export interface ReplaySharpe {
  ratio: string | null
  method: string | null
  sampling_timeframe: string | null
  annualization_factor: string | null
  risk_free_rate: string | null
  sample_count: number | null
  unavailable_reason:
    | 'insufficient_samples'
    | 'zero_volatility'
    | 'non_positive_equity'
    | 'invalid_equity'
    | 'unsupported_timeframe'
    | 'not_calculated'
    | null
}
export interface ReplayDetail {
  id: string
  conversation_id?: string
  strategy_id?: string
  name: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  result_type: string | null
  strategy: {
    node_id: string | null
    name: string
    execution_timeframe: string
    auxiliary_timeframes?: string[]
    direction?: string
    summary?: string | null
    change_summary?: string | null
  }
  runtime_contract?: { api_version: number; [key: string]: unknown }
  instrument_snapshots?: Record<string, ReplayInstrumentSnapshot>
  instruments?: Record<string, ReplayInstrumentBinding>
  conditions: {
    symbol?: string
    market_type?: string
    contract_type?: string | null
    leverage?: string | null
    start_at: string
    end_at: string
    initial_capital: string
    instruments?: Record<string, ReplayInstrumentBinding>
    execution_timeframe?: string
    timeframe_bindings?: Record<string, string | Record<string, string>>
    signal_levels?: Record<string, string>
  }
  execution_assumptions?: {
    capital_currency: string
    position_sizing: { type: string; value: string | null }
    commission_rate: string
    slippage_rate: string
    data: {
      source: string
      available_start_at: string | null
      available_end_at: string | null
      delay_seconds: number | null
    }
    assumptions: Array<{ key: string; label: string; value: string }>
  }
  result: ReplayResult | null
  playback?: { default_speed: number; available_speeds: number[] } | null
  counts?: {
    trades: number
    insights: number
    candles: number
    execution_steps?: number
    candles_by_instrument?: Record<string, number>
  }
  data_range?: {
    start_at: string | null
    end_at: string | null
    latest_data_at: string | null
    delay_seconds: number | null
    historical_only: boolean
  }
  created_at?: string
  research_goal: string | null
  change_summary: string | null
  result_summary: string | null
  validated_insight: string | null
  risk_and_limitation: string | null
  error: { key: string; message: string } | null
}
export interface ReplayCandleState {
  position: string | null
  position_quantity?: string | null
  position_average_price?: string | null
  equity: string | null
  cash?: string | null
  cumulative_return_rate?: string | null
  unrealized_pnl?: string | null
  realized_pnl?: string | null
  drawdown_rate?: string | null
  rules?: Record<string, unknown>
}
export interface ReplayCandle {
  id: string
  sequence: number
  time: string
  close_time?: string
  open: string
  high: string
  low: string
  close: string
  volume: string
  state: ReplayCandleState | null
}
/** Equity is sampled at closeTime; chart anchors use the producing candle's open time. */
export interface ReplayEquityPoint {
  candleId: string | null
  time: number
  closeTime: number
  equity: string
}
export interface ReplayDrawdownRange {
  from: number
  to: number
  peak: ReplayEquityPoint
  trough: ReplayEquityPoint
  rate: string
}
export interface ReplayEquityHistory {
  peak: ReplayEquityPoint
  currentDrawdown: string
  maximumDrawdown: string
  range: ReplayDrawdownRange | null
}
export interface ReplayCandlePage {
  instrument?: string
  instrument_id?: string
  timeframe: string
  execution_timeframe?: string
  available_timeframes?: string[]
  items: ReplayCandle[]
  has_more: boolean
  next_cursor: string | null
}
export interface CandleQuery {
  instrument?: string
  cursor?: string
  limit?: number
  from?: string
  to?: string
  timeframe?: string
}
/** Independent frozen account samples; time is the equity-effective close, including milliseconds. */
export interface ReplayEquityCurvePoint {
  sequence: number
  time: string
  open_time: string | null
  equity: string
  net_return_rate: string
  drawdown_rate: string
  is_initial: boolean
}
export interface ReplayEquityCurve {
  capital_currency: string
  execution_timeframe: string
  initial_capital: string
  start_at: string
  end_at: string
  items: ReplayEquityCurvePoint[]
}
export interface ReplayEquityCurvePage extends ReplayEquityCurve {
  has_more: boolean
  next_cursor: string | null
}
export interface EquityCurveQuery {
  cursor?: string
  limit?: number
  from?: string
  to?: string
}
/** Numeric drawing projection. Raw Decimal values and state stay in bounded page storage. */
export interface ReplayBar {
  id: string
  time: number
  closeTime?: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}
export interface ReplayFill extends ReplayInstrumentIdentity {
  id: string
  sequence: number
  action: string
  side: string
  candle_id: string
  occurred_at: string
  price: string
  quantity: string
  fee: string | null
  realized_pnl: string | null
  position_before: string | null
  position_after: string | null
  reason: string | null
}
export interface ReplayTrade extends ReplayInstrumentIdentity {
  id: string
  sequence: number
  direction: string
  status: string
  entry_candle_id: string
  exit_candle_id: string | null
  entry_at: string
  exit_at: string | null
  entry_price: string
  exit_price: string | null
  quantity: string
  gross_pnl: string | null
  net_pnl: string | null
  return_rate: string | null
  fee: string | null
  funding_cost: string | null
  slippage_cost: string | null
  exit_reason: string | null
  holding_seconds: number | null
  fills: ReplayFill[]
}
export type ReplayTradeView = Omit<ReplayTrade, 'entry_price' | 'quantity'> & {
  entry_price: string | null
  quantity: string | null
  isComplete: boolean
}
export interface ReplayEvidence {
  summary?: string
  trade_id?: string
  trade_ids?: string[]
  fill_ids?: string[]
  entry_candle_id?: string
  exit_candle_id?: string
  start_at?: string
  end_at?: string
  [key: string]: unknown
}
export interface ReplayInsight {
  id: string
  sequence: number
  scope: 'runtime' | 'global'
  type: string
  candle_id: string | null
  title: string
  content: string
  evidence: ReplayEvidence | null
  is_validated: boolean
  suggestion: string | null
  tradeoff: string | null
}
export interface ReplayReport {
  format: string
  content: string
  generated_at: string
}
export type ReplayListPage = Page<ReplaySummary>
export interface ReplaySelection {
  instrumentRole?: string
  time?: number
  candleId?: string
  /** Only explicit trade/fill navigation sets these IDs; insight references stay in evidence. */
  tradeId?: string
  fillId?: string
  insightId?: string
  range?: { from: number; to: number }
  drawdown?: ReplayDrawdownRange
}
export interface ReplayMessageContext {
  replay_id: string
  trade_id?: string
  fill_id?: string
  insight_id?: string
  timestamp?: string
}
export interface ReplayQuestionReference {
  context: ReplayMessageContext
  label: string
}
export interface ReplayInstrumentView {
  timeframe: string
  range: { from: number; to: number } | null
  follow: boolean
  seekRevision?: number
}
export interface ReplayViewSnapshot {
  chartView?: 'candles' | 'equity'
  instrumentViews?: Record<string, ReplayInstrumentView>
  instrument?: string
  index: number
  speed: number
  timeframe: string
  range: { from: number; to: number } | null
  selection: ReplaySelection | null
  expanded: boolean
  scrollTop: number
}
export interface ReplayEvent {
  id: string
  index: number
  time: number
  kind: 'fill' | 'insight' | 'best' | 'worst' | 'drawdown'
  sequence: number
  selection: ReplaySelection
  fill?: ReplayFill
  trade?: ReplayTrade
  insight?: ReplayInsight
}
