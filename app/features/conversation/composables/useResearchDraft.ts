import { useAuthStore } from '~/features/auth'
import { readStorage, writeStorage } from '~/lib/storage/safe-storage'
export function useResearchDraft() {
  const auth = useAuthStore()
  const scope = computed(() => auth.user?.id ?? 'anonymous')
  const draft = useState<string>('research-draft', () => '')
  const key = (owner: string) => `trade-research-draft:${owner}`
  const read = (owner: string) =>
    readStorage(sessionStorage, key(owner), (v): v is string => typeof v === 'string') ?? ''
  onMounted(() => {
    draft.value = read(scope.value)
  })
  watch(
    scope,
    (owner, previous) => {
      if (!import.meta.client) return
      writeStorage(sessionStorage, key(previous), draft.value || null)
      draft.value = read(owner)
    },
    { flush: 'sync' },
  )
  watch(
    draft,
    (value) => {
      if (import.meta.client) writeStorage(sessionStorage, key(scope.value), value || null)
    },
    { flush: 'sync' },
  )
  return draft
}
