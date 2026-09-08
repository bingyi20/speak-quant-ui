<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ConversationSummary } from '../types'
import { useConversationHistoryStore } from '../history-store'
import HistoryRenameInput from './HistoryRenameInput.vue'
const emit = defineEmits<{
  (event: 'navigate'): void
  (event: 'interaction', active: boolean): void
}>()
const history = useConversationHistoryStore()
const route = useRoute()
const { t } = useI18n()
const instanceId = useId()
const root = useTemplateRef<HTMLElement>('root')
const menuId = ref<string | null>(null)
const dialogOpen = ref(false)
const dialogPresent = ref(false)
watch(
  dialogOpen,
  (open) => {
    if (open) dialogPresent.value = true
  },
  { flush: 'sync' },
)
const editingId = ref<string | null>(null)
const renameAttempt = ref(0)
const targetId = ref('')
const target = computed(() => history.items.find((item) => item.id === targetId.value))
const groups = computed(() => [
  {
    key: 'favorites',
    scope: 'favorite' as const,
    page: history.pages.favorite,
    label: t('history.favorites'),
    items: history.favorites,
    collapsed: history.favoritesCollapsed,
  },
  {
    key: 'history',
    scope: 'non_favorite' as const,
    page: history.pages.non_favorite,
    label: t('history.list'),
    items: history.history,
    collapsed: history.historyCollapsed,
  },
])
const busy = computed(
  () => menuId.value !== null || dialogPresent.value || editingId.value !== null,
)
watch(busy, (value) => emit('interaction', value), { flush: 'sync' })
onBeforeUnmount(() => emit('interaction', false))

function refreshHistory() {
  history.actionError = ''
  void history.refresh()
}
function toggleGroup(key: string) {
  if (key === 'favorites') history.favoritesCollapsed = !history.favoritesCollapsed
  else history.historyCollapsed = !history.historyCollapsed
}
function startRename(item: ConversationSummary) {
  history.actionError = ''
  editingId.value = item.id
  menuId.value = null
}
async function finishRename(title: string | null, restore: boolean) {
  const id = editingId.value
  if (!id) return
  const item = history.items.find((item) => item.id === id)
  if (title && title !== item?.title) {
    const saved = await history.rename(id, title)
    if (!saved) {
      renameAttempt.value++
      if (restore)
        nextTick(() =>
          root.value?.querySelector<HTMLInputElement>('.history-rename-input')?.focus(),
        )
      return
    }
  }
  editingId.value = null
  if (restore) nextTick(() => focusItem(id))
}
function requestDelete(item: ConversationSummary) {
  history.actionError = ''
  targetId.value = item.id
  dialogOpen.value = true
  menuId.value = null
}
function menuItems(item: ConversationSummary): DropdownMenuItem[][] {
  return [
    [
      {
        disabled: !!history.pendingId,
        label: t(item.is_favorite ? 'history.unpin' : 'history.pin'),
        icon: item.is_favorite ? 'i-lucide-pin-off' : 'i-lucide-pin',
        onSelect: () => {
          menuId.value = null
          void history.toggleFavorite(item.id)
        },
      },
      {
        disabled: !!history.pendingId,
        label: t('history.rename'),
        icon: 'i-lucide-square-pen',
        onSelect: () => startRename(item),
      },
    ],
    [
      {
        disabled: !!history.pendingId,
        label: t('history.delete'),
        icon: 'i-lucide-trash-2',
        class: 'history-menu-delete',
        onSelect: () => requestDelete(item),
      },
    ],
  ]
}
async function remove() {
  if (!target.value) return
  const id = targetId.value
  if (!(await history.remove(id))) return
  if (route.params.id === id) await navigateTo('/new-task')
  dialogOpen.value = false
}
function focusItem(id: string) {
  const links: NodeListOf<HTMLAnchorElement> | undefined =
    root.value?.querySelectorAll('.history-link')
  const link = Array.from(links ?? []).find((link) => link.dataset.id === id)
  ;(link ?? root.value?.querySelector<HTMLButtonElement>('.history-group-toggle'))?.focus()
}
function restoreFocus() {
  focusItem(targetId.value)
  dialogPresent.value = false
}
function closeMenuFocus(event: Event) {
  if (dialogOpen.value || editingId.value) event.preventDefault()
}
</script>
<template>
  <nav
    ref="root"
    class="sidebar-history"
    :aria-label="$t('nav.history')"
  >
    <p
      v-if="!history.enabled"
      class="history-empty"
    >
      {{ $t('history.offline') }}
    </p>
    <p
      v-if="history.actionError && !dialogOpen"
      role="alert"
      class="history-request-error"
    >
      {{ $t(history.actionError) }}
      <button
        type="button"
        class="history-load-more"
        :disabled="!!history.pendingId"
        @click="refreshHistory"
      >
        {{ $t('history.refresh') }}
      </button>
    </p>
    <section
      v-for="group in groups"
      :key="group.key"
      class="history-group"
    >
      <button
        type="button"
        class="history-group-toggle"
        :aria-expanded="!group.collapsed"
        :aria-controls="`${instanceId}-${group.key}`"
        @click="toggleGroup(group.key)"
      >
        <span>{{ group.label }}</span>
        <UIcon
          name="i-lucide-chevron-right"
          :class="{ 'is-expanded': !group.collapsed }"
        />
      </button>
      <div
        v-show="!group.collapsed"
        :id="`${instanceId}-${group.key}`"
        class="history-group-items"
      >
        <div
          v-for="item in group.items"
          :key="item.id"
          class="sidebar-item history-row"
          :class="{
            'is-selected': route.path === `/conversations/${item.id}`,
            'menu-open': menuId === item.id,
          }"
        >
          <HistoryRenameInput
            v-if="editingId === item.id"
            :title="item.title"
            :pending="history.pendingId === item.id"
            :retry-revision="renameAttempt"
            @commit="finishRename"
            @cancel="finishRename(null, $event)"
          />
          <NuxtLink
            v-else
            :to="`/conversations/${item.id}`"
            class="history-link"
            :data-id="item.id"
            :title="item.title"
            @click="emit('navigate')"
          >
            <span class="history-title">{{ item.title }}</span>
          </NuxtLink>
          <UDropdownMenu
            v-if="editingId !== item.id"
            :open="menuId === item.id"
            :items="menuItems(item)"
            :modal="false"
            :content="{
              align: 'end',
              sideOffset: 5,
              onCloseAutoFocus: closeMenuFocus,
            }"
            :ui="{
              content: 'history-menu ring-0',
              viewport: 'history-menu-viewport divide-y-0',
              group: 'history-menu-group',
              item: 'history-menu-item',
              itemLeadingIcon: 'history-menu-icon',
            }"
            @update:open="menuId = $event ? item.id : null"
          >
            <button
              type="button"
              class="history-more icon-button"
              :aria-label="$t('history.more', { title: item.title })"
              :disabled="!!history.pendingId"
            >
              <UIcon name="i-lucide-ellipsis" />
            </button>
          </UDropdownMenu>
        </div>
        <p
          v-if="group.page.loading"
          role="status"
          class="history-empty"
        >
          {{ $t('history.loading') }}
        </p>
        <div
          v-else-if="group.page.error"
          class="history-request-error"
          role="alert"
        >
          <span>{{ $t(group.page.error) }}</span>
          <button
            type="button"
            class="history-load-more"
            :disabled="!!history.pendingId"
            @click="history.retry(group.scope)"
          >
            {{ $t('history.retry') }}
          </button>
        </div>
        <button
          v-else-if="group.page.hasMore"
          type="button"
          class="history-load-more"
          :disabled="!!history.pendingId"
          @click="history.loadMore(group.scope)"
        >
          {{ $t('history.loadMore') }}
        </button>
        <p
          v-if="
            history.enabled &&
            group.page.page &&
            !group.page.loading &&
            !group.page.error &&
            !group.page.hasMore &&
            !group.items.length
          "
          class="history-empty"
        >
          {{ $t(group.key === 'favorites' ? 'history.noFavorites' : 'nav.historyEmpty') }}
        </p>
      </div>
    </section>
    <UModal
      v-model:open="dialogOpen"
      :title="$t('history.deleteTitle')"
      :description="$t('history.deleteDescription', { title: target?.title ?? '' })"
      :ui="{ content: 'history-dialog' }"
      :dismissible="!history.pendingId"
      :close="!history.pendingId"
      @after:leave="restoreFocus"
    >
      <template #body>
        <p
          v-if="history.actionError"
          role="alert"
          class="history-request-error"
        >
          {{ $t(history.actionError) }}
        </p>
        <div class="history-dialog-actions">
          <button
            type="button"
            class="outline-button"
            :disabled="!!history.pendingId"
            @click="dialogOpen = false"
          >
            {{ $t('common.cancel') }}
          </button>
          <button
            type="button"
            class="primary-button history-delete-button"
            :disabled="!!history.pendingId"
            @click="remove"
          >
            {{ $t(history.pendingId ? 'history.deleting' : 'history.delete') }}
          </button>
        </div>
      </template>
    </UModal>
  </nav>
</template>
