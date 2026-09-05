export interface ConversationSummary {
  id: string
  title: string
  status: string
  is_favorite: boolean
  last_message_at: string
  created_at: string
  updated_at: string
}
export interface CreateConversationResponse {
  id: string
  title: string
}
