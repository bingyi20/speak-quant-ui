export function usePageSeo(
  title: string | (() => string),
  description: string | (() => string),
  indexable = false,
) {
  const config = useRuntimeConfig()
  const route = useRoute()
  useSeoMeta({
    title,
    description,
    ogTitle: title,
    ogDescription: description,
    ogType: 'website',
    robots: indexable ? 'index, follow' : 'noindex, nofollow',
  })
  if (indexable)
    useHead({
      link: [{ rel: 'canonical', href: () => new URL(route.path, config.public.siteUrl).href }],
    })
}
