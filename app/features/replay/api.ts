import type { HttpClient } from '~/lib/http/client'
import type { ReplayDetail } from './types'

export const createReplayApi = (http: HttpClient) => ({
  detail: (id: string, signal?: AbortSignal) =>
    http.requestJson<ReplayDetail>(`/replays/${encodeURIComponent(id)}`, { signal }),
})
