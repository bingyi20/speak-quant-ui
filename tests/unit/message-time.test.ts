import { expect, it } from 'vitest'
import { formatMessageTime } from '~/lib/format'

import { applyAgentEvent, emptyRun, projectMessages } from '~/features/conversation/message-state'
import type { ConversationMessage } from '~/features/conversation/types'
it('formats local dates with a 24-hour clock and localized older dates', () => {
  const now = new Date(2026, 8, 9, 18)
  expect(formatMessageTime(new Date(2026, 8, 9, 9, 5).toISOString(), 'zh-CN', now)).toBe('09:05')
  expect(formatMessageTime(new Date(2026, 8, 8, 14, 30).toISOString(), 'zh-CN', now)).toBe(
    '9月8日 14:30',
  )
  expect(formatMessageTime(new Date(2026, 8, 8, 14, 30).toISOString(), 'en-US', now)).toBe(
    'Sep 8, 14:30',
  )
  expect(formatMessageTime(new Date(2025, 11, 31, 0, 0).toISOString(), 'en-US', now)).toBe(
    'Dec 31, 00:00',
  )
  expect(formatMessageTime('invalid', 'zh-CN', now)).toBe('—')
})
it('preserves first event time on reconnect and prefers persisted creation time', () => {
  const state = emptyRun()
  state.receivedSnapshot = true
  state.status = 'running'
  applyAgentEvent(state, {
    type: 'message.delta',
    occurred_at: '2026-09-09T10:00:00Z',
    payload: { message_id: 'a', delta: 'Hi', start_offset: 0, end_offset: 2 },
  })
  applyAgentEvent(state, {
    type: 'run.snapshot',
    occurred_at: '2026-09-09T10:05:00Z',
    payload: {
      run: { id: 'r', status: 'completed' },
      active_tools: [],
      messages: [{ id: 'a', role: 'assistant', content: 'Hi', status: 'completed', cards: [] }],
    },
  })
  expect(state.messages.get('a')?.created_at).toBe('2026-09-09T10:00:00Z')
  const persisted: ConversationMessage = {
    id: 'a',
    role: 'assistant',
    content: 'Hi',
    status: 'completed',
    cards: [],
    created_at: '2026-09-09T09:59:59Z',
    sequence: 1,
    conversation_id: 'c',
  }
  expect(projectMessages([persisted], state)[0]?.created_at).toBe(persisted.created_at)
})
