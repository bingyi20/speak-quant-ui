export interface ConversationSummary {
  id: string
  title: string
  status: string
  is_favorite: boolean
  last_message_at: string | null
  created_at: string
  updated_at: string
}
export interface CreateConversationResponse {
  id: string
  title: string
}
export type ConversationScope = 'all' | 'favorite' | 'non_favorite'
export interface ConversationListQuery {
  scope?: ConversationScope
  page?: number
  size?: number
}
export interface ConversationUpdate {
  title?: string
  is_favorite?: boolean
}
export interface DeleteConversationResponse {
  deleted: boolean
  conversation_id: string
}

export type RunStatus = 'queued' | 'running' | 'waiting_user' | 'completed' | 'failed' | 'cancelled'
export interface AgentRun {
  id: string
  status: RunStatus
  stream_url: string
}
export interface AgentRunDetail extends AgentRun {
  conversation_id: string
  error: { key: string; message: string } | null
  started_at: string | null
  finished_at: string | null
}
export interface MessageCard {
  id: string
  type: string
  status: string
  resource_id: string | null
  title: string
  summary: string | null
  data: Record<string, unknown> | null
}
export interface SnapshotMessage {
  id: string
  role: string
  status: string
  content: string
  cards: MessageCard[]
}
export interface ConversationMessage extends SnapshotMessage {
  conversation_id: string
  agent_run_id?: string | null
  sequence: number
  created_at: string
  updated_at?: string
}
export interface MessagePage {
  items: ConversationMessage[]
  has_more: boolean
  next_before_sequence: number | null
  active_run: AgentRun | null
}
export type StructuredAnswer =
  | { question_id: string; value: string; custom_text?: never }
  | { question_id: string; custom_text: string; value?: never }
export interface MessageSubmission {
  content?: string
  reply_to_message_id?: string
  structured_answers?: StructuredAnswer[]
}
export interface SendMessageResponse {
  user_message: ConversationMessage
  updated_messages: ConversationMessage[]
  agent_run: AgentRun
}
export interface ClarificationQuestion {
  id: string
  question: string
  required: boolean
  options: string[]
  allow_custom: boolean
}
export interface ClarificationData {
  questions: ClarificationQuestion[]
  answered: boolean
  answers: StructuredAnswer[]
}
export interface ToolStatus {
  message_id: string
  id: string
  label: string
  status: 'running' | 'completed' | 'failed'
}
export interface StrategySummary {
  id: string
  name: string
  status: string
  status_label: string
  revision: number
  replay_count: number
  updated_at: string
}
export type { ReplaySummary } from '~/features/replay'
export interface ConversationAssets {
  strategy: StrategySummary | null
  replays: import('#shared/types/http').Page<import('~/features/replay').ReplaySummary>
}
export interface DisplayMessage extends SnapshotMessage {
  created_at?: string
  fromSnapshot?: boolean
  localFailure?: boolean
  localPending?: boolean
}
