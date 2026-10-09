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
const menuOpen = ref(false)
const menuTrigger = useTemplateRef<HTMLButtonElement>('menuTrigger')
function closeMenu() {
  menuOpen.value = false
  void nextTick(() => menuTrigger.value?.focus())
}
const route = useRoute()
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
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
  },
)
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
          <button
            ref="menuTrigger"
            class="icon-button public-menu-toggle"
            :disabled="!hydrated"
            :aria-label="$t('publicSite.menu')"
            :aria-expanded="menuOpen"
            aria-controls="public-mobile-menu"
            @click="menuOpen = !menuOpen"
            @keydown.esc.stop.prevent="closeMenu"
          >
            <UIcon :name="menuOpen ? 'i-lucide-x' : 'i-lucide-menu'" />
          </button>
        </nav>
        <nav
          v-if="menuOpen"
          id="public-mobile-menu"
          class="public-mobile-menu"
          :aria-label="$t('publicSite.menu')"
          @keydown.esc.stop.prevent="closeMenu"
        >
          <NuxtLink :to="signedIn ? '/new-task' : '/login'">{{
            $t(signedIn ? 'nav.workspace' : 'nav.login')
          }}</NuxtLink>
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
