<script setup lang="ts">
import { computed, type ObjectDirective } from 'vue'
import { renderMarkdown } from '~/lib/format/markdown'
import { patchSanitizedHtml } from '~/lib/format/patch-sanitized-html'
const props = defineProps<{ content: string }>()
const html = computed(() => renderMarkdown(props.content))
const vMarkdown: ObjectDirective<HTMLElement, string> = {
  beforeMount: (element, { value }) => patchSanitizedHtml(element, value),
  updated: (element, { value, oldValue }) => {
    if (value !== oldValue) patchSanitizedHtml(element, value)
  },
  getSSRProps: ({ value }) => ({ innerHTML: value }),
}
</script>
<!-- Content is sanitized by the shared SSR/client renderer. -->
<template>
  <div
    v-markdown="html"
    class="markdown-content"
  />
</template>
