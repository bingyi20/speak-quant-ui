<script setup lang="ts">
import { usePreferencesStore } from '~/stores/preferences'
import { useAuthStore } from '~/features/auth'
import { useOverlaysStore } from '~/stores/overlays'
import PreferenceSelect from '~/components/ui/PreferenceSelect.vue'
import type { ThemePreference, Locale } from '#shared/types/http'
const preferences = usePreferencesStore()
const auth = useAuthStore()
const overlays = useOverlaysStore()
const theme = useTheme()
const { t } = useI18n()
const { $logout } = useNuxtApp()
const logoutError = ref(false)
const loggingOut = ref(false)
const activeTab = ref('account')
const instanceId = useId()
const tabs = computed(() => [
  {
    id: 'account',
    label: t('settings.accountTab'),
    title: t('settings.title'),
    icon: 'i-lucide-user-round',
  },
  {
    id: 'subscription',
    label: t('settings.subscriptionTab'),
    title: t('settings.subscriptionTab'),
    icon: 'i-lucide-credit-card',
  },
  {
    id: 'usage',
    label: t('settings.usageTab'),
    title: t('settings.usageTab'),
    icon: 'i-lucide-chart-no-axes-column',
  },
])
const currentTab = computed(() => tabs.value.find((tab) => tab.id === activeTab.value)!)
const themeValue = computed({ get: () => theme.preference.value, set: theme.setTheme })
const themeOptions = computed<{ label: string; value: ThemePreference }[]>(() => [
  { label: t('settings.light'), value: 'light' },
  ...(theme.allowDark
    ? [
        { label: t('settings.dark'), value: 'dark' as const },
        { label: t('settings.system'), value: 'system' as const },
      ]
    : []),
])
const localeOptions: { label: string; value: Locale }[] = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' },
]
function openTab(id: string) {
  activeTab.value = id
  nextTick(() => document.getElementById(`${instanceId}-panel-${id}`)?.focus())
}
function navigateTabs(event: KeyboardEvent) {
  const directions: Record<string, number> = {
    ArrowDown: 1,
    ArrowRight: 1,
    ArrowUp: -1,
    ArrowLeft: -1,
  }
  if (!(event.key in directions) && event.key !== 'Home' && event.key !== 'End') return
  event.preventDefault()
  const index = tabs.value.findIndex((tab) => tab.id === activeTab.value)
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.value.length - 1
        : (index + directions[event.key]! + tabs.value.length) % tabs.value.length
  activeTab.value = tabs.value[next]!.id
  nextTick(() => document.getElementById(`${instanceId}-${activeTab.value}`)?.focus())
}
async function logout() {
  if (loggingOut.value) return
  logoutError.value = false
  loggingOut.value = true
  try {
    await $logout()
  } catch {
    logoutError.value = true
  } finally {
    loggingOut.value = false
  }
}
</script>
<template>
  <div class="account-settings">
    <aside class="settings-navigation">
      <div class="settings-navigation-header">
        <span class="settings-mobile-title">{{ $t('settings.dialogTitle') }}</span>
        <button
          type="button"
          class="icon-button settings-close"
          :aria-label="$t('common.close')"
          @click="overlays.close()"
        >
          <UIcon name="i-lucide-x" />
        </button>
      </div>
      <div
        class="settings-tabs"
        role="tablist"
        :aria-label="$t('settings.dialogTitle')"
        @keydown="navigateTabs"
      >
        <button
          v-for="tab in tabs"
          :id="`${instanceId}-${tab.id}`"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          :aria-controls="`${instanceId}-panel-${tab.id}`"
          :tabindex="activeTab === tab.id ? 0 : -1"
          class="settings-tab"
          @click="activeTab = tab.id"
        >
          <UIcon :name="tab.icon" /><span>{{ tab.label }}</span>
        </button>
      </div>
    </aside>
    <section
      :id="`${instanceId}-panel-${activeTab}`"
      :key="activeTab"
      role="tabpanel"
      :aria-labelledby="`${instanceId}-${activeTab}`"
      tabindex="0"
      class="settings-panel"
    >
      <h2>{{ currentTab.title }}</h2>
      <template v-if="activeTab === 'account'">
        <div class="settings-profile">
          <CommonUserAvatar
            :src="auth.user?.avatar_url"
            large
          />
          <div class="settings-profile-identity">
            <strong>{{
              auth.user?.display_name || auth.user?.email || $t('settings.guest')
            }}</strong>
            <p>{{ auth.user?.email || $t('settings.profileHint') }}</p>
          </div>
        </div>
        <div class="settings-plan-summary">
          <div>
            <strong>{{ $t('settings.freePlan') }}</strong>
            <p>{{ $t('settings.planPreview') }}</p>
          </div>
          <button
            type="button"
            class="settings-secondary-button"
            @click="openTab('subscription')"
          >
            {{ $t('settings.viewPlans') }}<UIcon name="i-lucide-arrow-up-right" />
          </button>
        </div>
        <div class="setting-row">
          <span>{{ $t('settings.theme') }}</span>
          <PreferenceSelect
            v-model="themeValue"
            :label="$t('settings.theme')"
            :options="themeOptions"
          />
        </div>
        <div class="setting-row">
          <span>{{ $t('settings.language') }}</span>
          <PreferenceSelect
            v-model="preferences.locale"
            :label="$t('settings.language')"
            :options="localeOptions"
          />
        </div>
        <p class="setting-hint settings-preferences-hint">{{ $t('settings.languageHint') }}</p>
        <div class="settings-signout">
          <button
            v-if="auth.isAuthenticated"
            type="button"
            class="settings-secondary-button"
            :disabled="loggingOut"
            @click="logout"
          >
            <UIcon name="i-lucide-log-out" />{{ $t('auth.logout') }}
          </button>
          <NuxtLink
            v-else
            to="/login"
            class="settings-secondary-button"
            @click="overlays.close()"
            >{{ $t('nav.login') }}</NuxtLink
          >
          <p
            v-if="logoutError"
            role="alert"
            class="settings-error"
          >
            {{ $t('errors.network') }}
          </p>
        </div>
      </template>
      <template v-else-if="activeTab === 'subscription'">
        <div class="settings-subscription-card">
          <div class="settings-subscription-heading">
            <span>{{ $t('settings.planLabel') }}</span
            ><span class="settings-coming-soon">{{ $t('settings.preview') }}</span>
          </div>
          <strong class="settings-plan-name">{{ $t('settings.freePlan') }}</strong>
          <p class="setting-hint">{{ $t('settings.subscriptionHint') }}</p>
          <button
            type="button"
            class="settings-secondary-button"
            disabled
          >
            {{ $t('settings.upgradeSoon') }}
          </button>
        </div>
        <div class="setting-row settings-credit-row">
          <div>
            <span>{{ $t('settings.creditBalance') }}</span>
            <p class="setting-hint">{{ $t('settings.creditsHint') }}</p>
          </div>
          <strong aria-hidden="true">—</strong
          ><span class="sr-only">{{ $t('settings.notAvailable') }}</span>
        </div>
        <button
          type="button"
          class="settings-usage-link"
          @click="openTab('usage')"
        >
          {{ $t('settings.viewUsage') }}<UIcon name="i-lucide-arrow-right" />
        </button>
      </template>
      <template v-else>
        <p class="setting-hint">{{ $t('settings.usageDescription') }}</p>
        <div class="settings-empty">
          <span class="settings-empty-icon"><UIcon name="i-lucide-chart-no-axes-column" /></span>
          <h3>{{ $t('settings.usageSoon') }}</h3>
          <p>{{ $t('settings.usageHint') }}</p>
        </div>
      </template>
    </section>
  </div>
</template>
