<script setup lang="ts" generic="T extends string">
import type { DropdownMenuItem } from '@nuxt/ui'
const props = defineProps<{
  label: string
  options: { label: string; value: T }[]
}>()
const model = defineModel<T>({ required: true })
const selected = computed(() => props.options.find((option) => option.value === model.value)?.label)
const items = computed<DropdownMenuItem[]>(() =>
  props.options.map((option) => ({
    label: option.label,
    type: 'checkbox',
    checked: option.value === model.value,
    onSelect: () => {
      model.value = option.value
    },
  })),
)
</script>
<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'end', sideOffset: 6, collisionPadding: 12 }"
    :ui="{
      content: 'preference-menu ring-0',
      viewport: 'p-0 divide-y-0',
      group: 'p-0',
      item: 'preference-menu-item',
      itemTrailingIcon: 'preference-menu-check',
    }"
  >
    <button
      type="button"
      class="preference-select"
      :aria-label="label"
    >
      <span>{{ selected }}</span>
      <UIcon name="i-lucide-chevron-down" />
    </button>
  </UDropdownMenu>
</template>
