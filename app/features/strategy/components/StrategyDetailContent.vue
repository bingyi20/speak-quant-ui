<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, useId, useTemplateRef, watch } from 'vue'
import MarkdownContent from '~/components/common/MarkdownContent.vue'
import CopyButton from '~/components/ui/CopyButton.vue'
import StrategyReplayList from './StrategyReplayList.vue'
import type { StrategyDetailState } from '../detail-state'
import type { StrategyTab } from '../types'
import type { ReplaySummary } from '~/features/replay'
const StrategyCode = defineAsyncComponent(() => import('./StrategyCode.vue'))
const props = defineProps<{ state: StrategyDetailState }>()
defineEmits<{ openReplay: [replay: ReplaySummary] }>()
const {
  detail,
  version,
  tab,
  allReplays,
  replays,
  selectedNodeId,
  versionNames,
  loading,
  error,
  current,
} = props.state
const { t } = useI18n()
const uid = useId()
const body = useTemplateRef<HTMLElement>('body')
const tabs: StrategyTab[] = ['design', 'replays', 'code']
const tabIcons: Record<StrategyTab, string> = {
  design: 'i-lucide-file-text',
  replays: 'i-lucide-chart-no-axes-combined',
  code: 'i-lucide-code',
}
const status = computed(() => (version.value === 'current' ? current.value?.status : 'historical'))
function navigate(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  let index = tabs.indexOf(tab.value)
  index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
  const next = tabs[index]!
  props.state.selectTab(next)
  document.getElementById(`${uid}-${next}`)?.focus()
}
watch([version, tab, allReplays], () =>
  nextTick(() => {
    if (body.value) body.value.scrollTop = 0
  }),
)
</script>
<template>
  <div class="strategy-detail-content">
    <div
      class="strategy-tabs"
      role="tablist"
      :aria-label="t('strategy.sections')"
      @keydown="navigate"
    >
      <button
        v-for="item in tabs"
        :id="`${uid}-${item}`"
        :key="item"
        type="button"
        role="tab"
        :aria-selected="tab === item"
        :aria-controls="`${uid}-content`"
        :tabindex="tab === item ? 0 : -1"
        @click="state.selectTab(item)"
      >
        <UIcon
          :name="tabIcons[item]"
          aria-hidden="true"
        />
        {{ t(`strategy.${item}`) }}
      </button>
    </div>
    <div
      :id="`${uid}-content`"
      ref="body"
      class="strategy-detail-body"
      role="tabpanel"
      :aria-labelledby="`${uid}-${tab}`"
      :aria-busy="loading"
    >
      <div class="strategy-detail-inner">
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
            type="button"
            @click="state.retry()"
          >
            {{ t('common.retry') }}
          </button>
        </div>
        <template v-else-if="detail">
          <div
            v-if="tab === 'design'"
            class="strategy-document"
          >
            <MarkdownContent
              v-if="detail.design.content"
              class="markdown-prose"
              :content="detail.design.content"
            />
            <p
              v-else
              class="detail-state"
            >
              {{ t('strategy.noDesign') }}
            </p>
            <div class="strategy-document-footer">
              <span
                v-if="status === 'modified'"
                class="strategy-status"
                >{{ t('strategy.status.modified') }}</span
              >
              <CopyButton
                v-if="detail.design.content"
                :content="detail.design.content"
                :label="t('chat.copyMarkdown')"
              />
            </div>
          </div>
          <div
            v-else-if="tab === 'replays'"
            class="strategy-replays"
          >
            <div class="strategy-content-toolbar replay-scope-toolbar">
              <span class="strategy-status"
                >{{ t(allReplays ? 'strategy.allVersions' : 'strategy.selectedVersion') }} ·
                {{ replays.length }}</span
              >
              <button
                type="button"
                class="replay-scope-toggle"
                :aria-pressed="allReplays"
                @click="allReplays = !allReplays"
              >
                <UIcon
                  :name="allReplays ? 'i-lucide-filter' : 'i-lucide-layers'"
                  aria-hidden="true"
                />
                {{ t(allReplays ? 'strategy.onlySelected' : 'strategy.viewAll') }}
              </button>
            </div>
            <StrategyReplayList
              v-if="replays.length"
              :replays="replays"
              :all="allReplays"
              :selected-node-id="selectedNodeId"
              :names="versionNames"
              @open="$emit('openReplay', $event)"
            />
            <p
              v-else
              class="detail-state"
            >
              {{ t(allReplays ? 'strategy.noReplays' : 'strategy.noVersionReplays') }}
            </p>
          </div>
          <template v-else>
            <div class="strategy-content-toolbar">
              <span class="strategy-status">{{
                detail.code?.language ?? t(`strategy.status.${status}`)
              }}</span>
              <CopyButton
                v-if="detail.code"
                :content="detail.code.content"
                :label="t('strategy.copyCode')"
              />
            </div>
            <StrategyCode
              v-if="detail.code"
              :content="detail.code.content"
              :language="detail.code.language"
            />
            <p
              v-else
              class="detail-state"
            >
              {{ t('strategy.noCode') }}
            </p>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>
