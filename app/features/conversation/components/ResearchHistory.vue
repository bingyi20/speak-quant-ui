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
const targetId = ref('')
const target = computed(() => history.items.find((item) => item.id === targetId.value))
const groups = computed(() => [
  {
    key: 'favorites',
    label: t('history.favorites'),
    items: history.favorites,
    collapsed: history.favoritesCollapsed,
  },
  {
    key: 'history',
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
onMounted(() => history.initializePreview())

function toggleGroup(key: string) {
  if (key === 'favorites') history.favoritesCollapsed = !history.favoritesCollapsed
  else history.historyCollapsed = !history.historyCollapsed
}
function startRename(item: ConversationSummary) {
  editingId.value = item.id
  menuId.value = null
}
function finishRename(title: string | null, restore: boolean) {
  const id = editingId.value
  if (!id) return
  const item = history.items.find((item) => item.id === id)
  if (title && title !== item?.title) history.rename(id, title)
  editingId.value = null
  if (restore) nextTick(() => focusItem(id))
}
function requestDelete(item: ConversationSummary) {
  targetId.value = item.id
  dialogOpen.value = true
  menuId.value = null
}
function menuItems(item: ConversationSummary): DropdownMenuItem[][] {
  return [
    [
      {
        label: t(item.is_favorite ? 'history.unpin' : 'history.pin'),
        icon: item.is_favorite ? 'i-lucide-pin-off' : 'i-lucide-pin',
        onSelect: () => {
          menuId.value = null
          history.toggleFavorite(item.id)
        },
      },
      {
        label: t('history.rename'),
        icon: 'i-lucide-square-pen',
        onSelect: () => startRename(item),
      },
    ],
    [
      {
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
  history.remove(targetId.value)
  if (route.params.id === targetId.value) await navigateTo('/new-task')
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
            >
              <UIcon name="i-lucide-ellipsis" />
            </button>
          </UDropdownMenu>
        </div>
        <p
          v-if="!group.items.length"
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
      @after:leave="restoreFocus"
    >
      <template #body>
        <div class="history-dialog-actions">
          <button
            type="button"
            class="outline-button"
            @click="dialogOpen = false"
          >
            {{ $t('common.cancel') }}
          </button>
          <button
            type="button"
            class="primary-button history-delete-button"
            @click="remove"
          >
            {{ $t('history.delete') }}
          </button>
        </div>
      </template>
    </UModal>
  </nav>
</template>
