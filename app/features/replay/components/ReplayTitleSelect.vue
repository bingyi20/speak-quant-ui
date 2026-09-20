<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useNuxtApp } from '#app'
import { createReplayApi } from '../api'
import type { ReplaySummary } from '../types'
const props = defineProps<{
  conversationId: string
  id: string | null
  name: string
  titleId: string
  owner: string | null
}>()
const emit = defineEmits<{ select: [row: ReplaySummary]; expanded: [open: boolean] }>()
const { t } = useI18n(),
  api = createReplayApi(useNuxtApp().$http)
const rows = ref<ReplaySummary[]>([]),
  loading = ref(false),
  error = ref(false),
  page = ref(0),
  hasMore = ref(true)
let request: AbortController | undefined
const items = computed(() =>
  [...rows.value]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((r) => ({
      id: r.id,
      label: r.name,
      description: `${r.symbol} · ${r.execution_timeframe} · ${r.start_at.slice(0, 10)}`,
    })),
)
function reset() {
  request?.abort()
  rows.value = []
  page.value = 0
  hasMore.value = true
  loading.value = false
  error.value = false
}
watch([() => props.conversationId, () => props.owner], reset)
async function load() {
  if (loading.value || !hasMore.value || !props.owner) return
  const pending = new AbortController()
  request = pending
  loading.value = true
  error.value = false
  try {
    const result = await api.list(props.conversationId, page.value + 1, pending.signal)
    if (pending.signal.aborted) return
    rows.value = [...new Map([...rows.value, ...result.items].map((r) => [r.id, r])).values()]
    page.value = result.page
    hasMore.value = result.page < result.total_pages
  } catch {
    if (!pending.signal.aborted) error.value = true
  } finally {
    if (!pending.signal.aborted) loading.value = false
  }
}
function select(id: string) {
  const row = rows.value.find((r) => r.id === id)
  if (row && id !== props.id) emit('select', row)
}
function expanded(open: boolean) {
  emit('expanded', open)
  if (open && !page.value) void load()
}
onBeforeUnmount(reset)
</script>
<template>
  <USelect
    :model-value="id ?? undefined"
    :disabled="!id"
    :items="items"
    value-key="id"
    variant="none"
    size="sm"
    class="strategy-version-trigger"
    :aria-label="t('replay.selectReplay')"
    :title="name"
    :content="{ align: 'start', position: 'popper', sideOffset: 6 }"
    :ui="{
      content: 'strategy-version-select ring-0',
      viewport: 'p-1.5',
      item: 'strategy-version-option',
      itemLabel: 'strategy-version-option-label',
      itemDescription: 'strategy-version-option-description',
      trailing: 'static p-0 shrink-0',
    }"
    @update:model-value="select"
    @update:open="expanded"
  >
    <span
      :id="titleId"
      class="strategy-version-title"
      >{{ name }}</span
    >
    <template #trailing
      ><UIcon
        name="i-lucide-chevrons-up-down"
        aria-hidden="true"
    /></template>
    <template #content-bottom
      ><button
        v-if="hasMore || error"
        class="strategy-version-retry"
        :disabled="loading"
        @click.stop="load"
      >
        {{ t(loading ? 'common.loading' : error ? 'common.retry' : 'replay.loadMore') }}
      </button></template
    >
  </USelect>
</template>
