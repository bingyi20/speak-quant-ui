import type { HttpClient } from '~/lib/http/client'
import { openEventStream } from '~/lib/sse/connection'
import type { Page } from '#shared/types/http'
import type {
  ConversationSummary,
  CreateConversationResponse,
  ConversationListQuery,
  ConversationUpdate,
  DeleteConversationResponse,
  MessagePage,
  MessageSubmission,
  SendMessageResponse,
  AgentRunDetail,
  ConversationAssets,
} from './types'
export const createConversationApi = (http: HttpClient) => ({
  messages: (id: string, before?: number, signal?: AbortSignal) =>
    http.requestJson<MessagePage>(`/conversations/${encodeURIComponent(id)}/messages`, {
      query: { limit: 50, ...(before === undefined ? {} : { before_sequence: before }) },
      signal,
    }),
  send: (id: string, body: MessageSubmission, key?: string) =>
    http.operation<SendMessageResponse>(
      `/conversations/${encodeURIComponent(id)}/messages`,
      {
        method: 'POST',
        body,
      },
      key,
    ),
  assets: (id: string, page = 1, signal?: AbortSignal) =>
    http.requestJson<ConversationAssets>(`/conversations/${encodeURIComponent(id)}/assets`, {
      query: { page, size: 20 },
      signal,
    }),
  run: (id: string, signal?: AbortSignal) =>
    http.requestJson<AgentRunDetail>(`/agent-runs/${encodeURIComponent(id)}`, { signal }),
  stream: (url: string, options: Parameters<typeof openEventStream>[2]) =>
    openEventStream(http, url, { ...options, maxRetries: 0 }),
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
