<script setup lang="ts">
import { computed, type ObjectDirective } from 'vue'
import hljs from 'highlight.js/lib/core'
import python from 'highlight.js/lib/languages/python'
import sanitizeHtml from 'sanitize-html'
import { patchSanitizedHtml } from '~/lib/format/patch-sanitized-html'
hljs.registerLanguage('python', python)
const props = defineProps<{ content: string; language: string }>()
const html = computed(() =>
  sanitizeHtml(hljs.highlight(props.content, { language: 'python', ignoreIllegals: true }).value, {
    allowedTags: ['span'],
    allowedAttributes: { span: ['class'] },
    allowedClasses: { span: [/^hljs-[a-z_-]+$/, 'function_', 'class_', 'inherited__'] },
  }),
)
const vCode: ObjectDirective<HTMLElement, string> = {
  beforeMount: (el, { value }) => patchSanitizedHtml(el, value),
  updated: (el, { value }) => patchSanitizedHtml(el, value),
}
</script>
<template>
  <div
    class="strategy-code-scroll"
    tabindex="0"
    :aria-label="$t('strategy.code')"
  >
    <div
      class="strategy-code-lines"
      aria-hidden="true"
    >
      <span
        v-for="line in content.split('\n').length"
        :key="line"
        >{{ line }}</span
      >
    </div>
    <pre><code v-code="html" /></pre>
  </div>
</template>
