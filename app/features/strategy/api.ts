import type { HttpClient } from '~/lib/http/client'
import type { CurrentStrategy, StrategyHistory, StrategyNode } from './types'

export const createStrategyApi = (http: HttpClient) => ({
  current: (conversationId: string, signal?: AbortSignal) =>
    http.requestJson<CurrentStrategy>(
      `/conversations/${encodeURIComponent(conversationId)}/strategy`,
      { signal },
    ),
  history: (id: string, page = 1, signal?: AbortSignal) =>
    http.requestJson<StrategyHistory>(`/strategies/${encodeURIComponent(id)}/history`, {
      query: { page, size: 100 },
      signal,
    }),
  node: (id: string, signal?: AbortSignal) =>
    http.requestJson<StrategyNode>(`/strategy-nodes/${encodeURIComponent(id)}`, { signal }),
})
export type StrategyApi = ReturnType<typeof createStrategyApi>
