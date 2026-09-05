<script setup lang="ts">
import { useAuthStore } from '~/features/auth'
const auth = useAuthStore()
const emit = defineEmits<(event: 'open') => void>()
const { t } = useI18n()
const name = computed(
  () => auth.user?.display_name?.trim() || auth.user?.email || t('settings.guest'),
)
const email = computed(() => (auth.user?.email !== name.value ? auth.user?.email : ''))
</script>
<template>
  <button
    type="button"
    class="sidebar-item account-trigger"
    :aria-label="$t('nav.settings')"
    @click="emit('open')"
  >
    <CommonUserAvatar :src="auth.user?.avatar_url" />
    <span class="account-identity"
      ><strong :title="name">{{ name }}</strong
      ><small
        v-if="email"
        :title="email"
        >{{ email }}</small
      ></span
    >
    <UIcon name="i-lucide-ellipsis" />
  </button>
</template>
