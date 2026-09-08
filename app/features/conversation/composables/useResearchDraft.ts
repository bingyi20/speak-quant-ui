import { computed, onMounted, watch, type MaybeRefOrGetter, toValue } from 'vue'
import { useState } from '#app'
import { useAuthStore } from '~/features/auth'
import { readStorage, writeStorage } from '~/lib/storage/safe-storage'

export function useResearchDraft(conversationId?: MaybeRefOrGetter<string>) {
  const auth = useAuthStore()
  const drafts = useState<Record<string, string>>('research-drafts', () => ({}))
  const key = computed(
    () =>
      `trade-research-draft:${auth.user?.id ?? 'anonymous'}${toValue(conversationId) ? `:${toValue(conversationId)}` : ''}`,
  )
  let mounted = false
  function hydrate() {
    if (!mounted) return
    let value: string | null = null
    try {
      value = readStorage(sessionStorage, key.value, (v): v is string => typeof v === 'string')
    } catch {
      /* optional storage */
    }
    if (value !== null || !(key.value in drafts.value)) drafts.value[key.value] = value ?? ''
  }
  onMounted(() => {
    mounted = true
    hydrate()
  })
  watch(key, hydrate, { flush: 'sync' })
  watch(
    () => auth.user?.id,
    () => {
      drafts.value = {}
      hydrate()
    },
    { flush: 'sync' },
  )
  return computed({
    get: () => drafts.value[key.value] ?? '',
    set: (value: string) => {
      drafts.value[key.value] = value
      if (import.meta.client) {
        try {
          writeStorage(sessionStorage, key.value, value || null)
        } catch {
          /* optional storage */
        }
      }
    },
  })
}
