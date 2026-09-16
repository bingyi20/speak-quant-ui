<script setup lang="ts">
import { computed } from 'vue'
import { formatDecimal, formatRatio } from '~/lib/format'
import MarkdownContent from '~/components/common/MarkdownContent.vue'
import type { ReplayDetail } from '../types'
const props = defineProps<{ detail: ReplayDetail | null; loading: boolean; error: string }>()
defineEmits<{ retry: [] }>()
const { t, locale } = useI18n()
const metrics = computed<[string, string | number][]>(() => {
  const result = props.detail?.result
  return result
    ? [
        [t('strategy.netReturn'), formatRatio(result.net_return_rate, locale.value)],
        [t('strategy.drawdown'), formatRatio(result.max_drawdown_rate, locale.value)],
        [t('strategy.trades'), result.trade_count],
        [t('strategy.winRate'), formatRatio(result.win_rate, locale.value)],
        [t('strategy.netProfit'), formatDecimal(result.net_profit, locale.value)],
        [t('strategy.fees'), formatDecimal(result.total_fee, locale.value)],
      ]
    : []
})
const sections = computed(() =>
  (
    [
      [t('strategy.resultSummary'), props.detail?.result_summary],
      [t('strategy.researchGoal'), props.detail?.research_goal],
      [t('strategy.changes'), props.detail?.change_summary],
      [t('strategy.insight'), props.detail?.validated_insight],
      [t('strategy.limitations'), props.detail?.risk_and_limitation],
    ] satisfies [string, string | null | undefined][]
  ).filter((item): item is [string, string] => !!item[1]),
)
</script>
<template>
  <div class="replay-detail-content">
    <p
      v-if="loading"
      class="detail-state"
      role="status"
    >
      {{ t('common.loading') }}
    </p>
    <div
      v-else-if="error"
      class="detail-state"
      role="alert"
    >
      <p>{{ t(error) }}</p>
      <button
        class="text-button"
        @click="$emit('retry')"
      >
        {{ t('common.retry') }}
      </button>
    </div>
    <template v-else-if="detail">
      <div class="replay-detail-conditions">
        <span>{{ detail.conditions.symbol }} · {{ detail.strategy.execution_timeframe }}</span>
        <span
          >{{ detail.conditions.start_at.slice(0, 10) }} —
          {{ detail.conditions.end_at.slice(0, 10) }}</span
        >
        <span>{{ detail.strategy.name }}</span>
      </div>
      <p
        v-if="detail.result_type === 'no_trades'"
        class="strategy-status"
      >
        {{ t('strategy.noTrades') }}
      </p>
      <dl
        v-if="detail.result"
        class="replay-detail-metrics"
      >
        <div
          v-for="[label, value] in metrics"
          :key="label"
        >
          <dt>{{ label }}</dt>
          <dd>{{ value }}</dd>
        </div>
      </dl>
      <p
        v-else
        class="detail-state"
        role="status"
      >
        {{ detail.error?.message || t(`strategy.replayStatus.${detail.status}`) }}
      </p>
      <section
        v-for="[title, content] in sections"
        :key="title"
        class="replay-detail-section"
      >
        <h3>{{ title }}</h3>
        <MarkdownContent :content="content!" />
      </section>
    </template>
  </div>
</template>
