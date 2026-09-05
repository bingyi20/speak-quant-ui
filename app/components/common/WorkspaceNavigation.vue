<script setup lang="ts">
import AccountTrigger from '~/features/account/components/AccountTrigger.vue'
import ResearchHistory from '~/features/conversation/components/ResearchHistory.vue'
defineProps<{ collapsed?: boolean; mobile?: boolean }>()
defineEmits<{
  (event: 'toggle' | 'navigate' | 'settings'): void
  (event: 'interaction', active: boolean): void
}>()
</script>
<template>
  <div class="sidebar-top">
    <NuxtLink
      v-if="!collapsed"
      to="/"
      aria-label="Trade Lab"
      @click="$emit('navigate')"
      ><CommonBrandMark
    /></NuxtLink>
    <UiIconButton
      class="sidebar-toggle"
      :label="mobile ? $t('common.close') : $t(collapsed ? 'nav.expand' : 'nav.collapse')"
      @click="$emit('toggle')"
    >
      <UIcon :name="mobile ? 'i-lucide-x' : 'i-lucide-panel-left'" />
    </UiIconButton>
  </div>
  <NuxtLink
    to="/new-task"
    class="sidebar-item new-research"
    exact-active-class="is-selected"
    @click="$emit('navigate')"
    ><UIcon name="i-lucide-square-pen" />{{ $t('nav.new') }}</NuxtLink
  >
  <ResearchHistory
    @navigate="$emit('navigate')"
    @interaction="$emit('interaction', $event)"
  />
  <AccountTrigger @open="$emit('settings')" />
</template>
