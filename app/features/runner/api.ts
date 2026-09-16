import type { HttpClient } from '~/lib/http/client'
import { requestDownload } from '~/lib/download/client'
export interface RunnerDownloadRequest {
  strategy_node_id: string
  source_replay_id: string
  platform: 'macos' | 'windows' | 'linux'
  architecture: 'arm64' | 'x86_64'
}
export const createRunnerApi = (http: HttpClient) => ({
  download: (body: RunnerDownloadRequest, signal: AbortSignal) =>
    requestDownload(http, '/runner-packages/download', { method: 'POST', body, signal }),
})
