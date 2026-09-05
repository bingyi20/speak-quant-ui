import type { HttpClient } from '../http/client'
import { ApiError, cancellationError } from '../http/error'
import { parseSse, type SseFrame } from './parser'

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(cancellationError())
      return
    }
    const finish = () => {
      signal.removeEventListener('abort', abort)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    const abort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      reject(cancellationError())
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}
/** Reconnection always reopens the URL; the feature layer handles its new snapshot. */
export async function openEventStream(
  client: HttpClient,
  path: string,
  options: {
    signal: AbortSignal
    onEvent: (frame: SseFrame) => void
    isTerminal: (frame: SseFrame) => boolean
    onStatus?: (state: 'connecting' | 'connected' | 'reconnecting' | 'finished') => void
    maxRetries?: number
    idleTimeoutMs?: number
  },
) {
  const limit = options.maxRetries ?? 4
  for (let attempt = 0; attempt <= limit; attempt++) {
    options.onStatus?.(attempt ? 'reconnecting' : 'connecting')
    const watchdog = new AbortController()
    const signal = AbortSignal.any([options.signal, watchdog.signal])
    let timer: ReturnType<typeof setTimeout> | undefined
    const reset = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(
        () => watchdog.abort(new DOMException('Stream idle', 'TimeoutError')),
        options.idleTimeoutMs ?? 45_000,
      )
    }
    try {
      reset()
      await client.withResponse(
        path,
        { signal, timeoutMs: 0, headers: { Accept: 'text/event-stream' } },
        async (response) => {
          if (
            !response.headers.get('content-type')?.includes('text/event-stream') ||
            !response.body
          )
            throw new ApiError('Invalid SSE response', { kind: 'protocol' })
          options.onStatus?.('connected')
          const monitor = new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              reset()
              controller.enqueue(chunk)
            },
          })
          for await (const frame of parseSse(response.body.pipeThrough(monitor))) {
            options.onEvent(frame)
            if (options.isTerminal(frame)) {
              options.onStatus?.('finished')
              return
            }
          }
          throw new ApiError('Stream ended before a terminal event', { kind: 'network' })
        },
      )
      return
    } catch (error) {
      if (options.signal.aborted) throw cancellationError()
      const retryable = error instanceof ApiError && ['network', 'timeout'].includes(error.kind)
      if (!retryable || attempt === limit) throw error
    } finally {
      if (timer) clearTimeout(timer)
    }
    await delay(Math.min(1000 * 2 ** attempt, 10_000), options.signal)
  }
}
