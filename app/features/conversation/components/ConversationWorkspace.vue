<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import SplitPane from '~/components/common/SplitPane.vue'
import { useConversation } from '../composables/useConversation'
import { pendingClarification } from '../clarification'
import type { MessageCard } from '../types'
import MessageList from './MessageList.vue'
import MessageComposer from './MessageComposer.vue'
import ClarificationQuestions from './ClarificationQuestions.vue'
import ConversationAssetPanel from './ConversationAssetPanel.vue'
const props = defineProps<{ conversationId: string }>()
const {
  draft,
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
const open = ref(false)
const fullscreen = ref(false)
const narrow = ref(false)
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
const modal = computed(() => narrow.value || fullscreen.value)
const root = useTemplateRef<HTMLElement>('root')
const inputDock = useTemplateRef<HTMLElement>('inputDock')
const inputHeight = ref(160)
let inputObserver: ResizeObserver | undefined
let trigger: HTMLElement | null = null
let query: MediaQueryList | undefined
function syncNarrow() {
  narrow.value = query?.matches ?? false
}
function show() {
  if (!open.value)
    trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  open.value = true
  void nextTick(() =>
    root.value
      ?.querySelector<HTMLButtonElement>('.chat-asset-panel button')
      ?.focus({ preventScroll: true }),
  )
}
function openCard(messageId: string, value: MessageCard) {
  selected.value = { messageId, cardId: value.id }
  selectedAsset.value = null
  show()
}
function openAsset(value: MessageCard) {
  selected.value = null
  selectedAsset.value = value.resource_id
    ? { type: value.type, resourceId: value.resource_id }
    : null
  show()
}
function showAssets() {
  selected.value = null
  selectedAsset.value = null
  show()
  void loadAssets()
}
function close() {
  open.value = false
  void nextTick(() => trigger?.isConnected && trigger.focus())
}
function keydown(event: KeyboardEvent) {
  if (!open.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key !== 'Tab' || !modal.value) return
  const elements = [
    ...(root.value?.querySelectorAll<HTMLElement>(
      '.chat-asset-panel button:not(:disabled), .chat-asset-panel [tabindex="0"]',
    ) ?? []),
  ]
  const first = elements[0],
    last = elements.at(-1)
  if (
    event.shiftKey &&
    (document.activeElement === first ||
      !root.value?.querySelector('.chat-asset-panel')?.contains(document.activeElement))
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
  syncNarrow()
  query.addEventListener('change', syncNarrow)
  document.addEventListener('keydown', keydown)
})
onBeforeUnmount(() => {
  inputObserver?.disconnect()
  query?.removeEventListener('change', syncNarrow)
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
      ><button
        class="text-button"
        :aria-expanded="open"
        @click="showAssets"
      >
        <UIcon name="i-lucide-panels-top-left" />{{ $t('conversation.assets') }}
      </button></Teleport
    >
    <SplitPane
      v-model="ratio"
      :enabled="open"
      :resizable="!modal"
      :min="35"
      :max="65"
      @closed="!open && (fullscreen = false)"
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
      <template #right
        ><ConversationAssetPanel
          :assets="assets"
          :loading="assetsLoading"
          :error="assetsError"
          :selected="card"
          :fullscreen="fullscreen"
          :modal="modal"
          @close="close"
          @back="showAssets"
          @fullscreen="fullscreen = !fullscreen"
          @retry="loadAssets()"
          @more="loadAssets((assets?.replays.page ?? 0) + 1)"
          @open="openAsset"
      /></template>
    </SplitPane>
  </div>
</template>
