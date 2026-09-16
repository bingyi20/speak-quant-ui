import type { Page } from '#shared/types/http'
import type { ReplaySummary } from '~/features/replay'

export interface StrategyContent {
  name: string
  change_summary?: string | null
  change_base_node_id?: string | null
  design: { format: 'markdown'; content: string }
  code: { language: string; content: string } | null
  replays: ReplaySummary[]
}
export interface CurrentStrategy extends StrategyContent {
  id: string
  conversation_id: string
  status: 'draft' | 'tested' | 'modified' | 'restored' | 'running'
  revision: number
  current_node_id: string | null
  updated_at: string
}
export interface StrategyVersion {
  id: string
  name: string
  change_summary?: string | null
  change_base_node_id?: string | null
  formed_at: string
  replay_count: number
}
export interface StrategyNode extends StrategyContent {
  id: string
  strategy_id: string
  formed_at: string
}
export type StrategyHistory = Page<StrategyVersion>
export type StrategyTab = 'design' | 'replays' | 'code'
