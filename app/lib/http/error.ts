export type ErrorKind =
  'http' | 'business' | 'network' | 'timeout' | 'cancelled' | 'protocol' | 'auth'
export class ApiError extends Error {
  readonly status?: number
  readonly code?: number
  readonly key?: string
  readonly fields?: Record<string, unknown>
  readonly data?: unknown
  readonly requestId?: string
  readonly kind: ErrorKind
  constructor(
    message: string,
    details: {
      status?: number
      code?: number
      key?: string
      fields?: Record<string, unknown>
      data?: unknown
      requestId?: string
      kind: ErrorKind
    },
  ) {
    super(message)
    this.name = 'ApiError'
    Object.assign(this, details)
    this.kind = details.kind
  }
}
export function responseError(status: number, value: unknown, requestId?: string): ApiError {
  const body = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const error =
    body.error && typeof body.error === 'object' ? (body.error as Record<string, unknown>) : {}
  return new ApiError(typeof body.message === 'string' ? body.message : 'Request failed', {
    status,
    code: typeof body.code === 'number' ? body.code : undefined,
    key: typeof error.key === 'string' ? error.key : undefined,
    fields: error.fields as Record<string, unknown> | undefined,
    data: body.data,
    requestId: typeof body.request_id === 'string' ? body.request_id : requestId,
    kind: status === 401 ? 'auth' : status >= 400 ? 'http' : 'business',
  })
}
export function cancellationError(): ApiError {
  return new ApiError('Request cancelled', { kind: 'cancelled' })
}
export function normalizeError(error: unknown, signal?: AbortSignal): ApiError {
  if (error instanceof ApiError && error.kind === 'auth') return error
  if (signal?.aborted)
    return signal.reason?.name === 'TimeoutError'
      ? new ApiError('Request timed out', { kind: 'timeout' })
      : cancellationError()
  if (error instanceof ApiError) return error
  return new ApiError('Unable to reach the server', { kind: 'network' })
}
