import { describe, expect, it } from 'vitest'
import {
  applyAgentEvent,
  emptyRun,
  projectMessages,
  mergeHistory,
} from '~/features/conversation/message-state'
import {
  parseAgentEvent,
  clarificationData,
  type AgentEvent,
} from '~/features/conversation/agent-events'
import {
  clarificationSubmission,
  pendingClarification,
} from '~/features/conversation/clarification'
import type { ConversationMessage, MessageCard } from '~/features/conversation/types'
const card: MessageCard = {
  id: 'card',
  type: 'strategy_card',
  status: 'generating',
  title: 'Strategy',
  summary: null,
  resource_id: null,
  data: null,
}
const row = (id: string, sequence: number): ConversationMessage => ({
  id,
  sequence,
  conversation_id: 'c',
  agent_run_id: null,
  role: 'assistant',
  status: 'completed',
  content: 'history',
  cards: [card],
  created_at: '2026-09-08',
})
const snapshot = (messages: unknown[] = [], status = 'running') =>
  ({
    type: 'run.snapshot',
    payload: { run: { id: 'r', status }, messages, active_tools: [] },
  }) as AgentEvent
const delta = (start: number, end: number, value: string): AgentEvent => ({
  type: 'message.delta',
  payload: { message_id: 'm', start_offset: start, end_offset: end, delta: value },
})
const frame = (event: string, payload: unknown) => ({
  event,
  data: JSON.stringify({ run_id: 'r', conversation_id: 'c', occurred_at: '2026-09-08', payload }),
})

describe('conversation stream projection', () => {
  it('uses Unicode code points, ignores duplicate deltas and rejects gaps/partial overlaps', () => {
    const state = emptyRun()
    applyAgentEvent(state, snapshot())
    const event = parseAgentEvent(
      frame('message.delta', { message_id: 'm', start_offset: 0, end_offset: 3, delta: '你😀好' }),
      'c',
      'r',
    )!
    applyAgentEvent(state, event)
    applyAgentEvent(state, event)
    expect(state.messages.get('m')?.content).toBe('你😀好')
    expect(() => applyAgentEvent(state, delta(2, 4, '好呀'))).toThrow()
    expect(() => applyAgentEvent(state, delta(4, 5, '!'))).toThrow()
    applyAgentEvent(state, delta(3, 4, '!'))
    expect(state.messages.get('m')?.content).toBe('你😀好!')
  })
  it('replaces only the Run snapshot and preserves historical card positions', () => {
    const history = [row('old', 1), row('recent', 2)]
    const state = emptyRun()
    applyAgentEvent(
      state,
      snapshot([
        { ...row('old', 1), content: 'updated', cards: [{ ...card, status: 'completed' }] },
        { ...row('m', 3), content: 'partial' },
      ]),
    )
    expect(projectMessages(history, state).map((m) => m.id)).toEqual(['old', 'recent', 'm'])
    applyAgentEvent(state, snapshot([{ ...row('old', 1), content: 'authoritative' }]))
    expect(projectMessages(history, state).map((m) => m.content)).toEqual([
      'authoritative',
      'history',
    ])
  })
  it('allows cards and tools before text, replaces a card wholly without moving it', () => {
    const state = emptyRun()
    applyAgentEvent(state, snapshot())
    applyAgentEvent(state, { type: 'card.upsert', payload: { message_id: 'm', card } })
    applyAgentEvent(state, {
      type: 'card.upsert',
      payload: { message_id: 'm', card: { ...card, id: 'second' } },
    })
    applyAgentEvent(state, {
      type: 'card.upsert',
      payload: {
        message_id: 'm',
        card: { ...card, type: 'replay_card', resource_id: 'replay', status: 'completed' },
      },
    })
    applyAgentEvent(state, {
      type: 'tool.status',
      payload: { id: 't', message_id: 'm', label: 'Reading', status: 'running' },
    })
    applyAgentEvent(state, delta(0, 1, 'A'))
    expect(state.messages.get('m')?.cards.map((c) => c.id)).toEqual(['card', 'second'])
    expect(state.messages.get('m')?.cards[0]?.type).toBe('replay_card')
    applyAgentEvent(state, { type: 'run.finished', payload: { status: 'waiting_user' } })
    expect(state.tools.size).toBe(0)
    expect(state.messages.get('m')?.status).toBe('completed')
  })
  it('keeps partial output on failure and leaves completed historical messages alone', () => {
    const state = emptyRun()
    applyAgentEvent(state, snapshot([row('old', 1)]))
    applyAgentEvent(state, delta(0, 1, 'A'))
    applyAgentEvent(state, { type: 'run.finished', payload: { status: 'failed' } })
    expect(state.messages.get('m')).toMatchObject({ content: 'A', status: 'failed' })
    expect(state.messages.get('old')?.status).toBe('completed')
  })
  it('validates known events without interpreting unknown event content', () => {
    expect(parseAgentEvent({ event: 'future', data: 'not json' }, 'c', 'r')).toBeNull()
    expect(() => parseAgentEvent({ event: 'run.finished', data: 'not json' }, 'c', 'r')).toThrow()
    expect(() => parseAgentEvent(frame('run.finished', { status: 'running' }), 'c', 'r')).toThrow()
    expect(() =>
      parseAgentEvent(frame('run.finished', { status: 'completed' }), 'other', 'r'),
    ).toThrow()
    expect(() =>
      parseAgentEvent(
        frame('message.delta', { message_id: 'm', delta: '😀', start_offset: 0, end_offset: 2 }),
        'c',
        'r',
      ),
    ).toThrow()
    expect(() => applyAgentEvent(emptyRun(), delta(0, 1, 'A'))).toThrow()
  })
  it('merges paging and rejects stale historical updates', () => {
    const current = { ...row('a', 5), updated_at: '2026-09-08T02:00:00Z' }
    expect(
      mergeHistory(
        [current],
        [{ ...current, content: 'stale', updated_at: '2026-09-08T01:00:00Z' }, row('b', 1)],
      ).map((m) => m.content),
    ).toEqual(['history', 'history'])
  })
})

describe('batch clarification', () => {
  const clarification: MessageCard = {
    ...card,
    type: 'clarification_card',
    status: 'waiting_user',
    data: {
      questions: [
        {
          id: 'q1',
          question: 'Market?',
          required: true,
          options: ['Spot', 'Futures'],
          allow_custom: false,
        },
        {
          id: 'q2',
          question: 'Timeframe?',
          required: true,
          options: ['1h', '4h'],
          allow_custom: true,
        },
      ],
      answered: false,
      answers: [],
    },
  }
  it('submits valid filled answers and allows partial or all-skipped groups', () => {
    const group = pendingClarification([{ ...row('source', 1), cards: [clarification] }])!
    expect(
      clarificationSubmission(group, { q1: { mode: 'option', text: 'Spot' } })?.body
        .structured_answers,
    ).toEqual([{ question_id: 'q1', value: 'Spot' }])
    expect(clarificationSubmission(group, {})?.body).toEqual({
      reply_to_message_id: 'source',
      structured_answers: [],
    })
    const result = clarificationSubmission(group, {
      q1: { mode: 'option', text: 'Spot' },
      q2: { mode: 'custom', text: ' 15m ' },
    })!
    expect(result.body).toEqual({
      reply_to_message_id: 'source',
      structured_answers: [
        { question_id: 'q1', value: 'Spot' },
        { question_id: 'q2', custom_text: '15m' },
      ],
    })
    expect(result.display).toBe('Market?\nSpot\n\nTimeframe?\n15m')
    expect(
      clarificationSubmission(group, {
        q1: { mode: 'custom', text: 'Not allowed' },
        q2: { mode: 'option', text: '1h' },
      })?.body.structured_answers,
    ).toEqual([{ question_id: 'q2', value: '1h' }])
  })
  it('restores completed questions as read only and safely rejects malformed data', () => {
    const completed = {
      ...clarification,
      status: 'completed',
      data: {
        ...clarification.data,
        answered: true,
        answers: [{ question_id: 'q1', value: 'Spot' }],
      },
    }
    expect(pendingClarification([{ ...row('source', 1), cards: [completed] }])).toBeNull()
    expect(clarificationData(completed)?.answers).toEqual([{ question_id: 'q1', value: 'Spot' }])
    expect(clarificationData({ ...clarification, data: { questions: [{}] } })).toBeNull()
  })
})

it('never reactivates unanswered questions from before the latest submitted user message', () => {
  const question: MessageCard = {
    ...card,
    type: 'clarification_card',
    status: 'waiting_user',
    data: {
      questions: [
        {
          id: 'q',
          question: 'Old question',
          required: true,
          options: ['A', 'B'],
          allow_custom: false,
        },
      ],
      answered: false,
      answers: [],
    },
  }
  const old = { ...row('old', 1), cards: [question] }
  expect(pendingClarification([old])).not.toBeNull()
  expect(
    pendingClarification([old, { ...row('new', 2), role: 'user' }, row('response', 3)]),
  ).toBeNull()
  expect(
    pendingClarification([old, { ...row('local', 2), role: 'user', localPending: true }]),
  ).not.toBeNull()
})
