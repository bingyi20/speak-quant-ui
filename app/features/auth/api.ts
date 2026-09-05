import type { HttpClient } from '~/lib/http/client'
import type { AuthResponse, EmailChallenge, GoogleConfig, GoogleLoginRequest, User } from './types'
export const createAuthApi = (http: HttpClient) => ({
  sendEmailCode: (email: string, signal?: AbortSignal) =>
    http.requestJson<EmailChallenge>('/auth/email/code', {
      method: 'POST',
      auth: false,
      body: { email },
      signal,
    }),
  verifyEmail: (verification_id: string, code: string, signal?: AbortSignal) =>
    http.requestJson<AuthResponse>('/auth/email/verify', {
      method: 'POST',
      auth: false,
      body: { verification_id, code },
      signal,
    }),
  googleConfig: (signal?: AbortSignal) =>
    http.requestJson<GoogleConfig>('/auth/google/config', { auth: false, signal }),
  googleLogin: (body: GoogleLoginRequest, signal?: AbortSignal) =>
    http.requestJson<AuthResponse>('/auth/google', { method: 'POST', auth: false, body, signal }),
  refresh: () => http.requestJson<AuthResponse>('/auth/refresh', { method: 'POST', auth: false }),
  logout: () => http.requestJson<{ logged_out: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => http.requestJson<User>('/users/me'),
})
