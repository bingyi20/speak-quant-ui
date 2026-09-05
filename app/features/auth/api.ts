import type { HttpClient } from '~/lib/http/client'
import type { AuthResponse, User } from './types'
export const createAuthApi = (http: HttpClient) => ({
  refresh: () => http.requestJson<AuthResponse>('/auth/refresh', { method: 'POST', auth: false }),
  logout: () => http.requestJson<{ logged_out: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => http.requestJson<User>('/users/me'),
})
