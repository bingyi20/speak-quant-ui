<script setup lang="ts">
const props = defineProps<{ document: 'privacy' | 'terms' }>()
const { t, tm, rt } = useI18n()
const localePath = useLocalePath()
const sections = computed(
  () => tm(`legal.${props.document}.sections`) as { title: string; body: string }[],
)
usePageSeo(
  () => `${t(`legal.${props.document}.title`)} — Trade Lab`,
  () => t(`legal.${props.document}.intro`),
)
</script>
<template>
  <CommonPublicDocument
    :title="$t(`legal.${document}.title`)"
    :intro="$t(`legal.${document}.intro`)"
  >
    <section
      v-for="(section, index) in sections"
      :key="index"
    >
      <h2>{{ rt(section.title) }}</h2>
      <p>{{ rt(section.body) }}</p>
    </section>
    <section v-if="document === 'terms'">
      <h2>{{ $t('openSource.title') }}</h2>
      <p>{{ $t('openSource.intro') }}</p>
      <NuxtLink :to="localePath('/open-source')"
        >{{ $t('openSource.title') }} <UIcon name="i-lucide-arrow-up-right"
      /></NuxtLink>
    </section>
    <section>
      <h2>{{ $t('publicSite.contact') }}</h2>
      <p>{{ $t('legal.contactBody') }}</p>
      <NuxtLink :to="localePath('/contact')"
        >{{ $t('publicSite.contact') }} <UIcon name="i-lucide-arrow-up-right"
      /></NuxtLink>
    </section>
  </CommonPublicDocument>
</template>
