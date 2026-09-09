<script setup lang="ts">
import { useOverlaysStore } from '~/stores/overlays'
import { AccountSettings } from '~/features/account'
import { SubscriptionModal } from '~/features/billing'
import { useAuthStore } from '~/features/auth'
const overlays = useOverlaysStore()
const auth = useAuthStore()
const route = useRoute()
watch(
  () => auth.user?.id,
  () => overlays.close(),
)
watch(
  () => route.fullPath,
  () => overlays.close(),
)
const pricingOpen = computed({
  get: () => overlays.pricingTab !== null,
  set: (value) => {
    if (!value) overlays.closePricing()
  },
})
const open = computed({
  get: () => overlays.active === 'settings',
  set: (value) => {
    if (!value) overlays.close()
  },
})
</script>
<template>
  <UModal
    v-model:open="open"
    :title="$t('settings.dialogTitle')"
    :description="$t('settings.description')"
    :ui="{ content: 'settings-modal' }"
    ><template #content><AccountSettings /></template
  ></UModal>
  <SubscriptionModal
    v-model:open="pricingOpen"
    :initial-tab="overlays.pricingTab ?? 'plans'"
  />
</template>
