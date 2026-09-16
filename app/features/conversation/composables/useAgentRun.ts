import { onScopeDispose, reactive, ref } from 'vue'
import { parseAgentEvent, isTerminal } from '../agent-events'
import { applyAgentEvent, emptyRun, finishRun } from '../message-state'
import type { ConversationApi } from '../api'
import type { AgentRun, ConversationMessage, MessageCard } from '../types'

export function useAgentRun(
  api: ConversationApi,
  conversationId: string,
  history: () => ConversationMessage[],
  onFinished: () => Promise<void>,
) {
  const state = reactive(emptyRun())
  const active = ref(false)
  const reconnecting = ref(false)
  const error = ref('')
  const current = ref<AgentRun | null>(null)
  const replayCompletion = ref<{ key: string; messageId: string; card: MessageCard } | null>(null)
  const completedReplays = new Set<string>()
  let connection: AbortController | undefined
  let generation = 0
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  function clearTimers() {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
  }
  function stop() {
    generation++
    connection?.abort()
    clearTimers()
    active.value = false
    reconnecting.value = false
  }
  function reset() {
    stop()
    Object.assign(state, emptyRun())
    current.value = null
    error.value = ''
    replayCompletion.value = null
    completedReplays.clear()
  }
  function delay(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', done)
        resolve()
      }
      const timer = setTimeout(done, ms)
      signal.addEventListener('abort', done, { once: true })
      if (signal.aborted) done()
    })
  }
  async function connect(run: AgentRun) {
    stop()
    const version = generation
    connection = new AbortController()
    const signal = connection.signal
    current.value = run
    active.value = true
    error.value = ''
    let url = run.stream_url
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        if (signal.aborted) return
        let terminal = false
        try {
          // Every connection starts with an authoritative snapshot of this Run.
          state.receivedSnapshot = false
          await api.stream(url, {
            signal,
            onEvent(frame) {
              if (signal.aborted || generation !== version) return
              const event = parseAgentEvent(frame, conversationId, run.id)
              if (!event) return
              if (event.type === 'run.snapshot') {
                clearTimers()
                reconnecting.value = false
              }
              const previousCard =
                event.type === 'card.upsert'
                  ? (
                      state.messages.get(event.payload.message_id)?.cards ??
                      history().find((m) => m.id === event.payload.message_id)?.cards
                    )?.find((c) => c.id === event.payload.card.id)
                  : undefined
              const accepted = !isTerminal(state.status) && state.receivedSnapshot
              applyAgentEvent(state, event, history())
              if (
                accepted &&
                event.type === 'card.upsert' &&
                event.payload.card.type === 'replay_card' &&
                event.payload.card.status === 'completed' &&
                event.payload.card.resource_id &&
                previousCard &&
                ['queued', 'running'].includes(previousCard.status)
              ) {
                const key = `${run.id}:${event.payload.card.id}:${event.payload.card.resource_id}`
                if (!completedReplays.has(key)) {
                  completedReplays.add(key)
                  replayCompletion.value = {
                    key,
                    messageId: event.payload.message_id,
                    card: event.payload.card,
                  }
                }
              }
              if (event.type === 'tool.status' && event.payload.status !== 'running') {
                const tool = event.payload
                clearTimeout(timers.get(tool.id))
                timers.set(
                  tool.id,
                  setTimeout(() => {
                    if (generation === version && state.tools.get(tool.id)?.status === tool.status)
                      state.tools.delete(tool.id)
                    timers.delete(tool.id)
                  }, 1600),
                )
              }
              terminal = isTerminal(state.status)
            },
            isTerminal: () => terminal,
          })
          break
        } catch (cause) {
          if (signal.aborted || generation !== version) return
          if (attempt === 4) throw cause
          reconnecting.value = true
          await delay(Math.min(1000 * 2 ** attempt, 8000), signal)
          if (signal.aborted) return
          try {
            const detail = await api.run(run.id, signal)
            if (signal.aborted) return
            if (detail.conversation_id !== conversationId)
              throw new Error('Run owner mismatch', { cause })
            url = detail.stream_url
            if (isTerminal(detail.status)) {
              finishRun(state, detail.status)
              break
            }
          } catch {
            if (signal.aborted) return
            // A failed status read is retried within the same bounded recovery loop.
          }
        }
      }
      if (signal.aborted || generation !== version) return
      clearTimers()
      await onFinished()
      if (signal.aborted || generation !== version) return
      active.value = false
      reconnecting.value = false
      if (state.status === 'failed') error.value = 'chat.runFailed'
    } catch {
      if (signal.aborted || generation !== version) return
      reconnecting.value = false
      error.value = 'chat.connectionFailed'
      // Keep sends locked until the original Run and final history have been reconciled.
    }
  }
  function retry() {
    if (current.value) void connect(current.value)
  }
  onScopeDispose(stop)
  return { state, active, reconnecting, error, current, replayCompletion, connect, retry, reset }
}
