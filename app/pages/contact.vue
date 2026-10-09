<script setup lang="ts">
definePageMeta({ layout: 'public' })
const { t } = useI18n()
const { operator, registrationNumber, registeredAddress, email, incomplete } = usePublicContact()
usePageSeo(
  () => `${t('publicSite.contact')} — SpeakQuant`,
  () => t('publicSite.contactIntro'),
)
</script>
<template>
  <CommonPublicDocument
    :title="$t('publicSite.contact')"
    :intro="$t('publicSite.contactIntro')"
    :draft="incomplete"
  >
    <section>
      <h2>{{ $t('publicSite.operator') }}</h2>
      <p>
        {{
          operator ? $t('publicSite.brandRelation', { operator }) : $t('publicSite.pendingOperator')
        }}
      </p>
      <p v-if="registrationNumber">
        {{ $t('publicSite.registrationNumber') }}: {{ registrationNumber }}
      </p>
      <p v-if="registeredAddress">
        {{ $t('publicSite.registeredAddress') }}: {{ registeredAddress }}
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
