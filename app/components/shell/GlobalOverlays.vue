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
    :title="$t('settings.dialogTitle')"
    :description="$t('settings.description')"
    :ui="{ content: 'settings-modal' }"
    ><template #content><AccountSettings /></template
  ></UModal>
</template>
