<script setup lang="ts">
import type { ReplayInsight } from '../types'
import { formatDateTime } from '~/lib/format'
defineProps<{ insights: readonly ReplayInsight[]; time?: number }>()
const { t } = useI18n()
</script>
<template>
  <div class="replay-insight-popover">
    <time v-if="time !== undefined">{{ formatDateTime(time * 1000) }}</time>
    <article
      v-for="insight in insights"
      :key="insight.id"
    >
      <h4>{{ insight.title }}</h4>
      <span
        v-if="!insight.is_validated"
        class="replay-unvalidated"
        >{{ t('replay.unvalidated') }}</span
      >
      <p>{{ insight.content }}</p>
      <p
        v-if="typeof insight.evidence?.summary === 'string'"
        class="replay-insight-evidence"
      >
        {{ insight.evidence.summary }}
      </p>
      <template v-if="insight.suggestion"
        ><h5>{{ t('replay.suggestion') }}</h5>
        <p>{{ insight.suggestion }}</p></template
      >
      <template v-if="insight.tradeoff"
        ><h5>{{ t('replay.tradeoff') }}</h5>
        <p>{{ insight.tradeoff }}</p></template
      >
    </article>
  </div>
</template>
