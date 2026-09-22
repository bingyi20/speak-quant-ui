export default defineEventHandler((event) => {
  const sitemap = new URL('/sitemap.xml', useRuntimeConfig(event).public.siteUrl).href
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  // Private pages also send noindex headers; public draft pages must be crawlable to see noindex.
  return `User-agent: *\nDisallow: /api/\n\nSitemap: ${sitemap}\n`
})
