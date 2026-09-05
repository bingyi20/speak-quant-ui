<script setup lang="ts">
import { usePreferencesStore } from '~/stores/preferences'
import { useAuthStore } from '~/features/auth'
import { useOverlaysStore } from '~/stores/overlays'
const preferences = usePreferencesStore()
const auth = useAuthStore()
const overlays = useOverlaysStore()
const theme = useTheme()
const { $logout } = useNuxtApp()
const logoutError = ref(false)
async function logout() {
  try {
    await $logout()
  } catch {
    logoutError.value = true
  }
}
</script>
<template>
  <div class="settings-content">
    <section>
      <h3>{{ $t('settings.profile') }}</h3>
      <div class="profile-line">
        <span class="avatar large"><UIcon name="i-lucide-user-round" /></span>
        <div>
          <strong>{{ auth.user?.display_name || $t('settings.guest') }}</strong>
          <p>{{ auth.user?.email || $t('settings.profileHint') }}</p>
        </div>
      </div>
    </section>
    <section>
      <h3>{{ $t('settings.preferences') }}</h3>
      <div class="setting-row">
        <label for="theme-select">{{ $t('settings.theme') }}</label
        ><select
          id="theme-select"
          :value="theme.preference.value"
          @change="
            theme.setTheme(
              ($event.target as HTMLSelectElement).value as 'light' | 'dark' | 'system',
            )
          "
        >
          <option value="light">{{ $t('settings.light') }}</option>
          <option
            v-if="theme.allowDark"
            value="dark"
          >
            {{ $t('settings.dark') }}
          </option>
          <option
            v-if="theme.allowDark"
            value="system"
          >
            {{ $t('settings.system') }}
          </option>
        </select>
      </div>
      <p
        v-if="!theme.allowDark"
        class="setting-hint"
      >
        {{ $t('settings.darkHint') }}
      </p>
      <div class="setting-row">
        <label for="language-select">{{ $t('settings.language') }}</label
        ><select
          id="language-select"
          v-model="preferences.locale"
        >
          <option value="zh-CN">简体中文</option>
          <option value="en-US">English</option>
        </select>
      </div>
      <p class="setting-hint">{{ $t('settings.languageHint') }}</p>
    </section>
    <section>
      <h3>{{ $t('settings.account') }}</h3>
      <p class="setting-hint">{{ $t('settings.billing') }}</p>
      <button
        v-if="auth.isAuthenticated"
        class="text-button"
        @click="logout"
      >
        {{ $t('auth.logout') }}</button
      ><NuxtLink
        v-else
        to="/login"
        class="text-button"
        @click="overlays.close()"
        >{{ $t('nav.login') }}</NuxtLink
      >
      <p
        v-if="logoutError"
        role="alert"
      >
        {{ $t('errors.network') }}
      </p>
    </section>
  </div>
</template>
