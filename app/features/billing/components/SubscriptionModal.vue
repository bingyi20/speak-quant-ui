<script setup lang="ts">
import type { PricingTab } from '../catalog'
import PricingContent from './PricingContent.vue'
defineProps<{ initialTab?: PricingTab }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const paymentNotice = ref(false)
let noticeTimer: ReturnType<typeof setTimeout> | undefined
function clearPaymentNotice() {
  clearTimeout(noticeTimer)
  paymentNotice.value = false
}
function notifyPaymentUnavailable() {
  clearTimeout(noticeTimer)
  paymentNotice.value = true
  noticeTimer = setTimeout(clearPaymentNotice, 2200)
}
watch(open, (value) => {
  if (!value) clearPaymentNotice()
})
onBeforeUnmount(clearPaymentNotice)
</script>

<template>
  <UModal
    v-model:open="open"
    fullscreen
    :title="$t('billing.title')"
    :ui="{ content: 'subscription-modal divide-y-0' }"
  >
    <template #content>
      <div class="subscription-notice" role="status" aria-live="polite">
        <Transition name="subscription-notice">
          <span v-if="paymentNotice">{{ t('billing.paymentSoon') }}</span>
        </Transition>
      </div>
      <div class="subscription-modal-bar">
        <UiIconButton
          :label="$t('common.close')"
          class="subscription-close"
          @click="open = false"
          ><UIcon name="i-lucide-x"
        /></UiIconButton>
      </div>
      <div class="subscription-modal-scroll">
        <PricingContent
          :initial-tab="initialTab"
          @checkout="notifyPaymentUnavailable"
        />
      </div>
    </template>
  </UModal>
</template>
