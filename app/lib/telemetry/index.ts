export interface TelemetryEvent {
  name: 'http_failure' | 'stream_failure' | 'auth_restored'
  routeTemplate?: string
  status?: number
  code?: number
  requestId?: string
  durationMs?: number
}
/** An explicit allowlist: no body, headers, token, user information or raw URLs. */
export function createTelemetry(sink: (event: TelemetryEvent) => void = () => {}) {
  return (event: TelemetryEvent) =>
    sink({
      name: event.name,
      routeTemplate: event.routeTemplate,
      status: event.status,
      code: event.code,
      requestId: event.requestId,
      durationMs: event.durationMs,
    })
}
