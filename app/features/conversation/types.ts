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
