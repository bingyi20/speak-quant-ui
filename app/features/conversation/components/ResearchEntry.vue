<script setup lang="ts">
import { useResearchEntry } from '../composables/useResearchEntry'
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
const { draft, notice, submit } = useResearchEntry()
const { t } = useI18n()
const composing = ref(false)
function keydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !composing.value) {
    event.preventDefault()
    submit()
  }
}
</script>
<template>
  <div class="research-entry">
    <form
      class="research-composer"
      @submit.prevent="submit"
    >
      <label
        :for="`research-${compact ? 'compact' : 'full'}`"
        class="sr-only"
        >{{ $t('research.label') }}</label
      >
      <textarea
        :id="`research-${compact ? 'compact' : 'full'}`"
        v-model="draft"
        :placeholder="$t('research.placeholder')"
        :rows="compact ? 2 : 3"
        @keydown="keydown"
        @compositionstart="composing = true"
        @compositionend="composing = false"
      />
      <div class="composer-bottom">
        <span>{{ $t('research.hint') }}</span
        ><button
          type="submit"
          class="send-button"
          :disabled="!draft.trim()"
          :aria-label="$t('research.send')"
        >
          <UIcon name="i-lucide-arrow-up" />
        </button>
      </div>
    </form>
    <p
      v-if="notice"
      class="inline-notice"
      role="status"
    >
      {{ notice }}
    </p>
    <div
      v-if="!compact"
      class="quick-examples"
    >
      <button
        v-for="n in 4"
        :key="n"
        @click="draft = t(`research.prompt${n}`)"
      >
        <svg
          viewBox="0 0 64 28"
          fill="none"
          aria-hidden="true"
        >
          <path
            :d="
              [
                'M2 24L12 19L20 21L28 11L39 15L47 6L56 10L63 2',
                'M2 25L13 23L24 24L32 21L40 23L46 10L53 12L63 2',
                'M2 6L13 16L23 23L33 24L43 19L52 6L63 9',
                'M2 24L13 18L22 20L32 12L44 14L53 5L63 2',
              ][n - 1]
            "
            stroke="currentColor"
            stroke-width="1.6"
          /></svg
        ><span>{{ $t(`research.example${n}`) }}<UIcon name="i-lucide-arrow-up-right" /></span>
      </button>
    </div>
  </div>
</template>
