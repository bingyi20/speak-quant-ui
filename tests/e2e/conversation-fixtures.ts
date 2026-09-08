import type { Page } from '@playwright/test'
import { authResponse, envelope, stubHistory } from './auth-fixtures'
import type { ConversationMessage, MessageCard } from '../../app/features/conversation/types'
export const conversationId = '01K4ABCDE00000000000000001'
export const strategyCard: MessageCard = {
  id: 'strategy-card',
  type: 'strategy_card',
  resource_id: 'strategy-1',
  status: 'completed',
  title: 'BTC 双均线策略',
  summary: '趋势信号与风险规则',
  data: null,
}
export const replayCard: MessageCard = {
  id: 'replay-card',
  type: 'replay_card',
  resource_id: 'replay-1',
  status: 'completed',
  title: 'BTC 均线验证',
  summary: 'BTC/USDT · 1h',
  data: null,
}
export const questionsCard: MessageCard = {
  id: 'questions-card',
  type: 'clarification_card',
  resource_id: null,
  status: 'waiting_user',
  title: '补充信息',
  summary: null,
  data: {
    questions: [
      {
        id: 'market',
        question: '选择交易市场',
        required: true,
        options: ['现货', '合约'],
        allow_custom: false,
      },
      {
        id: 'timeframe',
        question: '选择执行周期',
        required: true,
        options: ['1h', '4h'],
        allow_custom: true,
      },
    ],
    answered: false,
    answers: [],
  },
}
export const message = (
  id: string,
  sequence: number,
  role: string,
  content: string,
  cards: MessageCard[] = [],
): ConversationMessage => ({
  id,
  sequence,
  role,
  content,
  cards,
  status: 'completed',
  conversation_id: conversationId,
  agent_run_id: role === 'assistant' ? 'run-1' : null,
  created_at: '2026-09-08T00:00:00Z',
  updated_at: '2026-09-08T00:00:00Z',
})
export async function stubConversation(
  page: Page,
  options: {
    failSendOnce?: boolean
    manyMessages?: boolean
    disconnectOnce?: boolean
    replyChunks?: string[]
  } = {},
) {
  await stubHistory(page)
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ json: envelope(authResponse) }),
  )
  const calls: { method: string; body: Record<string, unknown>; key: string }[] = []
  let rows = options.manyMessages
    ? Array.from({ length: 80 }, (_, i) =>
        message(`old-${i}`, i + 1, i % 2 ? 'assistant' : 'user', `历史消息 ${i + 1}`),
      )
    : []
  let active: { id: string; status: string; stream_url: string } | null = null
  let failedSend = false
  let disconnected = false
  let round = 0
  const accepted = new Map<string, unknown>()
  // Test-only ReadableStream transport creates real incremental browser reads.
  await page.addInitScript(() => {
    const original = window.fetch.bind(window)
    window.fetch = async (...args) => {
      const response = await original(...args)
      const input = args[0]
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (!url.includes('/agent-runs/') || !url.includes('/events') || !response.ok) return response
      const chunks = (await response.text()).split('\n\n').filter(Boolean)
      const signal = args[1]?.signal
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for (const chunk of chunks) {
              await new Promise((resolve) => setTimeout(resolve, 180))
              if (signal?.aborted) {
                controller.close()
                return
              }
              controller.enqueue(new TextEncoder().encode(`${chunk}\n\n`))
            }
            controller.close()
          } catch {
            /* cancelled reader */
          }
        },
      })
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }
  })
  function makeRun() {
    round++
    active = {
      id: `run-${round}`,
      status: 'queued',
      stream_url: `/api/agent-runs/run-${round}/events`,
    }
    return active
  }
  await page.route(/\/api\/conversations$/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const req = route.request()
    const body = req.postDataJSON()
    const key = req.headers()['idempotency-key']!
    calls.push({ method: 'create', body, key })
    if (!accepted.has(key)) {
      rows = [message('user-1', 1, 'user', body.content)]
      makeRun()
      accepted.set(key, { id: conversationId, title: 'BTC 双均线策略' })
    }
    await route.fulfill({ status: 201, json: envelope(accepted.get(key)) })
  })
  await page.route(/\/api\/conversations\/[^/?]+\/messages(?:\?.*)?$/, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'GET') {
      const before = Number(url.searchParams.get('before_sequence') ?? Infinity)
      const available = rows.filter((m) => m.sequence < before)
      const items = available.slice(-50)
      return route.fulfill({
        json: envelope({
          items,
          active_run: active,
          has_more: available.length > 50,
          next_before_sequence: available.length > 50 ? items[0]?.sequence : null,
        }),
      })
    }
    const body = req.postDataJSON()
    const key = req.headers()['idempotency-key']!
    calls.push({ method: 'send', body, key })
    if (options.failSendOnce && !failedSend) {
      failedSend = true
      return route.abort('failed')
    }
    if (!accepted.has(key)) {
      const sequence = (rows.at(-1)?.sequence ?? 0) + 1
      const updated = body.structured_answers
        ? {
            ...rows.find((m) => m.id === body.reply_to_message_id)!,
            updated_at: '2026-09-08T00:01:00Z',
            cards: [
              strategyCard,
              replayCard,
              {
                ...questionsCard,
                status: 'completed',
                data: { ...questionsCard.data, answered: true, answers: body.structured_answers },
              },
            ],
          }
        : null
      if (updated) rows = rows.map((m) => (m.id === updated.id ? updated : m))
      const user = message(
        `user-${sequence}`,
        sequence,
        'user',
        body.content ?? '选择交易市场\n现货\n\n选择执行周期\n15m',
      )
      rows.push(user)
      accepted.set(key, {
        user_message: user,
        updated_messages: updated ? [updated] : [],
        agent_run: makeRun(),
      })
    }
    return route.fulfill({ status: 202, json: envelope(accepted.get(key)) })
  })
  await page.route(/\/api\/agent-runs\/[^/]+$/, (route) =>
    route.fulfill({
      json: envelope({
        ...active,
        status: 'running',
        conversation_id: conversationId,
        error: null,
        started_at: null,
        finished_at: null,
      }),
    }),
  )
  await page.route(/\/api\/agent-runs\/[^/]+\/events$/, async (route) => {
    const runId = new URL(route.request().url()).pathname.split('/')[3]!
    const seq = (rows.at(-1)?.sequence ?? 0) + 1
    const id = `assistant-${round}`
    const chunks = options.replyChunks ?? [
      '## 研究结论\n\n均线😀',
      '可以描述趋势。\n\n| 条件 | 说明 |\n| --- | --- |\n| 入场 | 均线上穿 |\n\n```ts\nconst signal = true\n```\n\n<script>alert(1)</script>',
    ]
    const first = chunks[0]!
    let offset = Array.from(first).length
    const remainingText: [string, unknown][] = chunks.slice(1).map((delta) => {
      const start = offset
      offset += Array.from(delta).length
      return ['message.delta', { message_id: id, start_offset: start, end_offset: offset, delta }]
    })
    const final = message(
      id,
      seq,
      'assistant',
      chunks.join(''),
      round === 1 ? [strategyCard, replayCard, questionsCard] : [strategyCard, replayCard],
    )
    const events: [string, unknown][] = [
      ['run.snapshot', { run: { id: runId, status: 'running' }, messages: [], active_tools: [] }],
      [
        'message.delta',
        { message_id: id, start_offset: 0, end_offset: Array.from(first).length, delta: first },
      ],
      ['tool.status', { id: 'tool', message_id: id, label: '正在检查策略', status: 'running' }],
      ['card.upsert', { message_id: id, card: strategyCard }],
      ['card.upsert', { message_id: id, card: { ...replayCard, status: 'running' } }],
      ['card.upsert', { message_id: id, card: replayCard }],
      ...remainingText,
      ...final.cards
        .filter((c) => c.type === 'clarification_card')
        .map((c) => ['card.upsert', { message_id: id, card: c }] as [string, unknown]),
      ['run.finished', { status: round === 1 ? 'waiting_user' : 'completed', error: null }],
    ]
    let deliver = events
    if (options.disconnectOnce && !disconnected) {
      disconnected = true
      deliver = events.slice(0, 2)
    } else {
      rows = [...rows.filter((m) => m.id !== id), final]
      active = null
    }
    await route.fulfill({
      contentType: 'text/event-stream',
      body: deliver
        .map(
          ([event, payload]) =>
            `event: ${event}\ndata: ${JSON.stringify({ conversation_id: conversationId, run_id: runId, occurred_at: '2026-09-08', payload })}\n\n`,
        )
        .join(''),
    })
  })
  await page.route(/\/api\/conversations\/[^/?]+\/assets(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({
        strategy: rows.some((m) => m.cards.length)
          ? {
              id: 'strategy-1',
              name: strategyCard.title,
              status: 'draft',
              status_label: '草稿',
              revision: 1,
              replay_count: 0,
              updated_at: '2026-09-08',
            }
          : null,
        replays: { items: [], page: 1, size: 20, total: 0, total_pages: 0 },
      }),
    }),
  )
  return { calls }
}
