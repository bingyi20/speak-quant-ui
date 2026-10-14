<script setup lang="ts">
import { useBillingStore } from '~/features/billing/stores/billing'
import { useOverlaysStore } from '~/stores/overlays'

const billing = useBillingStore()
const overlays = useOverlaysStore()
function recharge() {
  overlays.openPricing(billing.account?.topup_eligible === true ? 'credits' : 'plans')
}
</script>

<template>
  <div
    class="conversation-credit-notice"
    role="alert"
  >
    <UIcon
      name="i-lucide-coins"
      aria-hidden="true"
    />
    <div class="conversation-credit-notice-copy">
      <p>{{ $t('chat.creditsInsufficient') }}</p>
      <span>{{ $t('chat.creditsResumeManually') }}</span>
    </div>
    <button
      type="button"
      class="conversation-credit-notice-action"
      @click="recharge"
    >
      {{ $t('chat.rechargeCredits') }}
    </button>
  </div>
</template>
