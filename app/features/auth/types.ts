import type { Locale } from '#shared/types/http'
export interface User {
  id: string
  email: string
  display_name: string
  avatar_url: string | null
  locale: Locale
  timezone: string
  created_at: string
}
export interface AuthResponse {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  user: User
}
export interface EmailChallenge {
  verification_id: string
  expires_in: number
  resend_after: number
}
export interface GoogleConfig {
  client_id: string
  nonce: string
}
export interface GoogleLoginRequest {
  credential: string
  verification_id?: string
  code?: string
}
