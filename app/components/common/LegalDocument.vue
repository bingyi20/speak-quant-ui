<script setup lang="ts">
const props = defineProps<{ document: 'privacy' | 'terms' }>()
const { t, tm, rt } = useI18n()
const localePath = useLocalePath()
const { operator, email, incomplete } = usePublicContact()
const sections = computed(
  () =>
    tm(`legal.${props.document}.sections`) as {
      title: string
      paragraphs: string[]
      items?: string[]
    }[],
)
usePageSeo(
  () => `${t(`legal.${props.document}.title`)} — SpeakQuant`,
  () => t(`legal.${props.document}.intro`, { operator: operator.value || 'SpeakQuant' }),
)
</script>
<template>
  <CommonPublicDocument
    :title="$t(`legal.${document}.title`)"
    :intro="$t(`legal.${document}.intro`, { operator: operator || 'SpeakQuant' })"
    :draft="incomplete"
  >
    <section
      v-for="(section, index) in sections"
      :key="index"
    >
      <h2>{{ rt(section.title) }}</h2>
      <p
        v-for="(paragraph, paragraphIndex) in section.paragraphs"
        :key="paragraphIndex"
      >
        {{ rt(paragraph) }}
      </p>
      <ul v-if="section.items?.length">
        <li
          v-for="(item, itemIndex) in section.items"
          :key="itemIndex"
        >
          {{ rt(item) }}
        </li>
      </ul>
    </section>
    <section v-if="document === 'terms'">
      <h2>{{ $t('legal.billingLinksTitle') }}</h2>
      <p>{{ $t('legal.billingLinksBody') }}</p>
      <NuxtLink :to="`${localePath('/pricing')}#billing`">
        {{ $t('legal.billingLink') }} <UIcon name="i-lucide-arrow-up-right" />
      </NuxtLink>
      <p>
        <NuxtLink :to="localePath('/privacy')">{{ $t('legal.privacy.title') }}</NuxtLink>
      </p>
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
      <p v-if="email">
        <a :href="`mailto:${email}`">{{ email }}</a>
      </p>
    </section>
  </CommonPublicDocument>
</template>
