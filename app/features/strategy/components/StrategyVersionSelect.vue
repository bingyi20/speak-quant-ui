<script setup lang="ts">
import { computed } from 'vue'
import { formatDate } from '~/lib/format'
import type { StrategyVersion } from '../types'
const props = defineProps<{
  titleId: string
  name?: string
  selected: string
  versions: StrategyVersion[]
  currentName?: string
  currentSummary?: string | null
  currentUpdatedAt?: string
  disabled: boolean
  loading: boolean
  error: string
}>()
const emit = defineEmits<{ select: [id: string]; retry: []; expanded: [open: boolean] }>()
const { t, locale } = useI18n()
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const shortDate = (value: string) =>
  new Intl.DateTimeFormat(locale.value, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(value))
const selectedVersion = computed(() => props.versions.find((v) => v.id === props.selected))
const title = computed(
  () =>
    (props.selected === 'current' ? props.currentSummary : selectedVersion.value?.change_summary) ||
    props.name ||
    t(props.selected === 'current' ? 'strategy.current' : 'strategy.historical'),
)
const description = computed(() =>
  [
    props.name !== title.value ? props.name : '',
    props.selected === 'current'
      ? t('strategy.current')
      : selectedVersion.value
        ? formatDate(selectedVersion.value.formed_at, locale.value, timeZone)
        : t('strategy.historical'),
  ]
    .filter(Boolean)
    .join(' · '),
)
const items = computed(() => [
  {
    id: 'current',
    label: props.currentSummary || props.currentName || t('strategy.current'),
    name: props.currentSummary ? props.currentName : '',
    date: props.currentUpdatedAt,
  },
  ...props.versions.map((version) => ({
    id: version.id,
    label: version.change_summary || version.name,
    name: version.change_summary ? version.name : '',
    date: version.formed_at,
  })),
])
</script>
<template>
  <USelect
    :model-value="selected"
    :items="items"
    value-key="id"
    :disabled="disabled"
    variant="none"
    size="sm"
    class="strategy-version-trigger"
    :aria-label="t('strategy.selectVersion')"
    :title="[title, description].filter(Boolean).join('\n')"
    :aria-description="[title, description].filter(Boolean).join(' · ')"
    :aria-busy="loading"
    :content="{ align: 'start', position: 'popper', sideOffset: 6, collisionPadding: 12 }"
    :ui="{
      content: 'strategy-version-select ring-0',
      viewport: 'p-1.5',
      group: 'p-0 gap-1',
      item: 'strategy-version-option',
      itemWrapper: 'min-w-0 flex-1',
      itemLabel: 'strategy-version-option-label',
      itemDescription: 'strategy-version-option-description',
      itemTrailing: 'self-start mt-0.5 w-[15px] shrink-0',
      itemTrailingIcon: 'strategy-version-option-check',
      trailing: 'static p-0 shrink-0',
    }"
    @update:model-value="emit('select', $event)"
    @update:open="emit('expanded', $event)"
  >
    <span
      :id="titleId"
      class="strategy-version-title"
      >{{ title }}</span
    >
    <template #item-description="{ item }">
      <span
        v-if="item.name"
        class="strategy-version-name"
        :title="item.name"
        >{{ item.name }}</span
      >
      <time
        v-if="item.date"
        class="strategy-version-date"
        :datetime="item.date"
        :title="formatDate(item.date, locale, timeZone)"
        >{{ shortDate(item.date) }}</time
      >
    </template>
    <template #trailing>
      <UIcon
        :name="loading ? 'i-lucide-loader-circle' : 'i-lucide-chevrons-up-down'"
        :class="{ 'chat-spinner': loading }"
        aria-hidden="true"
      />
    </template>
    <template
      v-if="error"
      #content-bottom
    >
      <button
        type="button"
        class="strategy-version-retry"
        :disabled="loading"
        @click="emit('retry')"
      >
        {{ t('strategy.retryVersions') }}
      </button>
    </template>
  </USelect>
</template>
