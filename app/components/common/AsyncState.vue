<script setup lang="ts">
import { ApiError } from '~/lib/http/error'
const props = defineProps<{
  status: 'idle' | 'pending' | 'success' | 'error'
  error?: unknown
  empty?: boolean
}>()
const emit = defineEmits<(event: 'retry') => void>()
const { t } = useI18n()
const message = computed(() =>
  props.error instanceof ApiError && ['network', 'timeout'].includes(props.error.kind)
    ? t(`errors.${props.error.kind}`)
    : t('errors.generic'),
)
</script>
<template>
  <div
    v-if="status === 'pending'"
    class="async-state"
    role="status"
  >
    <UIcon
      name="i-lucide-loader-circle"
      class="spin"
    />
    {{ $t('common.loading') }}
  </div>
  <div
    v-else-if="status === 'error'"
    class="async-state"
    role="alert"
  >
    <p>{{ message }}</p>
    <button
      class="text-button"
      @click="emit('retry')"
    >
      {{ $t('common.retry') }}
    </button>
  </div>
  <CommonEmptyState
    v-else-if="empty"
    :title="$t('errors.empty')"
  />
  <slot v-else />
</template>
