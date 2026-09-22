<script setup lang="ts">
definePageMeta({ layout: 'public' })
const { t } = useI18n()
const config = useRuntimeConfig()
const operator = computed(() => config.public.operatorName.trim())
const email = computed(() => {
  const value = config.public.supportEmail.trim()
  return /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(value) ? value : ''
})
usePageSeo(
  () => `${t('publicSite.contact')} — Trade Lab`,
  () => t('publicSite.contactIntro'),
)
</script>
<template>
  <CommonPublicDocument
    :title="$t('publicSite.contact')"
    :intro="$t('publicSite.contactIntro')"
  >
    <section>
      <h2>{{ $t('publicSite.operator') }}</h2>
      <p>
        {{
          operator ? $t('publicSite.brandRelation', { operator }) : $t('publicSite.pendingOperator')
        }}
      </p>
    </section>
    <section>
      <h2>{{ $t('publicSite.support') }}</h2>
      <a
        v-if="email"
        :href="`mailto:${email}`"
        >{{ email }}</a
      >
      <p v-else>{{ $t('publicSite.pendingSupport') }}</p>
    </section>
    <p>{{ $t('publicSite.contactAdvice') }}</p>
  </CommonPublicDocument>
</template>
