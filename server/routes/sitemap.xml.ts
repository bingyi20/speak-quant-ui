import { INDEXABLE_PATHS, localizedPublicPath } from '#shared/public-site'

export default defineEventHandler((event) => {
  const siteUrl = useRuntimeConfig(event).public.siteUrl
  const escape = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  const url = (path: string) => escape(new URL(path, siteUrl).href)
  const locales = ['en-US', 'zh-CN'] as const
  const entries = INDEXABLE_PATHS.flatMap((path) =>
    locales.map((locale) => {
      const alternates = locales
        .map(
          (language) =>
            `<xhtml:link rel="alternate" hreflang="${language}" href="${url(localizedPublicPath(path, language))}"/>`,
        )
        .join('')
      return `<url><loc>${url(localizedPublicPath(path, locale))}</loc>${alternates}<xhtml:link rel="alternate" hreflang="x-default" href="${url(path)}"/></url>`
    }),
  )
  setHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries.join('')}</urlset>`
})
