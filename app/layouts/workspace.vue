<script setup lang="ts">
import { useOverlaysStore } from '~/stores/overlays'
import { usePreferencesStore } from '~/stores/preferences'
import WorkspaceNavigation from '~/components/common/WorkspaceNavigation.vue'
import { useConversationHistoryStore } from '~/features/conversation/history-store'
const preferences = usePreferencesStore()
const overlays = useOverlaysStore()
const history = useConversationHistoryStore()
const navigationBusy = ref(false)
function setNavigationBusy(value: boolean) {
  navigationBusy.value = value
  if (value) cancelClose()
  else closePreview()
}
let settingsAfterClose = false
function afterDrawerClose() {
  if (!settingsAfterClose) return
  settingsAfterClose = false
  expand.value?.focus()
  overlays.openSettings()
}
function openSettings() {
  if (mobileOpen.value) {
    settingsAfterClose = true
    mobileOpen.value = false
    return
  }
  if (previewOpen.value) {
    previewOpen.value = false
    nextTick(() => {
      expand.value?.focus()
      overlays.openSettings()
    })
  } else overlays.openSettings()
}
const mobileOpen = ref(false)
const isMobile = ref(false)
let mobileQuery: MediaQueryList | undefined
const syncMobile = () => {
  isMobile.value = mobileQuery?.matches ?? false
  previewOpen.value = false
}
const previewOpen = ref(false)
// Keep preview motion disabled through dismissal; clicking restores docked motion.
const previewMode = ref(false)
const route = useRoute()
const { t } = useI18n()
const isConversation = computed(() => route.path.startsWith('/conversations/'))
const showNewTaskShortcut = computed(
  () => isConversation.value && (isMobile.value ? !mobileOpen.value : preferences.sidebarCollapsed),
)
const conversationTitle = computed(
  () =>
    history.items.find((item) => item.id === route.params.id)?.title ??
    (typeof route.meta.conversationTitle === 'string'
      ? route.meta.conversationTitle
      : t('conversation.title')),
)
const sidebar = useTemplateRef<HTMLElement>('sidebar')
const expand = useTemplateRef<HTMLButtonElement>('expand')
let closeTimer: ReturnType<typeof setTimeout> | undefined
function cancelClose() {
  clearTimeout(closeTimer)
}
function preview() {
  cancelClose()
  if (preferences.sidebarCollapsed && matchMedia('(min-width: 761px) and (hover: hover)').matches) {
    previewMode.value = true
    previewOpen.value = true
  }
}
function closePreview() {
  cancelClose()
  closeTimer = setTimeout(() => {
    if (
      navigationBusy.value ||
      sidebar.value?.matches(':hover') ||
      sidebar.value?.contains(document.activeElement)
    )
      return
    previewOpen.value = false
  }, 180)
}
function previewFromKeyboard() {
  if (isMobile.value) {
    mobileOpen.value = true
    return
  }
  previewMode.value = true
  previewOpen.value = true
  nextTick(() => sidebar.value?.querySelector<HTMLElement>('a, button')?.focus())
}
function toggle() {
  cancelClose()
  previewMode.value = false
  if (matchMedia('(max-width: 760px)').matches) mobileOpen.value = true
  else preferences.sidebarCollapsed = !preferences.sidebarCollapsed
  previewOpen.value = false
  if (!isMobile.value)
    nextTick(() => {
      if (preferences.sidebarCollapsed) expand.value?.focus()
      else sidebar.value?.querySelector<HTMLButtonElement>('button')?.focus()
    })
}
function dismiss(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  if (event.key === 'Escape' && previewOpen.value && !navigationBusy.value) {
    previewOpen.value = false
    expand.value?.focus()
  }
}
function outside(event: PointerEvent) {
  if (navigationBusy.value) return
  if (
    !sidebar.value?.contains(event.target as Node) &&
    !expand.value?.contains(event.target as Node)
  )
    previewOpen.value = false
}
watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false
    previewOpen.value = false
  },
)
onMounted(() => {
  mobileQuery = matchMedia('(max-width: 760px)')
  syncMobile()
  mobileQuery.addEventListener('change', syncMobile)
  document.addEventListener('keydown', dismiss)
  document.addEventListener('pointerdown', outside)
})
onBeforeUnmount(() => {
  mobileQuery?.removeEventListener('change', syncMobile)
  cancelClose()
  document.removeEventListener('keydown', dismiss)
  document.removeEventListener('pointerdown', outside)
})
</script>
<template>
  <div
    class="workspace-shell"
    :class="{
      'sidebar-collapsed': preferences.sidebarCollapsed,
      'sidebar-preview': previewOpen,
      'sidebar-preview-mode': previewMode,
    }"
  >
    <a
      href="#workspace-main"
      class="skip-link"
      >{{ $t('nav.workspace') }}</a
    >
    <aside
      id="workspace-sidebar"
      ref="sidebar"
      class="workspace-sidebar"
      :aria-label="$t('nav.history')"
      :inert="preferences.sidebarCollapsed && !previewOpen"
      @mouseenter="cancelClose"
      @mouseleave="closePreview"
      @focusin="cancelClose"
      @focusout="closePreview"
    >
      <WorkspaceNavigation
        :collapsed="preferences.sidebarCollapsed"
        @toggle="toggle"
        @settings="openSettings"
        @interaction="setNavigationBusy"
      />
    </aside>
    <main
      id="workspace-main"
      class="workspace-main"
    >
      <header class="workspace-toolbar">
        <button
          ref="expand"
          type="button"
          class="icon-button sidebar-toggle workspace-expand"
          :aria-label="$t('nav.expand')"
          :title="$t('nav.expand')"
          aria-controls="workspace-sidebar"
          :aria-expanded="isMobile ? mobileOpen : !preferences.sidebarCollapsed || previewOpen"
          @mouseenter="preview"
          @mouseleave="closePreview"
          @click="toggle"
          @keydown.down.prevent="previewFromKeyboard"
        >
          <UIcon name="i-lucide-panel-left" />
        </button>
        <template v-if="isConversation">
          <NuxtLink
            v-if="showNewTaskShortcut"
            to="/new-task"
            class="icon-button new-task-shortcut"
            :aria-label="$t('nav.new')"
            :title="$t('nav.new')"
          >
            <UIcon name="i-lucide-square-pen" />
          </NuxtLink>
          <span
            class="workspace-conversation-title"
            :title="conversationTitle"
            >{{ conversationTitle }}</span
          >
        </template>
        <div
          id="workspace-actions"
          class="workspace-actions"
        />
      </header>
      <div class="workspace-body"><slot /></div>
    </main>
    <USlideover
      v-model:open="mobileOpen"
      side="left"
      :title="$t('nav.history')"
      @after:leave="afterDrawerClose"
    >
      <template #content
        ><div class="mobile-navigation">
          <WorkspaceNavigation
            mobile
            @settings="openSettings"
            @navigate="mobileOpen = false"
            @toggle="mobileOpen = false"
          /></div
      ></template>
    </USlideover>
  </div>
</template>
