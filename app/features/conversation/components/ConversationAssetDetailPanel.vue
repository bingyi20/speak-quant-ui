<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import {
  useStrategyDetail,
  StrategyDetailContent,
  StrategyVersionSelect,
} from '~/features/strategy'
import { useReplayDetail, ReplayDetailContent, type ReplaySummary } from '~/features/replay'
import { useAuthStore } from '~/features/auth'
import RunnerDownloadDialog from '~/features/runner/components/RunnerDownloadDialog.vue'
import ReplayTitleSelect from '~/features/replay/components/ReplayTitleSelect.vue'
import type { ReplayQuestionReference } from '~/features/replay/types'
import type { MessageCard } from '../types'
const props = defineProps<{
  id: string
  conversationId: string
  revision: number
  selection: number
  open: boolean
  selected: MessageCard | null
  fullscreen: boolean
  modal: boolean
  autoplayKey?: string | null
}>()
const emit = defineEmits<{
  close: []
  closed: []
  fullscreen: []
  menu: [open: boolean]
  question: [reference: ReplayQuestionReference]
}>()
const auth = useAuthStore()
const { t } = useI18n()
const linkedNode = ref<string | null>(null)
const isStrategy = computed(() => props.selected?.type === 'strategy_card')
const nestedReplay = ref<ReplaySummary | null>(null)
const menuOpen = ref(false),
  layerOpen = ref(false),
  downloadOpen = ref(false)
watch([menuOpen, layerOpen, downloadOpen], ([menu, layer, download]) =>
  emit('menu', menu || layer || download),
)
const panel = useTemplateRef<HTMLElement>('panel')
const strategy = useStrategyDetail(
  () => props.conversationId,
  () => props.open && isStrategy.value,
  () => props.revision,
  () => props.selection,
)
const { current, detail, version, versions, historyLoading, historyError } = strategy
const linkedStrategy = useStrategyDetail(
  () => props.conversationId,
  () => props.open && !!linkedNode.value,
  () => props.revision,
  () => props.selection,
  () => linkedNode.value,
)
const replay = useReplayDetail(
  () =>
    !props.open
      ? null
      : (nestedReplay.value?.id ??
        (!isStrategy.value ? (props.selected?.resource_id ?? null) : null)),
  () => props.revision,
  () => props.autoplayKey ?? null,
  () => props.open && !linkedNode.value,
)
const { detail: replayDetail } = replay
const showingReplay = computed(
  () => !linkedNode.value && (!isStrategy.value || !!nestedReplay.value),
)
const title = computed(() =>
  showingReplay.value
    ? (replayDetail.value?.name ?? nestedReplay.value?.name ?? props.selected?.title)
    : (detail.value?.name ??
      versions.value.find((v) => v.id === version.value)?.name ??
      props.selected?.title),
)
watch([() => props.open, () => props.selected?.resource_id, () => props.selection], () => {
  nestedReplay.value = null
  linkedNode.value = null
  if (!props.open) {
    setMenu(false)
    layerOpen.value = false
  }
})
function openReplay(value: ReplaySummary) {
  replay.pause()
  linkedNode.value = null
  nestedReplay.value = value
  void nextTick(() => document.querySelector<HTMLButtonElement>('.asset-detail-back')?.focus())
}
function returnToStrategy() {
  replay.pause()
  const id = nestedReplay.value?.id
  nestedReplay.value = null
  void nextTick(() => {
    const rows = document.querySelectorAll<HTMLElement>('.strategy-replay-list [data-replay-id]')
    const row = [...rows].find((r) => r.dataset.replayId === id)
    row?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  })
}
function viewStrategy() {
  if (!replayDetail.value?.strategy.node_id) return
  replay.pause()
  linkedNode.value = replayDetail.value.strategy.node_id
}
function returnToReplay() {
  linkedNode.value = null
}
const downloadState = computed(() => (linkedNode.value ? linkedStrategy : strategy))
const downloadSource = computed(
  () =>
    [...(downloadState.value.detail.value?.replays ?? [])]
      .filter(
        (item) =>
          item.strategy_node_id === downloadState.value.selectedNodeId.value &&
          ['traded', 'no_trades'].includes(item.result_type),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0] ??
    null,
)
watch(
  [
    () => props.open,
    showingReplay,
    () => downloadSource.value?.id,
    () => downloadState.value.selectedNodeId.value,
  ],
  () => {
    downloadOpen.value = false
  },
)
watch(
  () => props.fullscreen,
  async () => {
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const scroll = [
      ...(panel.value?.querySelectorAll<HTMLElement>(
        '.strategy-detail-body, .replay-detail-content, .strategy-code-scroll',
      ) ?? []),
    ].map((element) => ({ element, top: element.scrollTop, left: element.scrollLeft }))
    await nextTick()
    for (const { element, top, left } of scroll) element.scrollTo(left, top)
    if (focused && panel.value?.contains(focused)) focused.focus({ preventScroll: true })
  },
)
function setMenu(open: boolean) {
  menuOpen.value = open
}
function escape(event: KeyboardEvent) {
  if (menuOpen.value || layerOpen.value || event.defaultPrevented) return
  event.stopPropagation()
  emit('close')
}
</script>
<template>
  <Teleport
    to="body"
    :disabled="!fullscreen"
  >
    <Transition
      name="asset-detail-reveal"
      @after-leave="$emit('closed')"
    >
      <section
        v-show="open"
        :id="id"
        ref="panel"
        class="asset-panel chat-asset-panel asset-detail-panel"
        :class="{ 'is-modal': modal, 'is-fullscreen': fullscreen }"
        :inert="!open || undefined"
        :aria-hidden="!open || undefined"
        :role="modal ? 'dialog' : 'region'"
        :aria-modal="modal || undefined"
        :aria-label="$t(showingReplay ? 'conversation.replay' : 'conversation.strategy')"
        @keydown.esc="escape"
      >
        <header
          class="asset-detail-header"
          :class="{ 'is-strategy-header': !showingReplay }"
        >
          <button
            v-if="linkedNode || (isStrategy && nestedReplay)"
            type="button"
            class="detail-icon-button asset-detail-back"
            :aria-label="$t(linkedNode ? 'replay.backToReplay' : 'strategy.backToStrategy')"
            @click="linkedNode ? returnToReplay() : returnToStrategy()"
          >
            <UIcon
              name="i-lucide-arrow-left"
              aria-hidden="true"
            />
          </button>
          <h2
            v-if="open && isStrategy && !nestedReplay && !linkedNode"
            class="asset-strategy-heading"
            :aria-labelledby="`${id}-strategy-title`"
          >
            <StrategyVersionSelect
              :title-id="`${id}-strategy-title`"
              :name="title"
              :selected="version"
              :versions="versions"
              :current-name="current?.name"
              :current-summary="current?.change_summary"
              :current-updated-at="current?.updated_at"
              :disabled="!current"
              :loading="historyLoading"
              :error="historyError"
              @select="strategy.selectVersion"
              @retry="strategy.loadHistory"
              @expanded="setMenu"
            />
          </h2>
          <h2
            v-else-if="linkedNode"
            class="asset-strategy-heading"
            :aria-labelledby="`${id}-linked-title`"
          >
            <StrategyVersionSelect
              :title-id="`${id}-linked-title`"
              :name="linkedStrategy.detail.value?.name"
              :selected="linkedStrategy.version.value"
              :versions="linkedStrategy.versions.value"
              :current-name="linkedStrategy.current.value?.name"
              :current-summary="linkedStrategy.current.value?.change_summary"
              :current-updated-at="linkedStrategy.current.value?.updated_at"
              :disabled="!linkedStrategy.current.value"
              :loading="linkedStrategy.historyLoading.value"
              :error="linkedStrategy.historyError.value"
              @select="linkedStrategy.selectVersion"
              @retry="linkedStrategy.loadHistory"
              @expanded="setMenu"
            />
          </h2>
          <h2
            v-else
            class="asset-replay-heading"
            :aria-labelledby="`${id}-replay-title`"
          >
            <ReplayTitleSelect
              :id="replayDetail?.id ?? nestedReplay?.id ?? selected?.resource_id ?? null"
              :title-id="`${id}-replay-title`"
              :conversation-id="conversationId"
              :name="title || $t('conversation.replay')"
              :owner="auth.user?.id ?? null"
              @select="openReplay"
              @expanded="setMenu"
            />
          </h2>
          <div class="asset-detail-actions">
            <template v-if="showingReplay">
              <UTooltip
                :text="t('replay.viewStrategy')"
                :delay-duration="400"
                ><button
                  class="detail-icon-button replay-strategy-action"
                  :aria-label="t('replay.viewStrategy')"
                  :disabled="!replayDetail?.strategy.node_id"
                  @click="viewStrategy"
                >
                  <UIcon name="i-lucide-file-code-2" /></button
              ></UTooltip>
            </template>
            <UTooltip
              v-else
              :text="t('replay.downloadRunner')"
              :delay-duration="400"
            >
              <button
                class="detail-icon-button"
                :aria-label="t('replay.downloadRunner')"
                :disabled="!downloadSource"
                @click="downloadOpen = true"
              >
                <UIcon name="i-lucide-download" />
              </button>
            </UTooltip>
            <UTooltip
              :text="$t(fullscreen ? 'common.exitFullscreen' : 'common.fullscreen')"
              :delay-duration="400"
            >
              <button
                type="button"
                class="detail-icon-button"
                :aria-label="$t(fullscreen ? 'common.exitFullscreen' : 'common.fullscreen')"
                @click="$emit('fullscreen')"
              >
                <UIcon
                  :name="fullscreen ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
                  aria-hidden="true"
                />
              </button>
            </UTooltip>
            <UTooltip
              :text="$t('common.close')"
              :delay-duration="400"
            >
              <button
                type="button"
                class="detail-icon-button"
                :aria-label="$t('common.close')"
                @click="$emit('close')"
              >
                <UIcon
                  name="i-lucide-x"
                  aria-hidden="true"
                />
              </button>
            </UTooltip>
          </div>
        </header>
        <StrategyDetailContent
          v-if="isStrategy"
          v-show="!nestedReplay && !linkedNode"
          :state="strategy"
          @open-replay="openReplay"
        />
        <StrategyDetailContent
          v-if="linkedNode"
          :state="linkedStrategy"
          @open-replay="openReplay"
        />
        <ReplayDetailContent
          v-if="!isStrategy || nestedReplay"
          v-show="showingReplay"
          :state="replay"
          :active="open && showingReplay"
          @menu="layerOpen = $event"
          @question="emit('question', $event)"
        />
        <RunnerDownloadDialog
          v-if="downloadSource && !showingReplay"
          v-model:open="downloadOpen"
          :node-id="downloadState.selectedNodeId.value"
          :replay-id="downloadSource.id"
          :name="downloadSource.name"
          :strategy-name="downloadState.detail.value?.name ?? ''"
          :summary="downloadState.detail.value?.change_summary"
          :symbol="downloadSource.symbol"
          :timeframe="downloadSource.execution_timeframe"
        />
      </section>
    </Transition>
  </Teleport>
</template>
<style scoped>
.asset-detail-panel {
  top: calc(8px - var(--workspace-toolbar-height));
  width: calc(var(--asset-detail-width) - 12px);
  z-index: 26;
  container-type: inline-size;
}
.asset-detail-panel.is-modal {
  width: calc(100% - 12px);
}
.asset-detail-panel.is-fullscreen {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100dvh;
  margin: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  z-index: 50;
}
.asset-detail-reveal-enter-active,
.asset-detail-reveal-leave-active {
  transition: transform var(--motion-asset-detail) cubic-bezier(0.2, 0, 0, 1);
}
.asset-detail-reveal-enter-from,
.asset-detail-reveal-leave-to {
  transform: translateX(calc(100% + 8px));
}
.asset-detail-reveal-leave-active {
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .asset-detail-reveal-enter-active,
  .asset-detail-reveal-leave-active {
    transition: none;
  }
}
</style>
