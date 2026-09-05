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
