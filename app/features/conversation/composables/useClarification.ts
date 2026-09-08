import { onMounted, reactive, watch } from 'vue'
import { useAuthStore } from '~/features/auth'
import { readStorage, writeStorage } from '~/lib/storage/safe-storage'
import { isRecord } from '../agent-events'
import type { AnswerDrafts, ClarificationGroup } from '../clarification'

export function useClarification(group: () => ClarificationGroup, conversationId: string) {
  const auth = useAuthStore()
  const drafts = reactive<AnswerDrafts>({})
  const owner = auth.user?.id
  const key = () =>
    `trade-clarification-draft:${owner}:${conversationId}:${group().messageId}:${group()
      .cards.map((c) => c.card.id)
      .join(',')}`
  let mounted = false
  function validate() {
    const questions = group().cards.flatMap((c) => c.data.questions)
    for (const [id, draft] of Object.entries(drafts)) {
      const question = questions.find((q) => q.id === id)
      if (
        !question ||
        (draft.mode === 'custom' ? !question.allow_custom : !question.options.includes(draft.text))
      )
        Reflect.deleteProperty(drafts, id)
    }
  }
  onMounted(() => {
    try {
      const saved = readStorage(
        sessionStorage,
        key(),
        (value): value is AnswerDrafts =>
          isRecord(value) &&
          Object.values(value).every(
            (v) =>
              isRecord(v) &&
              ['option', 'custom'].includes(String(v.mode)) &&
              typeof v.text === 'string',
          ),
      )
      if (saved) Object.assign(drafts, saved)
    } catch {
      /* optional storage */
    }
    validate()
    mounted = true
  })
  watch(() => group().cards, validate, { deep: true })
  watch(
    drafts,
    () => {
      if (!mounted || auth.user?.id !== owner) return
      try {
        writeStorage(sessionStorage, key(), Object.keys(drafts).length ? drafts : null)
      } catch {
        /* optional storage */
      }
    },
    { deep: true, flush: 'sync' },
  )
  return drafts
}

export function clearClarificationDrafts(owner: string, conversationId: string, messageId: string) {
  try {
    const prefix = `trade-clarification-draft:${owner}:${conversationId}:${messageId}:`
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(prefix)) sessionStorage.removeItem(key)
  } catch {
    /* optional storage */
  }
}
