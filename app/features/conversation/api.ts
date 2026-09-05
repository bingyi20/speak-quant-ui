import type { HttpClient } from '~/lib/http/client'
import type { Page } from '#shared/types/http'
import type { ConversationSummary, CreateConversationResponse } from './types'
export const createConversationApi = (http: HttpClient) => ({
  list: (page = 1, signal?: AbortSignal) =>
    http.requestJson<Page<ConversationSummary>>('/conversations', {
      query: { page, size: 20 },
      signal,
    }),
  create: (content: string, key?: string) =>
    http.operation<CreateConversationResponse>(
      '/conversations',
      { method: 'POST', body: { content } },
      key,
    ),
})
