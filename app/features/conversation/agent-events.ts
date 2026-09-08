import { ApiError } from '~/lib/http/error'
import type { SseFrame } from '~/lib/sse/parser'
import type {
  MessageCard,
  RunStatus,
  SnapshotMessage,
  ToolStatus,
  ClarificationData,
} from './types'

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string'
const id = (v: unknown): v is string => text(v) && v.length > 0
const nullableText = (v: unknown) => v === null || text(v)
export const isRunStatus = (v: unknown): v is RunStatus =>
  ['queued', 'running', 'waiting_user', 'completed', 'failed', 'cancelled'].includes(String(v))
export const isTerminal = (v: RunStatus) => v !== 'queued' && v !== 'running'
export function isCard(v: unknown): v is MessageCard {
  return (
    isRecord(v) &&
    id(v.id) &&
    id(v.type) &&
    text(v.status) &&
    text(v.title) &&
    nullableText(v.resource_id) &&
    nullableText(v.summary) &&
    (v.data === null || isRecord(v.data))
  )
}
function isMessage(v: unknown): v is SnapshotMessage {
  return (
    isRecord(v) &&
    id(v.id) &&
    text(v.role) &&
    text(v.status) &&
    text(v.content) &&
    Array.isArray(v.cards) &&
    v.cards.every(isCard)
  )
}
function isTool(v: unknown): v is ToolStatus {
  return (
    isRecord(v) &&
    id(v.message_id) &&
    id(v.id) &&
    text(v.label) &&
    ['running', 'completed', 'failed'].includes(String(v.status))
  )
}
export function clarificationData(card: MessageCard): ClarificationData | null {
  const v = card.data
  if (
    card.type !== 'clarification_card' ||
    !v ||
    !Array.isArray(v.questions) ||
    !v.questions.length ||
    typeof v.answered !== 'boolean' ||
    !Array.isArray(v.answers)
  )
    return null
  if (
    !v.questions.every(
      (q) =>
        isRecord(q) &&
        id(q.id) &&
        text(q.question) &&
        typeof q.required === 'boolean' &&
        typeof q.allow_custom === 'boolean' &&
        Array.isArray(q.options) &&
        q.options.every(text),
    )
  )
    return null
  if (new Set(v.questions.map((q) => q.id)).size !== v.questions.length) return null
  if (
    !v.answers.every(
      (a) =>
        isRecord(a) &&
        id(a.question_id) &&
        ((id(a.value) && a.custom_text == null) || (id(a.custom_text) && a.value == null)),
    )
  )
    return null
  return v as unknown as ClarificationData
}
export type AgentEvent =
  | {
      type: 'run.snapshot'
      payload: {
        run: { id: string; status: RunStatus }
        messages: SnapshotMessage[]
        active_tools: ToolStatus[]
      }
    }
  | {
      type: 'message.delta'
      payload: { message_id: string; start_offset: number; end_offset: number; delta: string }
    }
  | { type: 'card.upsert'; payload: { message_id: string; card: MessageCard } }
  | { type: 'tool.status'; payload: ToolStatus }
  | { type: 'run.finished'; payload: { status: RunStatus } }
export function protocolError(): never {
  throw new ApiError('Invalid conversation event', { kind: 'protocol' })
}
/** Unknown future events are harmless; malformed known events require a fresh snapshot. */
export function parseAgentEvent(
  frame: SseFrame,
  conversationId: string,
  runId: string,
): AgentEvent | null {
  if (
    !['run.snapshot', 'message.delta', 'card.upsert', 'tool.status', 'run.finished'].includes(
      frame.event,
    )
  )
    return null
  let value: unknown
  try {
    value = JSON.parse(frame.data)
  } catch {
    return protocolError()
  }
  if (
    !isRecord(value) ||
    value.conversation_id !== conversationId ||
    value.run_id !== runId ||
    !text(value.occurred_at) ||
    !isRecord(value.payload)
  )
    return protocolError()
  const p = value.payload
  switch (frame.event) {
    case 'run.snapshot':
      if (
        !isRecord(p.run) ||
        p.run.id !== runId ||
        !isRunStatus(p.run.status) ||
        !Array.isArray(p.messages) ||
        !p.messages.every(isMessage) ||
        new Set(p.messages.map((m) => m.id)).size !== p.messages.length ||
        !Array.isArray(p.active_tools) ||
        !p.active_tools.every(isTool)
      )
        return protocolError()
      break
    case 'message.delta':
      if (
        !id(p.message_id) ||
        !text(p.delta) ||
        !Number.isSafeInteger(p.start_offset) ||
        !Number.isSafeInteger(p.end_offset) ||
        Number(p.start_offset) < 0 ||
        Number(p.end_offset) - Number(p.start_offset) !== Array.from(p.delta).length
      )
        return protocolError()
      break
    case 'card.upsert':
      if (!id(p.message_id) || !isCard(p.card)) return protocolError()
      break
    case 'tool.status':
      if (!isTool(p)) return protocolError()
      break
    case 'run.finished':
      if (!isRunStatus(p.status) || !isTerminal(p.status)) return protocolError()
  }
  return { type: frame.event, payload: p } as AgentEvent
}
