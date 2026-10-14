import { effectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseAgentEvent } from '~/features/conversation/agent-events'
import { applyAgentEvent, emptyRun } from '~/features/conversation/message-state'
import { conversationBillingError } from '~/features/conversation/billing-errors'
import { useAgentRun } from '~/features/conversation/composables/useAgentRun'
import type { ConversationApi } from '~/features/conversation/api'

const creditError = { key: 'CREDITS_INSUFFICIENT', message: null }
const run = { id: 'run', status: 'running' as const, stream_url: '/api/agent-runs/run/events' }
const partial = {
  id: 'reply',
  role: 'assistant',
  status: 'streaming',
  content: 'Saved output',
  cards: [],
}
const frame = (event: string, payload: unknown) => ({
  event,
  data: JSON.stringify({
    conversation_id: 'conversation',
    run_id: run.id,
    occurred_at: '2026-10-13',
    payload,
  }),
})
const snapshot = (status = 'running', error?: unknown) =>
  frame('run.snapshot', {
    run: { id: run.id, status, ...(error === undefined ? {} : { error }) },
    messages: [partial],
    active_tools: [],
  })
afterEach(() => vi.useRealTimers())

describe('conversation credit failures', () => {
  it('preserves output and stores the key from a terminal SSE event', () => {
    const state = emptyRun()
    applyAgentEvent(state, parseAgentEvent(snapshot(), 'conversation', run.id)!)
    applyAgentEvent(
      state,
      parseAgentEvent(
        frame('run.finished', {
          status: 'failed',
          error: creditError,
        }),
        'conversation',
        run.id,
      )!,
    )
    expect(state.error).toEqual(creditError)
    expect(state.messages.get(partial.id)).toMatchObject({
      content: partial.content,
      status: 'failed',
    })
    expect(state.tools.size).toBe(0)
  })

  it('restores the failure from a terminal snapshot and validates optional error fields', () => {
    const state = emptyRun()
    applyAgentEvent(
      state,
      parseAgentEvent(snapshot('failed', creditError), 'conversation', run.id)!,
    )
    expect(state.error?.key).toBe('CREDITS_INSUFFICIENT')
    expect(state.messages.get(partial.id)?.status).toBe('failed')
    expect(() =>
      parseAgentEvent(snapshot('failed', { key: 402, message: null }), 'conversation', run.id),
    ).toThrow()
    expect(() =>
      parseAgentEvent(
        frame('run.finished', {
          status: 'failed',
          error: { key: 'CREDITS_INSUFFICIENT', message: {} },
        }),
        'conversation',
        run.id,
      ),
    ).toThrow()
  })

  it('recovers the failure through GET Run after an interrupted stream without replaying messages', async () => {
    vi.useFakeTimers()
    const stream = vi.fn(
      async (_url: string, options: Parameters<ConversationApi['stream']>[1]) => {
        options.onEvent(snapshot())
        throw new Error('connection closed')
      },
    )
    const detail = vi.fn(async () => ({
      ...run,
      conversation_id: 'conversation',
      status: 'failed',
      error: creditError,
    }))
    const onFinished = vi.fn(async () => {})
    const scope = effectScope()
    const controller = scope.run(() =>
      useAgentRun(
        { stream, run: detail } as unknown as ConversationApi,
        'conversation',
        () => [],
        onFinished,
      ),
    )!
    const complete = controller.connect(run)
    await vi.runAllTimersAsync()
    await complete
    expect(stream).toHaveBeenCalledTimes(1)
    expect(detail).toHaveBeenCalledTimes(1)
    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(controller.state.error?.key).toBe('CREDITS_INSUFFICIENT')
    expect(controller.active.value).toBe(false)
    expect(controller.error.value).toBe('chat.creditsInsufficient')
    scope.stop()
  })

  it('does not describe risk or unverified fees as a credit purchase solution', () => {
    expect(conversationBillingError('CREDITS_INSUFFICIENT')).toBe('chat.creditsInsufficient')
    expect(conversationBillingError('CREDITS_RISK_BLOCKED')).toBe('chat.creditsRiskBlocked')
    expect(conversationBillingError('BILLING_RECONCILIATION_PENDING')).toBe(
      'chat.billingReconciliationPending',
    )
    expect(conversationBillingError('LLM_PRICE_NOT_CONFIGURED')).toBe('chat.llmPriceNotConfigured')
    expect(conversationBillingError('unknown')).toBeNull()
  })

  it('fills a missing terminal snapshot error from GET Run before finalizing', async () => {
    const detail = vi.fn(async () => ({
      ...run,
      conversation_id: 'conversation',
      status: 'failed',
      error: creditError,
    }))
    const stream = vi.fn(
      async (_url: string, options: Parameters<ConversationApi['stream']>[1]) => {
        options.onEvent(snapshot('failed'))
      },
    )
    const scope = effectScope()
    const controller = scope.run(() =>
      useAgentRun(
        { stream, run: detail } as unknown as ConversationApi,
        'conversation',
        () => [],
        async () => {},
      ),
    )!
    await controller.connect(run)
    expect(detail).toHaveBeenCalledTimes(1)
    expect(controller.state.error).toEqual(creditError)
    expect(controller.active.value).toBe(false)
    scope.stop()
  })
})
