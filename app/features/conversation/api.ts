import type { HttpClient } from '~/lib/http/client'
import type { Page } from '#shared/types/http'
import type {
  ConversationSummary,
  CreateConversationResponse,
  ConversationListQuery,
  ConversationUpdate,
  DeleteConversationResponse,
} from './types'
export const createConversationApi = (http: HttpClient) => ({
  list: (query: ConversationListQuery = {}, signal?: AbortSignal) =>
    http.requestJson<Page<ConversationSummary>>('/conversations', {
      query: { scope: 'all', page: 1, size: 20, ...query },
      signal,
    }),
  detail: (id: string, signal?: AbortSignal) =>
    http.requestJson<{ conversation: ConversationSummary }>(
      `/conversations/${encodeURIComponent(id)}`,
      { signal },
    ),
  update: (id: string, body: ConversationUpdate, signal?: AbortSignal) =>
    http.requestJson<ConversationSummary>(`/conversations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body,
      signal,
    }),
  remove: (id: string) =>
    http.operation<DeleteConversationResponse>(`/conversations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'X-Confirm-Delete': 'permanent' },
    }),
  create: (content: string, key?: string) =>
    http.operation<CreateConversationResponse>(
      '/conversations',
      { method: 'POST', body: { content } },
      key,
    ),
})

export type ConversationApi = ReturnType<typeof createConversationApi>
