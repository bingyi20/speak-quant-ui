<script setup lang="ts">
import { useAuthStore } from '~/features/auth'
const auth = useAuthStore()
const hydrated = ref(false)
onMounted(() => {
  hydrated.value = true
})
const signedIn = computed(() => hydrated.value && auth.isAuthenticated)
const localePath = useLocalePath()
const { language } = useLanguage()
const { t } = useI18n()
const languageOptions = [
  { label: 'EN', value: 'en-US' as const },
  { label: '中文', value: 'zh-CN' as const },
]
const footerLinks = computed(() => [
  { path: '/pricing', label: t('nav.pricing') },
  { path: '/privacy', label: t('auth.privacy') },
  { path: '/terms', label: t('auth.terms') },
  { path: '/contact', label: t('publicSite.contact') },
])
</script>
<template>
  <div class="public-shell">
    <header class="public-header">
      <div class="public-header-inner">
        <NuxtLink
          :to="localePath('/')"
          class="public-brand-link"
          aria-label="SpeakQuant"
          ><CommonBrandMark
        /></NuxtLink>
        <nav :aria-label="$t('nav.product')">
          <NuxtLink
            :to="localePath('/pricing')"
            class="text-button public-pricing-link"
            >{{ $t('nav.pricing') }}</NuxtLink
          >
          <UiPreferenceSelect
            v-model="language"
            :modal="false"
            :disabled="!hydrated"
            :label="$t('settings.language')"
            :options="languageOptions"
          />
          <NuxtLink
            :to="signedIn ? '/new-task' : '/login'"
            class="outline-button public-account-link"
          >
            {{ $t(signedIn ? 'nav.workspace' : 'nav.login') }}
          </NuxtLink>
        </nav>
      </div>
    </header>
    <main id="main-content"><slot /></main>
    <footer class="public-footer">
      <div class="public-footer-brand">
        <CommonBrandMark />
      </div>
      <nav :aria-label="$t('publicSite.footerNav')">
        <NuxtLink
          v-for="link in footerLinks"
          :key="link.path"
          :to="localePath(link.path)"
          >{{ link.label }}</NuxtLink
        >
      </nav>
    </footer>
  </div>
</template>
