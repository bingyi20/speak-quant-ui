import { useResearchDraft } from './useResearchDraft'
export function useResearchEntry() {
  const draft = useResearchDraft()
  const { t } = useI18n()
  const notice = ref('')
  function submit() {
    if (draft.value.trim()) notice.value = t('research.notConnected')
  }
  return { draft, notice, submit }
}
