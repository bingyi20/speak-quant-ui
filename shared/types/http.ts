export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
  request_id: string
  error?: { key: string; fields?: Record<string, unknown> }
}
export interface Page<T> {
  items: T[]
  page: number
  size: number
  total: number
  total_pages: number
}
export type Locale = 'zh-CN' | 'en-US'
export type ThemePreference = 'light' | 'dark' | 'system'
