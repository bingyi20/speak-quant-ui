import type { Locale } from './types/http'

export const PUBLIC_PATHS = [
  '/',
  '/pricing',
  '/privacy',
  '/terms',
  '/refunds',
  '/contact',
  '/open-source',
] as const
// Legal and contact pages remain accessible without advertising them in search results.
export const INDEXABLE_PATHS = ['/', '/pricing', '/open-source'] as const
export const LEGAL_UPDATED_AT = '2026-10-08'
export const MANUAL_LOCALE_COOKIE = 'trade-locale-manual'
export const isLocale = (value: unknown): value is Locale => value === 'en-US' || value === 'zh-CN'
export function publicBasePath(path: string) {
  return path.replace(/^\/zh-CN(?=\/|$)/, '').replace(/\/$/, '') || '/'
}
export function publicLocale(path: string): Locale | undefined {
  if (!PUBLIC_PATHS.some((entry) => entry === publicBasePath(path))) return undefined
  return /^\/zh-CN(?:\/|$)/.test(path) ? 'zh-CN' : 'en-US'
}
export function localizedPublicPath(path: string, locale: Locale) {
  const base = publicBasePath(path)
  return locale === 'zh-CN' ? `/zh-CN${base === '/' ? '' : base}` : base
}
