<script setup lang="ts">
import { usePreferencesStore } from '~/stores/preferences'
import { useOverlaysStore } from '~/stores/overlays'
const preferences = usePreferencesStore()
const overlays = useOverlaysStore()
const mobileOpen = ref(false)
const route = useRoute()
watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false
  },
)
</script>
<template>
  <div
    class="workspace-shell"
    :class="{ 'sidebar-collapsed': preferences.sidebarCollapsed }"
  >
    <a
      href="#workspace-main"
      class="skip-link"
      >{{ $t('nav.workspace') }}</a
    >
    <aside class="workspace-sidebar">
      <div class="sidebar-top">
        <NuxtLink
          to="/"
          aria-label="Trade Lab"
          ><CommonBrandMark /></NuxtLink
        ><UiIconButton
          :label="$t('nav.collapse')"
          @click="preferences.sidebarCollapsed = true"
          ><UIcon name="i-lucide-panel-left-close"
        /></UiIconButton>
      </div>
      <NuxtLink
        to="/new-task"
        class="new-research"
        ><UIcon name="i-lucide-plus" />{{ $t('nav.new') }}</NuxtLink
      >
      <div class="sidebar-history">
        <h2>{{ $t('nav.history') }}</h2>
        <p>{{ $t('nav.historyEmpty') }}</p>
      </div>
      <button
        class="account-trigger"
        @click="overlays.openSettings()"
      >
        <span class="avatar"><UIcon name="i-lucide-user-round" /></span
        ><span>{{ $t('nav.settings') }}</span
        ><UIcon name="i-lucide-settings-2" />
      </button>
    </aside>
    <div class="collapsed-rail">
      <NuxtLink
        to="/"
        aria-label="Trade Lab"
        ><CommonBrandMark :wordmark="false" /></NuxtLink
      ><UiIconButton
        :label="$t('nav.expand')"
        @click="preferences.sidebarCollapsed = false"
        ><UIcon name="i-lucide-panel-left-open"
      /></UiIconButton>
    </div>
    <div class="mobile-bar">
      <UiIconButton
        :label="$t('nav.expand')"
        @click="mobileOpen = true"
        ><UIcon name="i-lucide-menu" /></UiIconButton
      ><CommonBrandMark /><UiIconButton
        :label="$t('nav.settings')"
        @click="overlays.openSettings()"
        ><UIcon name="i-lucide-settings-2"
      /></UiIconButton>
    </div>
    <main
      id="workspace-main"
      class="workspace-main"
    >
      <slot />
    </main>
    <USlideover
      v-model:open="mobileOpen"
      side="left"
      :title="$t('nav.history')"
      :description="$t('nav.historyEmpty')"
    >
      <template #body
        ><NuxtLink
          to="/new-task"
          class="new-research"
          @click="mobileOpen = false"
          ><UIcon name="i-lucide-plus" />{{ $t('nav.new') }}</NuxtLink
        ><NuxtLink
          to="/"
          class="text-button"
          >{{ $t('nav.home') }}</NuxtLink
        ></template
      >
    </USlideover>
  </div>
</template>
