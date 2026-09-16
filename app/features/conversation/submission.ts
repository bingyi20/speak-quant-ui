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
  referenceLabel?: string
  createdAt: number
  phase: 'ready' | 'sending' | 'failed' | 'accepted'
  autoContinue?: boolean
  rejected?: boolean
  acceptedConversationId?: string
}
export const submissionExpired = (s: PendingSubmission) =>
  Date.now() - s.createdAt >= 23 * 60 * 60 * 1000
const storageKey = (owner: string) => `trade-pending-submission:${owner}`
export function isReplayMessageContext(value: unknown): boolean {
  if (!isRecord(value)) return false
  const keys = ['replay_id', 'trade_id', 'fill_id', 'insight_id', 'timestamp']
  if (Object.keys(value).some((key) => !keys.includes(key))) return false
  if (typeof value.replay_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.replay_id))
    return false
  for (const key of ['trade_id', 'fill_id', 'insight_id'])
    if (
      value[key] !== undefined &&
      (typeof value[key] !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value[key] as string))
    )
      return false
  return (
    value.timestamp === undefined ||
    (typeof value.timestamp === 'string' &&
      /^\d{4}-\d{2}-\d{2}T/.test(value.timestamp) &&
      Number.isFinite(Date.parse(value.timestamp)))
  )
}
export function readInvalidReferenceDraft(owner: string, conversationId: string): string | null {
  try {
    const value = readStorage(sessionStorage, storageKey(owner), isRecord)
    if (
      value?.owner === owner &&
      value.conversationId === conversationId &&
      isRecord(value.body) &&
      value.body.context !== undefined &&
      !isReplayMessageContext(value.body.context)
    )
      return typeof value.body.content === 'string' ? value.body.content : ''
  } catch {
    /* optional storage */
  }
  return null
}
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
      if (v.body.context !== undefined && !isReplayMessageContext(v.body.context)) return false
      if (v.referenceLabel !== undefined && typeof v.referenceLabel !== 'string') return false
      if (v.kind === 'create')
        return typeof v.body.content === 'string' && v.body.context === undefined
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
