import type { AgentEvent } from './agent-events'
import { isTerminal, protocolError } from './agent-events'
import type { ConversationMessage, DisplayMessage, RunStatus, ToolStatus } from './types'

export interface RunMessages {
  messages: Map<string, DisplayMessage>
  lengths: Map<string, number>
  tools: Map<string, ToolStatus>
  status: RunStatus
  receivedSnapshot: boolean
}
export function emptyRun(): RunMessages {
  return {
    messages: new Map(),
    lengths: new Map(),
    tools: new Map(),
    status: 'queued',
    receivedSnapshot: false,
  }
}
function ensureMessage(state: RunMessages, id: string, history: ConversationMessage[]) {
  let message = state.messages.get(id)
  if (!message) {
    const previous = history.find((m) => m.id === id)
    message = previous
      ? { ...previous, cards: [...previous.cards] }
      : { id, role: 'assistant', status: 'streaming', content: '', cards: [] }
    state.messages.set(id, message)
    state.lengths.set(id, Array.from(message.content).length)
  }
  return message
}
export function finishRun(state: RunMessages, status: RunStatus) {
  state.status = status
  state.tools.clear()
  for (const message of state.messages.values()) {
    if (message.status === 'streaming')
      message.status = status === 'failed' || status === 'cancelled' ? status : 'completed'
  }
}
export function applyAgentEvent(
  state: RunMessages,
  event: AgentEvent,
  history: ConversationMessage[] = [],
) {
  if (event.type === 'run.snapshot') {
    state.messages = new Map(
      event.payload.messages.map((m) => [
        m.id,
        {
          ...m,
          cards: [...m.cards],
          fromSnapshot: true,
          created_at:
            history.find((h) => h.id === m.id)?.created_at ?? state.messages.get(m.id)?.created_at,
        },
      ]),
    )
    state.lengths = new Map(event.payload.messages.map((m) => [m.id, Array.from(m.content).length]))
    state.tools = new Map(
      event.payload.active_tools.filter((t) => t.status === 'running').map((t) => [t.id, t]),
    )
    state.status = event.payload.run.status
    state.receivedSnapshot = true
    for (const tool of state.tools.values()) ensureMessage(state, tool.message_id, history)
    if (isTerminal(state.status)) finishRun(state, state.status)
    return
  }
  if (!state.receivedSnapshot) return protocolError()
  if (event.type === 'run.finished') {
    finishRun(state, event.payload.status)
    return
  }
  if (isTerminal(state.status)) return
  const p = event.payload
  const message = ensureMessage(state, p.message_id, history)
  message.created_at ??= event.occurred_at
  switch (event.type) {
    case 'message.delta': {
      const { start_offset, end_offset, delta } = event.payload
      const length = state.lengths.get(message.id) ?? 0
      if (end_offset <= length) return
      if (start_offset !== length) return protocolError()
      message.content += delta
      state.lengths.set(message.id, end_offset)
      break
    }
    case 'card.upsert': {
      const card = event.payload.card
      const index = message.cards.findIndex((c) => c.id === card.id)
      if (index < 0) message.cards.push(card)
      else message.cards[index] = card
      break
    }
    case 'tool.status':
      state.tools.set(event.payload.id, event.payload)
  }
}
/** History owns ordering; a Run may also update cards attached to older messages. */
export function projectMessages(
  history: ConversationMessage[],
  run: RunMessages,
  pending?: DisplayMessage | null,
): DisplayMessage[] {
  const ordered = [...history].sort((a, b) => a.sequence - b.sequence)
  const seen = new Set(ordered.map((m) => m.id))
  const result: DisplayMessage[] = ordered.map((m) => {
    const live = run.messages.get(m.id)
    return live ? { ...live, created_at: m.created_at } : m
  })
  if (pending && !seen.has(pending.id)) result.push(pending)
  for (const message of run.messages.values()) if (!seen.has(message.id)) result.push(message)
  return result
}
export function mergeHistory(current: ConversationMessage[], incoming: ConversationMessage[]) {
  const byId = new Map(current.map((m) => [m.id, m]))
  for (const message of incoming) {
    const old = byId.get(message.id)
    if (!old || !old.updated_at || !message.updated_at || message.updated_at >= old.updated_at)
      byId.set(message.id, message)
  }
  return [...byId.values()].sort((a, b) => a.sequence - b.sequence)
}
