<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useNuxtApp } from '#app'
import { useAuthStore } from '~/features/auth'
import { saveDownload } from '~/lib/download/client'
import { createRunnerApi, type RunnerDownloadRequest } from '../api'
const props = defineProps<{
  nodeId: string | null
  replayId: string
  name: string
  strategyName: string
  summary?: string | null
  symbol: string
  timeframe: string
}>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n(),
  auth = useAuthStore(),
  api = createRunnerApi(useNuxtApp().$http)
const platform = ref<RunnerDownloadRequest['platform']>('macos'),
  architecture = ref<RunnerDownloadRequest['architecture']>('arm64')
const loading = ref(false),
  error = ref(false),
  downloaded = ref(false)
const targets = computed(() => [
  { label: 'macOS', value: 'macos' },
  { label: 'Windows', value: 'windows' },
  { label: 'Linux', value: 'linux' },
])
let request: AbortController | undefined
watch(open, (value) => {
  if (!value) {
    request?.abort()
    loading.value = false
    return
  }
  error.value = false
  downloaded.value = false
  if (/Windows/i.test(navigator.userAgent)) {
    platform.value = 'windows'
    architecture.value = 'x86_64'
  } else if (/Linux/i.test(navigator.userAgent)) {
    platform.value = 'linux'
    architecture.value = 'x86_64'
  }
})
watch(
  () => auth.user?.id,
  () => {
    request?.abort()
    open.value = false
  },
)
watch(
  () => props.replayId,
  () => {
    request?.abort()
    open.value = false
  },
)
async function download() {
  if (!props.nodeId || loading.value) return
  const owner = auth.user?.id,
    pending = new AbortController()
  request = pending
  loading.value = true
  error.value = false
  downloaded.value = false
  try {
    const file = await api.download(
      {
        strategy_node_id: props.nodeId,
        source_replay_id: props.replayId,
        platform: platform.value,
        architecture: architecture.value,
      },
      pending.signal,
    )
    if (!pending.signal.aborted && owner === auth.user?.id) {
      saveDownload(file)
      downloaded.value = true
    }
  } catch {
    if (!pending.signal.aborted) error.value = true
  } finally {
    if (request === pending) loading.value = false
  }
}
onBeforeUnmount(() => request?.abort())
</script>
<template>
  <UModal
    v-model:open="open"
    :title="t('replay.downloadRunner')"
    :ui="{ overlay: 'z-[60]', content: 'z-[61]' }"
  >
    <template #body>
      <div class="replay-download-body">
        <strong>{{ summary || strategyName }}</strong>
        <p>{{ name }} · {{ symbol }} · {{ timeframe }}</p>
        <label
          >{{ t('replay.platform')
          }}<USelect
            v-model="platform"
            :items="targets"
        /></label>
        <label
          >{{ t('replay.architecture')
          }}<USelect
            v-model="architecture"
            :items="['arm64', 'x86_64']"
        /></label>
        <p class="replay-download-risk">{{ t('replay.runnerRisk') }}</p>
        <p
          v-if="error"
          role="alert"
        >
          {{ t('replay.errors.download') }}
        </p>
        <p
          v-if="downloaded"
          role="status"
        >
          {{ t('replay.downloadStarted') }}
        </p>
      </div>
    </template>
    <template #footer
      ><button
        class="solid-button"
        :disabled="loading || !nodeId"
        @click="download"
      >
        {{ t(loading ? 'replay.preparingDownload' : error ? 'common.retry' : 'replay.download') }}
      </button></template
    >
  </UModal>
</template>
