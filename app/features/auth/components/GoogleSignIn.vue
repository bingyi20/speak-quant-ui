<script setup lang="ts">
import { createAuthApi } from '../api'
import { loadGoogleIdentity } from '../google'
const emit = defineEmits<(event: 'credential', value: string) => void>()
const api = createAuthApi(useApi())
const { locale } = useI18n()
const container = useTemplateRef<HTMLElement>('container')
const status = ref<'loading' | 'ready' | 'error' | 'expired'>('loading')
// GIS large buttons are 40px high; scale both axes to match our 50px controls.
const buttonScale = 1.25
const enabled = String(useRuntimeConfig().public.apiEnabled) === 'true'
let controller = new AbortController()
let expiry: ReturnType<typeof setTimeout> | undefined
let generation = 0
async function setup() {
  if (!enabled) {
    status.value = 'error'
    return
  }
  const current = ++generation
  controller.abort()
  controller = new AbortController()
  const signal = controller.signal
  clearTimeout(expiry)
  status.value = 'loading'
  try {
    const [sdk, config] = await Promise.all([loadGoogleIdentity(), api.googleConfig(signal)])
    if (signal.aborted || current !== generation || !container.value) return
    sdk.initialize({
      ...config,
      auto_select: false,
      use_fedcm_for_button: true,
      callback: ({ credential }) => {
        if (current === generation && !signal.aborted && status.value === 'ready' && credential)
          emit('credential', credential)
      },
    })
    container.value.replaceChildren()
    sdk.renderButton(container.value, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      locale: locale.value === 'zh-CN' ? 'zh_CN' : 'en',
      width: Math.min(
        400,
        Math.floor(
          (container.value.parentElement?.clientWidth || Math.min(window.innerWidth - 48, 400)) /
            buttonScale,
        ),
      ),
    })
    status.value = 'ready'
    expiry = setTimeout(() => {
      status.value = 'expired'
    }, 590_000)
  } catch {
    if (!signal.aborted && current === generation) status.value = 'error'
  }
}
onMounted(setup)
onBeforeUnmount(() => {
  generation++
  controller.abort()
  clearTimeout(expiry)
})
</script>
<template>
  <div
    class="google-sign-in"
    :style="{ '--google-button-scale': buttonScale }"
  >
    <div
      v-show="status === 'ready'"
      ref="container"
      class="google-button"
    />
    <div
      v-if="status !== 'ready'"
      class="google-fallback"
    >
      <span
        v-if="status === 'loading'"
        role="status"
        >{{ $t('auth.googleLoading') }}</span
      >
      <template v-else>
        <span>{{
          $t(status === 'expired' ? 'auth.googleExpired' : 'auth.googleUnavailable')
        }}</span>
        <button
          v-if="enabled"
          type="button"
          class="text-button"
          @click="setup"
        >
          {{ $t('common.retry') }}
        </button>
      </template>
    </div>
  </div>
</template>
