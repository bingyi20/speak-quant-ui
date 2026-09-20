<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  useTemplateRef,
  watch,
} from 'vue'
import SplitPane from '~/components/common/SplitPane.vue'
import { useConversation } from '../composables/useConversation'
import { pendingClarification } from '../clarification'
import type { MessageCard } from '../types'
import type { ReplayQuestionReference } from '~/features/replay/types'
import MessageList from './MessageList.vue'
import MessageComposer from './MessageComposer.vue'
import ClarificationQuestions from './ClarificationQuestions.vue'
import ConversationAssetListPanel from './ConversationAssetListPanel.vue'
import ConversationAssetDetailPanel from './ConversationAssetDetailPanel.vue'
const props = defineProps<{ conversationId: string }>()
const {
  draft,
  replayReference,
  setReplayReference,
  invalidReference,
  messages,
  loading,
  loadError,
  load,
  hasMore,
  loadingMore,
  moreError,
  loadMore,
  blocked,
  waiting,
  run,
  send,
  sendError,
  submitting,
  pending,
  otherPending,
  canEditPending,
  retrySend,
  dismissPending,
  assets,
  assetsLoading,
  assetsError,
  loadAssets,
} = useConversation(props.conversationId)
const { active, reconnecting, error: runError, state } = run
const assetRevision = ref(0)
watch(active, (value, previous) => {
  if (previous && !value) assetRevision.value++
})
const questions = computed(() => pendingClarification(messages.value))
const questionCount = computed(
  () => questions.value?.cards.reduce((total, card) => total + card.data.questions.length, 0) ?? 0,
)
const questionsExpanded = ref(true)
const composer = useTemplateRef<InstanceType<typeof MessageComposer>>('composer')
const resumeButton = useTemplateRef<HTMLButtonElement>('resumeButton')
let cancelCollapse: (() => void) | undefined
async function collapseQuestions(element: Element, done: () => void) {
  cancelCollapse?.()
  if (questionsExpanded.value || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    done()
    return
  }
  const card = element as HTMLElement
  const from = card.getBoundingClientRect()
  let cancelled = false
  let animation: Animation | undefined
  const cleanup = () => {
    cancelled = true
    animation?.cancel()
    done()
  }
  cancelCollapse = cleanup
  // Keep the departing card out of layout while the composer reveals the actual destination.
  Object.assign(card.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: '0',
    pointerEvents: 'none',
    zIndex: '50',
    transformOrigin: 'center',
  })
  card.inert = true
  card.setAttribute('aria-hidden', 'true')
  await nextTick()
  if (cancelled) return
  const destination = resumeButton.value
  if (!destination) {
    cleanup()
    return
  }
  const to = destination.getBoundingClientRect()
  const x = to.left + to.width / 2 - from.left - from.width / 2
  const y = to.top + to.height / 2 - from.top - from.height / 2
  try {
    animation = card.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${x}px, ${y}px) scale(0.08)`, opacity: 0 },
      ],
      { duration: 240, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
    )
    await animation.finished
  } catch {
    // Reopening, navigation or unmount can interrupt the visual transition.
  } finally {
    cleanup()
    if (cancelCollapse === cleanup) cancelCollapse = undefined
  }
}
watch(questionsExpanded, (expanded) => {
  if (expanded) cancelCollapse?.()
})
onBeforeUnmount(() => cancelCollapse?.())
watch(
  () => questions.value?.messageId,
  () => {
    questionsExpanded.value = true
  },
)
const tools = computed(() => [...state.tools.values()])
const listOpen = ref(false)
const detailOpen = ref(false)
const listVisible = ref(false)
const detailVisible = ref(false)
const open = computed(() => listOpen.value || detailOpen.value)
const fullscreen = ref(false)
const detailMenuOpen = ref(false)
const detailSelection = ref(0)
const replayAutoKey = ref<string | null>(null)
const narrow = ref(false)
const mobile = ref(false)
const panelId = useId()
const detailPanelId = useId()
const assetsButton = useTemplateRef<HTMLButtonElement>('assetsButton')
const ratio = ref(52)
const selected = ref<{ messageId: string; cardId: string } | null>(null)
const selectedAsset = ref<{ type: string; resourceId: string } | null>(null)
const card = computed<MessageCard | null>(() => {
  if (selected.value)
    return (
      messages.value
        .find((m) => m.id === selected.value!.messageId)
        ?.cards.find((c) => c.id === selected.value!.cardId) ?? null
    )
  const selection = selectedAsset.value
  if (!selection) return null
  const resource =
    selection.type === 'strategy_card'
      ? assets.value?.strategy
      : assets.value?.replays.items.find((r) => r.id === selection.resourceId)
  if (!resource || resource.id !== selection.resourceId) return null
  return {
    id: `asset:${resource.id}`,
    type: selection.type,
    resource_id: resource.id,
    title: resource.name,
    status: 'status' in resource ? resource.status : '',
    summary: 'symbol' in resource ? `${resource.symbol} · ${resource.execution_timeframe}` : null,
    data: null,
  }
})
const detailModal = computed(() => narrow.value || fullscreen.value)
const modal = computed(
  () => (detailVisible.value && detailModal.value) || (listVisible.value && mobile.value),
)
const root = useTemplateRef<HTMLElement>('root')
watch(
  [fullscreen, detailOpen],
  ([isFullscreen, isOpen], _, onCleanup) => {
    if (!isFullscreen || !isOpen) return
    const workspace = root.value?.closest<HTMLElement>('.workspace-shell')
    if (!workspace) return
    const wasInert = workspace.inert
    workspace.inert = true
    onCleanup(() => {
      workspace.inert = wasInert
    })
  },
  { flush: 'post' },
)
const inputDock = useTemplateRef<HTMLElement>('inputDock')
const inputHeight = ref(160)
let inputObserver: ResizeObserver | undefined
let trigger: HTMLElement | null = null
let query: MediaQueryList | undefined
let mobileQuery: MediaQueryList | undefined
function syncNarrow() {
  narrow.value = query?.matches ?? false
  mobile.value = mobileQuery?.matches ?? false
}
function rememberTrigger() {
  if (!open.value)
    trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
}
function focusPanel(selector: string) {
  void nextTick(() =>
    (selector === '.asset-detail-panel'
      ? document.getElementById(detailPanelId)
      : root.value?.querySelector(selector)
    )
      ?.querySelector<HTMLButtonElement>('button')
      ?.focus({ preventScroll: true }),
  )
}
function showDetail() {
  detailSelection.value++
  listOpen.value = false
  detailVisible.value = true
  detailOpen.value = true
  focusPanel('.asset-detail-panel')
}
function openCard(messageId: string, value: MessageCard) {
  handledReplayCompletion = run.replayCompletion.value?.key ?? null
  replayAutoKey.value = null
  rememberTrigger()
  selected.value = { messageId, cardId: value.id }
  selectedAsset.value = null
  showDetail()
}
function openAsset(value: MessageCard) {
  handledReplayCompletion = run.replayCompletion.value?.key ?? null
  replayAutoKey.value = null
  rememberTrigger()
  selected.value = null
  selectedAsset.value = value.resource_id
    ? { type: value.type, resourceId: value.resource_id }
    : null
  showDetail()
}
function showAssets() {
  handledReplayCompletion = run.replayCompletion.value?.key ?? null
  rememberTrigger()
  detailOpen.value = false
  listVisible.value = true
  listOpen.value = true
  focusPanel('.asset-list-panel')
  void loadAssets()
}
function toggleAssets() {
  if (listOpen.value) close()
  else showAssets()
}
function close() {
  handledReplayCompletion = run.replayCompletion.value?.key ?? null
  replayAutoKey.value = null
  detailMenuOpen.value = false
  listOpen.value = false
  detailOpen.value = false
  void nextTick(() => {
    const destination =
      trigger?.isConnected && !trigger.closest('.chat-asset-panel') ? trigger : assetsButton.value
    destination?.focus({ preventScroll: true })
  })
}
let handledReplayCompletion: string | null = null
watch([run.replayCompletion, active], ([completion, streaming]) => {
  // The same response may ask a question after producing the completed card.
  // Settle the turn first so automatic navigation cannot cover that question.
  if (!completion || streaming || completion.key === handledReplayCompletion) return
  handledReplayCompletion = completion.key
  if (
    questions.value ||
    document.hidden ||
    matchMedia('(prefers-reduced-motion: reduce)').matches ||
    detailOpen.value ||
    listOpen.value ||
    detailMenuOpen.value ||
    draft.value.trim() ||
    document.activeElement?.matches('textarea, input, [contenteditable="true"]')
  )
    return
  rememberTrigger()
  selected.value = { messageId: completion.messageId, cardId: completion.card.id }
  selectedAsset.value = null
  replayAutoKey.value = completion.key
  showDetail()
})
async function askFromReplay(reference: ReplayQuestionReference) {
  setReplayReference(reference)
  fullscreen.value = false
  if (narrow.value) {
    detailOpen.value = false
    trigger = null
  }
  await nextTick()
  await composer.value?.focus()
}
function afterListClosed() {
  if (!listOpen.value) listVisible.value = false
}
function afterDetailClosed() {
  if (detailOpen.value) return
  detailVisible.value = false
  fullscreen.value = false
  selected.value = null
  selectedAsset.value = null
}
function dismissTopPanel() {
  if (detailOpen.value && fullscreen.value) fullscreen.value = false
  else close()
}
function keydown(event: KeyboardEvent) {
  if (!open.value || event.defaultPrevented || detailMenuOpen.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    if (!event.repeat) dismissTopPanel()
    return
  }
  if (event.key !== 'Tab' || !modal.value) return
  const activePanel = detailOpen.value
    ? document.getElementById(detailPanelId)
    : root.value?.querySelector('.asset-list-panel')
  const elements = [
    ...(listOpen.value && assetsButton.value ? [assetsButton.value] : []),
    ...(activePanel?.querySelectorAll<HTMLElement>(
      'button:not(:disabled):not([tabindex="-1"]), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    ) ?? []),
  ].filter((el) => el.getClientRects().length && !el.closest('[inert], [hidden]'))
  const first = elements[0],
    last = elements.at(-1)
  if (
    event.shiftKey &&
    (document.activeElement === first || !activePanel?.contains(document.activeElement))
  ) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}
onMounted(() => {
  const measureInput = () => {
    if (inputDock.value) inputHeight.value = inputDock.value.getBoundingClientRect().height
  }
  measureInput()
  inputObserver = new ResizeObserver(measureInput)
  if (inputDock.value) inputObserver.observe(inputDock.value)
  query = matchMedia('(max-width: 1100px)')
  mobileQuery = matchMedia('(max-width: 760px)')
  syncNarrow()
  query.addEventListener('change', syncNarrow)
  mobileQuery.addEventListener('change', syncNarrow)
  document.addEventListener('keydown', keydown)
})
onBeforeUnmount(() => {
  inputObserver?.disconnect()
  query?.removeEventListener('change', syncNarrow)
  mobileQuery?.removeEventListener('change', syncNarrow)
  document.removeEventListener('keydown', keydown)
})
</script>
<template>
  <div
    ref="root"
    class="agent-workspace"
    :class="{ 'assets-open': open, 'assets-modal': modal }"
  >
    <Teleport
      to="#workspace-actions"
      defer
      ><span class="assets-toggle-wrap">
        <button
          ref="assetsButton"
          type="button"
          class="icon-button assets-toggle"
          :aria-label="$t('conversation.assets')"
          :aria-expanded="listOpen"
          :aria-controls="panelId"
          @click="toggleAssets"
        >
          <UIcon
            name="i-lucide-folder"
            aria-hidden="true"
          />
        </button>
        <span
          class="assets-toggle-tooltip"
          role="tooltip"
          >{{ $t('conversation.assetTitle') }}</span
        >
      </span></Teleport
    >
    <SplitPane
      v-model="ratio"
      :enabled="open"
      :resizable="detailOpen && !detailModal"
      :right-width="listOpen ? '396px' : undefined"
      :style="{
        '--asset-detail-width': `${100 - ratio}cqw`,
        '--split-motion':
          listOpen || (!detailOpen && listVisible)
            ? 'var(--motion-asset-list)'
            : 'var(--motion-asset-detail)',
      }"
      :min="35"
      :max="65"
    >
      <template #left>
        <section
          class="chat-column"
          :style="{ '--chat-input-height': `${inputHeight}px` }"
          :inert="(open && modal) || undefined"
        >
          <div
            v-if="loadError"
            class="chat-page-error"
            role="alert"
          >
            <UIcon name="i-lucide-message-square-warning" />
            <p>{{ $t(loadError) }}</p>
            <button
              v-if="loadError !== 'chat.notFound'"
              class="text-button"
              @click="load"
            >
              {{ $t('common.retry') }}</button
            ><NuxtLink
              v-else
              to="/new-task"
              class="text-button"
              >{{ $t('nav.new') }}</NuxtLink
            >
          </div>
          <MessageList
            v-else
            :messages="messages"
            :tools="tools"
            :loading="loading"
            :has-more="hasMore"
            :loading-more="loadingMore"
            :more-error="moreError"
            :waiting="waiting"
            :selected-card-id="open ? selected?.cardId : undefined"
            :retry-disabled="submitting"
            :load-more="loadMore"
            @open="openCard"
            @retry="retrySend"
          />
          <div
            ref="inputDock"
            class="conversation-input chat-input"
            :class="{ 'has-questions': questions && questionsExpanded }"
          >
            <div
              v-if="reconnecting"
              class="chat-connection"
              role="status"
            >
              <UIcon
                name="i-lucide-loader-circle"
                class="chat-spinner"
              />{{ $t('chat.reconnecting') }}
            </div>
            <div
              v-if="runError && (active || !messages.some((m) => m.status === 'failed'))"
              class="chat-error chat-inline-actions"
              role="alert"
            >
              {{ $t(runError)
              }}<button
                v-if="active"
                class="text-button"
                @click="run.retry"
              >
                {{ $t('common.retry') }}
              </button>
            </div>
            <div
              v-if="sendError"
              class="chat-error"
              role="alert"
            >
              {{ $t(sendError) }}
              <NuxtLink
                v-if="otherPending"
                :to="otherPending"
                class="text-button"
                >{{ $t('chat.openOriginal') }}</NuxtLink
              >
              <div
                v-if="pending"
                class="chat-inline-actions"
              >
                <button
                  class="text-button"
                  :disabled="submitting"
                  @click="retrySend"
                >
                  {{ $t('common.retry') }}</button
                ><button
                  v-if="canEditPending"
                  class="text-button"
                  :disabled="submitting"
                  @click="dismissPending"
                >
                  {{ $t('chat.editDraft') }}
                </button>
              </div>
            </div>
            <ClarificationQuestions
              v-if="questions"
              :key="questions.messageId"
              v-model:expanded="questionsExpanded"
              :group="questions"
              :conversation-id="conversationId"
              :blocked="blocked"
              @submit="send"
              @close="composer?.focus()"
              @collapse="collapseQuestions"
            />
            <div
              v-if="replayReference || invalidReference"
              class="replay-reference"
            >
              <UIcon
                name="i-lucide-chart-candlestick"
                aria-hidden="true"
              /><span>{{ replayReference?.label || $t('replay.errors.reference') }}</span
              ><button
                class="detail-icon-button"
                :aria-label="$t('replay.removeReference')"
                @click="setReplayReference(null)"
              >
                <UIcon name="i-lucide-x" />
              </button>
            </div>
            <MessageComposer
              ref="composer"
              v-model="draft"
              compact
              :max-rows="questions && questionsExpanded ? 4 : 16"
              :blocked="blocked"
              :placeholder="$t('chat.placeholder')"
              @submit="send()"
            >
              <template #before-send>
                <button
                  v-if="questions && !questionsExpanded"
                  ref="resumeButton"
                  type="button"
                  class="question-resume"
                  :aria-label="$t('chat.resumeQuestions', { count: questionCount })"
                  :title="$t('chat.resumeQuestions', { count: questionCount })"
                  @click="questionsExpanded = true"
                >
                  <UIcon
                    name="i-lucide-list-checks"
                    aria-hidden="true"
                  />
                  <span aria-hidden="true">{{ questionCount }}</span>
                </button>
              </template>
            </MessageComposer>
          </div>
        </section>
      </template>
      <template #right>
        <ConversationAssetListPanel
          :id="panelId"
          :open="listOpen"
          :assets="assets"
          :loading="assetsLoading"
          :error="assetsError"
          :modal="mobile"
          @close="close"
          @closed="afterListClosed"
          @retry="loadAssets()"
          @more="loadAssets((assets?.replays.page ?? 0) + 1)"
          @open="openAsset"
        />
        <ConversationAssetDetailPanel
          :id="detailPanelId"
          :conversation-id="conversationId"
          :revision="assetRevision"
          :autoplay-key="replayAutoKey"
          :selection="detailSelection"
          :open="detailOpen"
          :selected="card"
          :fullscreen="fullscreen"
          :modal="detailModal"
          @close="close"
          @escape="dismissTopPanel"
          @closed="afterDetailClosed"
          @menu="detailMenuOpen = $event"
          @question="askFromReplay"
          @fullscreen="fullscreen = !fullscreen"
        />
      </template>
    </SplitPane>
  </div>
</template>
