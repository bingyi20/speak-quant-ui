import { expect, test, type Page } from '@playwright/test'
import { conversationId, message, stubConversation } from './conversation-fixtures'
import { envelope } from './auth-fixtures'
import { stubBilling } from './billing-fixtures'

async function creditFailure(
  page: Page,
  {
    source = 'finished',
    key = 'CREDITS_INSUFFICIENT',
    plan = null,
  }: {
    source?: 'finished' | 'snapshot' | 'getRun'
    key?: string
    plan?: string | null
  } = {},
) {
  await stubConversation(page, { immediateStream: true })
  const billing = await stubBilling(page, { plan, available: '0' })
  const run = {
    id: 'credit-run',
    status: 'running',
    stream_url: '/api/agent-runs/credit-run/events',
  }
  const error = { key, message: 'Server text must not determine the displayed error.' }
  const user = message('user', 1, 'user', '研究 BTC 趋势')
  const reply = { ...message('reply', 2, 'assistant', '已经生成的研究结论'), status: 'failed' }
  let terminal = false
  let sends = 0
  await page.route(/\/api\/conversations\/[^/?]+\/messages(?:\?.*)?$/, (route) => {
    if (route.request().method() === 'POST') sends++
    return route.fulfill({
      json: envelope({
        items: terminal ? [user, reply] : [user],
        has_more: false,
        next_before_sequence: null,
        active_run: terminal ? null : run,
      }),
    })
  })
  await page.route(/\/api\/agent-runs\/credit-run$/, (route) => {
    terminal = true
    return route.fulfill({
      json: envelope({
        ...run,
        conversation_id: conversationId,
        status: 'failed',
        error,
        started_at: null,
        finished_at: '2026-10-13T10:00:00Z',
      }),
    })
  })
  await page.route(/\/api\/agent-runs\/credit-run\/events$/, (route) => {
    terminal = source !== 'getRun'
    const events: [string, unknown][] = [
      [
        'run.snapshot',
        {
          run: {
            id: run.id,
            status: source === 'snapshot' ? 'failed' : 'running',
            ...(source === 'snapshot' ? { error } : {}),
          },
          messages: [{ ...reply, status: 'streaming' }],
          active_tools: [],
        },
      ],
    ]
    if (source === 'finished') events.push(['run.finished', { status: 'failed', error }])
    return route.fulfill({
      contentType: 'text/event-stream',
      body: events
        .map(
          ([event, payload]) =>
            `event: ${event}\ndata: ${JSON.stringify({
              run_id: run.id,
              conversation_id: conversationId,
              occurred_at: '2026-10-13',
              payload,
            })}\n\n`,
        )
        .join(''),
    })
  })
  return { billing, sends: () => sends }
}

for (const source of ['finished', 'snapshot', 'getRun'] as const) {
  test(`insufficient credits from ${source} preserves output and opens the purchase plan`, async ({
    page,
  }) => {
    const state = await creditFailure(page, { source })
    await page.goto(`/conversations/${conversationId}`)
    const notice = page.locator('.conversation-credit-notice')
    await expect(notice).toContainText('积分不足，无法继续本次任务。')
    await expect(page.locator('.message-list')).toContainText('已经生成的研究结论')
    await expect(page.getByText('正在回复', { exact: true })).toBeHidden()
    const input = page.getByRole('textbox', { name: '交易想法' })
    await input.fill('手动发起下一次任务')
    await expect(page.getByRole('button', { name: '发送研究想法' })).toBeEnabled()
    const noticeBox = (await notice.boundingBox())!
    const inputBox = (await page.locator('.chat-input .research-composer').boundingBox())!
    expect(noticeBox.y + noticeBox.height).toBeLessThanOrEqual(inputBox.y)
    if (source === 'finished')
      await page.screenshot({ path: test.info().outputPath('credit-notice.png') })
    await notice.getByRole('button', { name: '去充值' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('tab')).toHaveCount(0)
    await expect(dialog.getByRole('article', { name: 'Basic', exact: true })).toBeVisible()
    expect(state.sends()).toBe(0)
    expect(
      state.billing.requests.filter((r) => r.path === '/api/credits/balance').length,
    ).toBeGreaterThan(1)
  })
}

test('an eligible subscriber opens the credit top-up tab directly', async ({ page }) => {
  await creditFailure(page, { plan: 'pro' })
  await page.goto(`/conversations/${conversationId}`)
  await page.locator('.conversation-credit-notice').getByRole('button', { name: '去充值' }).click()
  await expect(page.getByRole('dialog').getByRole('tab', { name: '积分加购' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
})

for (const [key, text] of [
  ['CREDITS_RISK_BLOCKED', '账户权益暂受限制'],
  ['BILLING_RECONCILIATION_PENDING', '本次模型费用正在核实'],
  ['LLM_PRICE_NOT_CONFIGURED', '当前模型费率尚未配置'],
]) {
  test(`${key} explains the failure without a recharge action`, async ({ page }) => {
    await creditFailure(page, { key })
    await page.goto(`/conversations/${conversationId}`)
    await expect(page.getByRole('alert').filter({ hasText: text })).toBeVisible()
    await expect(page.locator('.conversation-credit-notice')).toBeHidden()
    await expect(page.getByRole('button', { name: '去充值' })).toHaveCount(0)
  })
}

test('a rejected HTTP 402 message offers recharge and allows returning it to the draft', async ({
  page,
}) => {
  await stubConversation(page, {
    initialMessages: [message('initial', 1, 'assistant', '继续研究')],
  })
  await stubBilling(page, { available: '0' })
  let sends = 0
  await page.route(/\/api\/conversations\/[^/?]+\/messages(?:\?.*)?$/, (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    sends++
    return route.fulfill({
      status: 402,
      json: {
        code: 40260,
        data: null,
        error: { key: 'CREDITS_INSUFFICIENT' },
      },
    })
  })
  await page.goto(`/conversations/${conversationId}`)
  const input = page.getByRole('textbox', { name: '交易想法' })
  await input.fill('请继续研究')
  await page.getByRole('button', { name: '发送研究想法' }).click()
  await expect(page.locator('.conversation-credit-notice')).toBeVisible()
  await page.getByRole('button', { name: '返回编辑' }).click()
  await expect(input).toHaveValue('请继续研究')
  expect(sends).toBe(1)
})
