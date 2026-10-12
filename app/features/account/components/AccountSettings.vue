<script setup lang="ts">
import { useAuthStore } from '~/features/auth'
import { useOverlaysStore } from '~/stores/overlays'
import PreferenceSelect from '~/components/ui/PreferenceSelect.vue'
import type { ThemePreference, Locale } from '#shared/types/http'
const { language } = useLanguage()
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
    title: t('settings.accountTab'),
    icon: 'i-lucide-user-round',
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
const themeOptions = computed<
  { label: string; value: ThemePreference; icon: string; disabled: boolean }[]
>(() => [
  { label: t('settings.light'), value: 'light', icon: 'i-lucide-sun', disabled: false },
  { label: t('settings.dark'), value: 'dark', icon: 'i-lucide-moon', disabled: !theme.allowDark },
  {
    label: t('settings.system'),
    value: 'system',
    icon: 'i-lucide-contrast',
    disabled: !theme.allowDark,
  },
])
const localeOptions: { label: string; value: Locale }[] = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' },
]
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
          <div class="settings-signout">
            <UTooltip
              v-if="auth.isAuthenticated"
              :text="$t('auth.logout')"
              :delay-duration="400"
              :content="{ side: 'top', sideOffset: 8 }"
              :ui="{ content: 'settings-signout-tooltip ring-0' }"
              :disabled="loggingOut"
            >
              <button
                type="button"
                class="settings-secondary-button settings-signout-button"
                :aria-label="$t('auth.logout')"
                :disabled="loggingOut"
                @click="logout"
              >
                <UIcon
                  name="i-lucide-log-out"
                  aria-hidden="true"
                />
              </button>
            </UTooltip>
            <NuxtLink
              v-else
              to="/login"
              class="settings-secondary-button"
              @click="overlays.close()"
              >{{ $t('nav.login') }}</NuxtLink
            >
          </div>
        </div>
        <p
          v-if="logoutError"
          role="alert"
          class="settings-error"
        >
          {{ $t('errors.network') }}
        </p>
        <div class="settings-plan-summary">
          <div class="settings-plan-heading">
            <strong>{{ $t('settings.freePlan') }}</strong>
            <button
              type="button"
              class="settings-upgrade-button"
              @click="overlays.openPricing()"
            >
              {{ $t('settings.viewPlans') }}
            </button>
          </div>
          <div class="settings-credit-row">
            <span class="settings-credit-label">
              <UIcon name="i-lucide-sparkles" />{{ $t('settings.creditBalance') }}
            </span>
            <strong aria-hidden="true">—</strong>
            <span class="sr-only">{{ $t('settings.notAvailable') }}</span>
          </div>
        </div>
        <div class="settings-preference settings-language">
          <h3 class="settings-preference-title">{{ $t('settings.language') }}</h3>
          <PreferenceSelect
            v-model="language"
            :label="$t('settings.language')"
            :options="localeOptions"
          />
        </div>
        <div class="settings-preference">
          <h3
            :id="`${instanceId}-theme-label`"
            class="settings-preference-title"
          >
            {{ $t('settings.theme') }}
          </h3>
          <div
            role="radiogroup"
            :aria-labelledby="`${instanceId}-theme-label`"
            class="settings-theme-options"
          >
            <label
              v-for="option in themeOptions"
              :key="option.value"
              class="settings-theme-option"
            >
              <input
                v-model="themeValue"
                type="radio"
                :name="`${instanceId}-theme`"
                :value="option.value"
                :disabled="option.disabled"
                class="sr-only"
              />
              <UIcon :name="option.icon" />
              <span>{{ option.label }}</span>
            </label>
          </div>
        </div>
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
