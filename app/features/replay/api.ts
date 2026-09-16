import type { HttpClient } from '~/lib/http/client'
import type { Page } from '#shared/types/http'
import type {
  CandleQuery,
  ReplayCandlePage,
  ReplayDetail,
  ReplayInsight,
  ReplayListPage,
  ReplayReport,
  ReplayTrade,
} from './types'

export const createReplayApi = (http: HttpClient) => ({
  detail: (id: string, signal?: AbortSignal) =>
    http.requestJson<ReplayDetail>(`/replays/${encodeURIComponent(id)}`, { signal }),
  list: (id: string, page = 1, signal?: AbortSignal) =>
    http.requestJson<ReplayListPage>(`/conversations/${encodeURIComponent(id)}/replays`, {
      query: { page, size: 20 },
      signal,
    }),
  candles: (id: string, query: CandleQuery = {}, signal?: AbortSignal) =>
    http.requestJson<ReplayCandlePage>(`/replays/${encodeURIComponent(id)}/candles`, {
      query: { limit: 2000, ...query },
      signal,
    }),
  trades: (id: string, page = 1, signal?: AbortSignal) =>
    http.requestJson<Page<ReplayTrade>>(`/replays/${encodeURIComponent(id)}/trades`, {
      query: { page, size: 100 },
      signal,
    }),
  insights: (id: string, signal?: AbortSignal) =>
    http.requestJson<{ items: ReplayInsight[] }>(`/replays/${encodeURIComponent(id)}/insights`, {
      signal,
    }),
  report: (id: string, signal?: AbortSignal) =>
    http.requestJson<ReplayReport>(`/replays/${encodeURIComponent(id)}/report`, { signal }),
})
export type ReplayApi = ReturnType<typeof createReplayApi>
