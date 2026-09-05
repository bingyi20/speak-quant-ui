import { ApiError } from './error'
export function resolveApiUrl(base: string, path: string, origin?: string): string {
  if (path.startsWith('//') || path.includes('\\'))
    throw new ApiError('Untrusted API path', { kind: 'protocol' })
  const root = new URL(base.endsWith('/') ? base : `${base}/`, origin)
  const prefixed =
    path.startsWith(root.pathname.replace(/\/$/, '') + '/') ||
    path === root.pathname.replace(/\/$/, '')
  const url = new URL(prefixed ? path : path.replace(/^\//, ''), root)
  if (
    url.origin !== root.origin ||
    !url.pathname.startsWith(root.pathname) ||
    url.username ||
    url.password
  ) {
    throw new ApiError('Untrusted API path', { kind: 'protocol' })
  }
  return url.href
}
