<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import {
  useStrategyDetail,
  StrategyDetailContent,
  StrategyVersionSelect,
} from '~/features/strategy'
import { useReplayDetail, ReplayDetailContent, type ReplaySummary } from '~/features/replay'
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
}>()
const emit = defineEmits<{ close: []; closed: []; fullscreen: []; menu: [open: boolean] }>()
const isStrategy = computed(() => props.selected?.type === 'strategy_card')
const nestedReplay = ref<ReplaySummary | null>(null)
const menuOpen = ref(false)
const panel = useTemplateRef<HTMLElement>('panel')
const strategy = useStrategyDetail(
  () => props.conversationId,
  () => props.open && isStrategy.value,
  () => props.revision,
  () => props.selection,
)
const { current, detail, version, versions, historyLoading, historyError } = strategy
const replay = useReplayDetail(
  () =>
    !props.open
      ? null
      : (nestedReplay.value?.id ??
        (!isStrategy.value ? (props.selected?.resource_id ?? null) : null)),
  () => props.revision,
)
const { detail: replayDetail, loading: replayLoading, error: replayError } = replay
const showingReplay = computed(() => !isStrategy.value || !!nestedReplay.value)
const title = computed(() =>
  showingReplay.value
    ? (replayDetail.value?.name ?? nestedReplay.value?.name ?? props.selected?.title)
    : (detail.value?.name ??
      versions.value.find((v) => v.id === version.value)?.name ??
      props.selected?.title),
)
watch([() => props.open, () => props.selected?.resource_id, () => props.selection], () => {
  nestedReplay.value = null
  if (!props.open) setMenu(false)
})
function openReplay(value: ReplaySummary) {
  nestedReplay.value = value
  void nextTick(() => document.querySelector<HTMLButtonElement>('.asset-detail-back')?.focus())
}
function returnToStrategy() {
  const id = nestedReplay.value?.id
  nestedReplay.value = null
  void nextTick(() => {
    const rows = document.querySelectorAll<HTMLElement>('.strategy-replay-list [data-replay-id]')
    const row = [...rows].find((r) => r.dataset.replayId === id)
    row?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  })
}
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
  emit('menu', open)
}
function escape(event: KeyboardEvent) {
  if (menuOpen.value || event.defaultPrevented) return
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
            v-if="nestedReplay"
            type="button"
            class="detail-icon-button asset-detail-back"
            :aria-label="$t('strategy.backToStrategy')"
            @click="returnToStrategy"
          >
            <UIcon
              name="i-lucide-arrow-left"
              aria-hidden="true"
            />
          </button>
          <h2
            v-if="open && isStrategy && !nestedReplay"
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
            v-else
            :title="title"
          >
            {{ title }}
          </h2>
          <div class="asset-detail-actions">
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
          v-show="!nestedReplay"
          :state="strategy"
          @open-replay="openReplay"
        />
        <ReplayDetailContent
          v-if="showingReplay"
          :detail="replayDetail"
          :loading="replayLoading"
          :error="replayError"
          @retry="replay.load"
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
