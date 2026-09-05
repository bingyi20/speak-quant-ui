<script setup lang="ts">
import { useOverlaysStore } from '~/stores/overlays'
import { AccountSettings } from '~/features/account'
const overlays = useOverlaysStore()
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
    :title="$t('settings.title')"
    :description="$t('settings.description')"
    :ui="{ content: 'settings-modal' }"
    ><template #body><AccountSettings /></template
  ></UModal>
</template>
