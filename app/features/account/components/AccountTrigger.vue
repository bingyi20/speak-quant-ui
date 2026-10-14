<script setup lang="ts">
import { useAuthStore } from '~/features/auth'
import { useBillingStore } from '~/features/billing/stores/billing'
const auth = useAuthStore()
const billing = useBillingStore()
const emit = defineEmits<(event: 'open' | 'topup') => void>()
const { t } = useI18n()
const name = computed(
  () => auth.user?.display_name?.trim() || auth.user?.email || t('settings.guest'),
)
const planName = computed(() => {
  const code = billing.account?.subscription?.plan_code
  return code ? code[0]!.toUpperCase() + code.slice(1) : billing.account ? 'Free' : '—'
})
</script>
<template>
  <div class="account-row">
    <button
      type="button"
      class="sidebar-item account-trigger"
      :aria-label="$t('nav.settings')"
      @click="emit('open')"
    >
      <CommonUserAvatar :src="auth.user?.avatar_url" />
      <span class="account-identity"
        ><strong :title="name">{{ name }}</strong
        ><small>{{ planName }}</small></span
      >
    </button>
    <button
      type="button"
      class="account-topup"
      @click="emit('topup')"
    >
      {{ t('billing.recharge') }}
    </button>
  </div>
</template>
