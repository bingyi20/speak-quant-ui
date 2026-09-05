<script setup lang="ts">
import { renderMarkdown } from '~/lib/format/markdown'
const props = defineProps<{ content: string }>()
const html = computed(() => renderMarkdown(props.content))
</script>
<!-- Content is sanitized by the shared SSR/client renderer. -->
<!-- eslint-disable vue/no-v-html -->
<template>
  <div
    class="markdown-content"
    v-html="html"
  />
</template>
