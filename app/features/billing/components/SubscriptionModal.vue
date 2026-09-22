<script setup lang="ts">
import type { PricingTab } from '../catalog'
import PricingContent from './PricingContent.vue'
defineProps<{ initialTab?: PricingTab }>()
const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <UModal
    v-model:open="open"
    fullscreen
    :title="$t('billing.title')"
    :ui="{ content: 'subscription-modal divide-y-0' }"
  >
    <template #content>
      <div class="subscription-modal-bar">
        <UiIconButton
          :label="$t('common.close')"
          class="subscription-close"
          @click="open = false"
          ><UIcon name="i-lucide-x"
        /></UiIconButton>
      </div>
      <div class="subscription-modal-scroll">
        <PricingContent :initial-tab="initialTab" />
      </div>
    </template>
  </UModal>
</template>
