<script setup lang="ts">
import AccountTrigger from '~/features/account/components/AccountTrigger.vue'
import ResearchHistory from '~/features/conversation/components/ResearchHistory.vue'
const localePath = useLocalePath()
defineProps<{ collapsed?: boolean; mobile?: boolean }>()
defineEmits<{
  (event: 'toggle' | 'navigate' | 'settings' | 'pricing'): void
  (event: 'interaction', active: boolean): void
}>()
</script>
<template>
  <div class="sidebar-top">
    <NuxtLink
      v-if="!collapsed"
      :to="localePath('/')"
      aria-label="SpeakQuant"
      @click="$emit('navigate')"
      ><CommonBrandMark
    /></NuxtLink>
    <UiIconButton
      v-if="mobile"
      class="sidebar-toggle"
      :label="$t('common.close')"
      @click="$emit('toggle')"
    >
      <UIcon name="i-lucide-x" />
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
  <AccountTrigger
    @open="$emit('settings')"
    @topup="$emit('pricing')"
  />
</template>
