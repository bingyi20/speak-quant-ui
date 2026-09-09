import { readStorage, writeStorage } from '~/lib/storage/safe-storage'
import { isRecord } from './agent-events'
import type { MessageSubmission } from './types'

export interface PendingSubmission {
  key: string
  owner: string
  kind: 'create' | 'message'
  conversationId?: string
  body: MessageSubmission
  display: string
  createdAt: number
  phase: 'ready' | 'sending' | 'failed' | 'accepted'
  autoContinue?: boolean
  rejected?: boolean
  acceptedConversationId?: string
}
export const submissionExpired = (s: PendingSubmission) =>
  Date.now() - s.createdAt >= 23 * 60 * 60 * 1000
const storageKey = (owner: string) => `trade-pending-submission:${owner}`
export function readSubmission(owner: string) {
  try {
    return readStorage(sessionStorage, storageKey(owner), (v): v is PendingSubmission => {
      if (
        !isRecord(v) ||
        v.owner !== owner ||
        typeof v.key !== 'string' ||
        !v.key ||
        !['create', 'message'].includes(String(v.kind)) ||
        !isRecord(v.body) ||
        typeof v.display !== 'string' ||
        typeof v.createdAt !== 'number' ||
        !['ready', 'sending', 'failed', 'accepted'].includes(String(v.phase))
      )
        return false
      if (v.kind === 'create') return typeof v.body.content === 'string'
      if (typeof v.conversationId !== 'string') return false
      return (
        typeof v.body.content === 'string' ||
        (typeof v.body.reply_to_message_id === 'string' &&
          Array.isArray(v.body.structured_answers) &&
          v.body.structured_answers.every(
            (a) =>
              isRecord(a) &&
              typeof a.question_id === 'string' &&
              ((typeof a.value === 'string' && a.custom_text == null) ||
                (typeof a.custom_text === 'string' && a.value == null)),
          ))
      )
    })
  } catch {
    return null
  }
}
export function saveSubmission(owner: string, value: PendingSubmission | null) {
  try {
    writeStorage(sessionStorage, storageKey(owner), value)
  } catch {
    /* optional storage */
  }
}
export function transferGuestSubmission(owner: string) {
  const intent = readSubmission('anonymous')
  if (intent?.kind === 'create' && intent.phase === 'ready' && !submissionExpired(intent)) {
    saveSubmission(owner, { ...intent, owner })
  }
  saveSubmission('anonymous', null)
}

export function cancelGuestSubmission() {
  const intent = readSubmission('anonymous')
  if (intent?.kind !== 'create' || intent.phase !== 'ready') return
  try {
    writeStorage(sessionStorage, 'trade-research-draft:anonymous', intent.body.content ?? '')
  } catch {
    /* optional storage */
  }
  saveSubmission('anonymous', null)
}
