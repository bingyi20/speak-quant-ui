import { localizedPublicPath, publicLocale } from '#shared/public-site'

export function usePageSeo(
  title: string | (() => string),
  description: string | (() => string),
  indexable = false,
) {
  const config = useRuntimeConfig()
  const route = useRoute()
  const { locale } = useI18n()
  const absolute = (path: string) => new URL(path, config.public.siteUrl).href
  const canonical = computed(() => absolute(route.path.replace(/\/$/, '') || '/'))
  useSeoMeta({
    title,
    description,
    ogTitle: title,
    ogDescription: description,
    ogType: 'website',
    ogSiteName: 'Trade Lab',
    ogUrl: () => canonical.value,
    ogLocale: () => locale.value.replace('-', '_'),
    ogImage: () => absolute('/social-card.png'),
    ogImageWidth: 1200,
    ogImageHeight: 630,
    ogImageAlt: 'Trade Lab — Test your trading idea in 3 minutes.',
    twitterCard: 'summary_large_image',
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: () => absolute('/social-card.png'),
    robots: indexable ? 'index, follow' : 'noindex, nofollow',
  })
  useHead(() => ({
    link: publicLocale(route.path)
      ? [
          { rel: 'canonical', href: canonical.value },
          ...(['en-US', 'zh-CN'] as const).map((language) => ({
            rel: 'alternate' as const,
            hreflang: language,
            href: absolute(localizedPublicPath(route.path, language)),
          })),
          {
            rel: 'alternate' as const,
            hreflang: 'x-default',
            href: absolute(localizedPublicPath(route.path, 'en-US')),
          },
        ]
      : [],
  }))
}
