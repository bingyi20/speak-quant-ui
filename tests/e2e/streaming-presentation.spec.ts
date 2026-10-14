import { expect, test, type Page } from '@playwright/test'
import { conversationId, message, strategyCard, stubConversation } from './conversation-fixtures'
import { envelope } from './auth-fixtures'

const first =
  '## 稳定标题\n\n已完成的段落保持原位。\n\n| 指标 | 数值 |\n| --- | --- |\n| 次数 | 12 |\n\n```ts\n' +
  'const example = "' +
  'long-code-'.repeat(20) +
  '"\n```\n'
const tails = [1, 2, 3].map(
  (index) => `\n\n新增段落 ${index}：${'文字应连续出现，中文和 👩‍💻 Emoji 保持完整。'.repeat(6)}`,
)

type Sample = {
  length: number
  top: number
  stable: boolean
  toolHeight: number | null
  toolEmpty: boolean
}
async function probe(page: Page) {
  await page.addInitScript(() => {
    const samples: {
      length: number
      top: number
      stable: boolean
      max: number
      following: boolean
      toolHeight: number | null
      toolEmpty: boolean
    }[] = []
    Object.assign(window, { streamSamples: samples })
    let paragraph: Element | null = null
    let table: Element | null = null
    let code: Element | null = null
    function sample() {
      const root = document.querySelector('[data-message-id="assistant-1"] .markdown-content')
      const viewport = document.querySelector('.message-scroll')
      const tools = document.querySelector('[data-message-id="assistant-1"] .tool-statuses')
      if (root && viewport) {
        if (!paragraph && root.querySelector('p')?.textContent === '已完成的段落保持原位。')
          paragraph = root.querySelector('p')
        table ??= root.querySelector('table')
        code ??= root.querySelector('pre')
        samples.push({
          length: root.textContent?.length ?? 0,
          top: viewport.scrollTop,
          max: viewport.scrollHeight - viewport.clientHeight,
          following: !document.querySelector('.jump-latest'),
          toolHeight: tools?.getBoundingClientRect().height ?? null,
          toolEmpty: tools?.classList.contains('is-empty') ?? false,
          stable:
            (!paragraph || root.querySelector('p') === paragraph) &&
            (!table || root.querySelector('table') === table) &&
            (!code || root.querySelector('pre') === code),
        })
      }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
}

for (const manyMessages of [false, true])
  test(`the waiting spinner becomes the first reply line ${manyMessages ? 'while following a long history' : 'in a new conversation'}`, async ({
    page,
  }) => {
    await stubConversation(page, { noQuestions: true, immediateStream: true, manyMessages })
    // Control the first content delta independently of the initial Run snapshot.
    await page.addInitScript(() => {
      const original = window.fetch.bind(window)
      const controls = window as typeof window & {
        releaseReplyDelta?: () => void
        releaseReplyEnd?: () => void
      }
      window.fetch = async (...args) => {
        const response = await original(...args)
        const input = args[0]
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (!url.includes('/agent-runs/') || !url.includes('/events') || !response.ok)
          return response
        const chunks = (await response.text()).split('\n\n').filter(Boolean)
        return new Response(
          new ReadableStream({
            async start(controller) {
              for (const chunk of chunks) {
                if (chunk.includes('event: message.delta'))
                  await new Promise<void>((resolve) => {
                    controls.releaseReplyDelta = resolve
                  })
                controller.enqueue(new TextEncoder().encode(`${chunk}\n\n`))
              }
              await new Promise<void>((resolve) => {
                controls.releaseReplyEnd = resolve
              })
              controller.close()
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        )
      }
    })
    let releaseSnapshot!: () => void
    const snapshot = new Promise<void>((resolve) => {
      releaseSnapshot = resolve
    })
    let requested = false
    const text = '这是第一行回复。'
    await page.route('**/api/agent-runs/*/events', async (route) => {
      requested = true
      await snapshot
      const events: [string, unknown][] = [
        [
          'run.snapshot',
          {
            run: { id: 'run-1', status: 'running' },
            messages: [
              { id: 'assistant-1', role: 'assistant', status: 'streaming', content: '', cards: [] },
            ],
            active_tools: [],
          },
        ],
        [
          'message.delta',
          {
            message_id: 'assistant-1',
            start_offset: 0,
            end_offset: Array.from(text).length,
            delta: text,
          },
        ],
      ]
      await route.fulfill({
        contentType: 'text/event-stream',
        body: events
          .map(
            ([event, payload]) =>
              `event: ${event}\ndata: ${JSON.stringify({ conversation_id: conversationId, run_id: 'run-1', occurred_at: '2026-10-13', payload })}\n\n`,
          )
          .join(''),
      })
    })
    const spinnerOrigin = () =>
      page.locator('.reply-waiting .iconify').evaluate((element) => {
        const icon = element.getBoundingClientRect()
        const line = element.closest('.reply-waiting')!.getBoundingClientRect()
        const list = element.closest('.message-list')!.getBoundingClientRect()
        return {
          left: line.left - list.left,
          center: icon.top + icon.height / 2 - list.top,
          viewportLeft: line.left,
          viewportCenter: icon.top + icon.height / 2,
        }
      })
    const expectAtBottom = () =>
      expect
        .poll(() =>
          page
            .locator('.message-scroll')
            .evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop),
        )
        .toBeLessThan(1)
    try {
      await page.goto(`/conversations/${conversationId}`)
      await page.evaluate(() => document.fonts.ready)
      await page.getByRole('textbox', { name: '交易想法' }).fill('检查回复起点')
      await page.getByRole('button', { name: '发送研究想法' }).click()
      await expect.poll(() => requested).toBe(true)
      await expect(page.locator('.reply-waiting')).toHaveCount(1)
      await expect(page.locator('[data-message-id="assistant-1"]')).toHaveCount(0)
      await expectAtBottom()
      const pending = await spinnerOrigin()

      releaseSnapshot()
      const assistant = page.locator('[data-message-id="assistant-1"]')
      await expect(assistant.locator('.reply-waiting')).toBeVisible()
      await expect(page.locator('.reply-waiting')).toHaveCount(1)
      await expectAtBottom()
      const emptyReply = await spinnerOrigin()
      expect(emptyReply.left).toBeCloseTo(pending.left, 1)
      expect(emptyReply.center).toBeCloseTo(pending.center, 1)
      expect(emptyReply.viewportLeft).toBeCloseTo(pending.viewportLeft, 1)
      expect(emptyReply.viewportCenter).toBeCloseTo(pending.viewportCenter, 1)
      await page.screenshot({ path: test.info().outputPath('first-reply-waiting.png') })
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              typeof (window as typeof window & { releaseReplyDelta?: unknown }).releaseReplyDelta,
          ),
        )
        .toBe('function')
      await page.evaluate(() => {
        ;(window as typeof window & { releaseReplyDelta?: () => void }).releaseReplyDelta?.()
      })
      const paragraph = assistant.locator('.markdown-content > p').first()
      await expect(paragraph).toHaveText(text)
      await expect(page.locator('.reply-waiting')).toHaveCount(0)
      await expectAtBottom()
      const firstLine = await paragraph.evaluate((element) => {
        const line = element.getBoundingClientRect()
        const list = element.closest('.message-list')!.getBoundingClientRect()
        return {
          left: line.left - list.left,
          center: line.top + Number.parseFloat(getComputedStyle(element).lineHeight) / 2 - list.top,
          viewportLeft: line.left,
          viewportCenter: line.top + Number.parseFloat(getComputedStyle(element).lineHeight) / 2,
        }
      })
      await test.info().attach('first-reply-position.json', {
        body: JSON.stringify({ pending, emptyReply, firstLine }),
        contentType: 'application/json',
      })
      await page.screenshot({ path: test.info().outputPath('first-reply-text.png') })
      expect(firstLine.left).toBeCloseTo(pending.left, 1)
      expect(firstLine.center).toBeCloseTo(pending.center, 1)
      expect(firstLine.viewportLeft).toBeCloseTo(pending.viewportLeft, 1)
      expect(firstLine.viewportCenter).toBeCloseTo(pending.viewportCenter, 1)
    } finally {
      releaseSnapshot()
      await page.evaluate(() => {
        const controls = window as typeof window & {
          releaseReplyDelta?: () => void
          releaseReplyEnd?: () => void
        }
        controls.releaseReplyDelta?.()
        controls.releaseReplyEnd?.()
      })
    }
  })

for (const withCards of [false, true])
  test(`finishing queued text and showing copy and time keeps ${withCards ? 'the reply and its card' : 'the reply'} in place`, async ({
    page,
  }) => {
    const text = '正文逐字输出时保持自然跟随，结束后操作栏不再推动页面。'.repeat(28)
    await stubConversation(page, { noQuestions: true, immediateStream: true, manyMessages: true })
    let delivered = false
    await page.route(/\/api\/conversations\/[^/?]+\/messages(?:\?.*)?$/, async (route) => {
      if (route.request().method() !== 'GET' || !delivered) return route.fallback()
      const rows = [
        ...Array.from({ length: 80 }, (_, i) =>
          message(`old-${i}`, i + 1, i % 2 ? 'assistant' : 'user', `历史消息 ${i + 1}`),
        ),
        message('user-81', 81, 'user', '检查结束时复制和时间的位置'),
        {
          ...message('assistant-1', 82, 'assistant', text, withCards ? [strategyCard] : []),
          created_at: '2026-10-13T15:25:00Z',
        },
      ]
      const before = Number(
        new URL(route.request().url()).searchParams.get('before_sequence') ?? Infinity,
      )
      const available = rows.filter((row) => row.sequence < before)
      const items = available.slice(-50)
      return route.fulfill({
        json: envelope({
          items,
          active_run: null,
          has_more: available.length > 50,
          next_before_sequence: available.length > 50 ? items[0]?.sequence : null,
        }),
      })
    })
    await page.addInitScript(() => {
      type FooterSample = {
        terminal: boolean
        length: number
        top: number
        textTop: number
        textHeight: number
        cardTop: number | null
        footerVisible: boolean
      }
      const controls = window as typeof window & {
        releaseReplyFinish?: () => void
        replyTerminalDelivered?: boolean
        footerSamples?: FooterSample[]
      }
      controls.footerSamples = []
      const original = window.fetch.bind(window)
      window.fetch = async (...args) => {
        const response = await original(...args)
        const input = args[0]
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (!url.includes('/agent-runs/') || !url.includes('/events') || !response.ok)
          return response
        const chunks = (await response.text()).split('\n\n').filter(Boolean)
        return new Response(
          new ReadableStream({
            async start(controller) {
              for (const chunk of chunks) {
                if (chunk.includes('event: run.finished')) {
                  await new Promise<void>((resolve) => {
                    controls.releaseReplyFinish = resolve
                  })
                  controls.replyTerminalDelivered = true
                }
                controller.enqueue(new TextEncoder().encode(`${chunk}\n\n`))
              }
              controller.close()
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        )
      }
      function sample() {
        const assistant = document.querySelector('[data-message-id="assistant-1"]')
        const markdown = assistant?.querySelector('.markdown-content')
        const viewport = document.querySelector('.message-scroll')
        if (markdown && viewport) {
          const bounds = markdown.getBoundingClientRect()
          const footer = assistant?.querySelector('.assistant-message-footer')
          controls.footerSamples!.push({
            terminal: !!controls.replyTerminalDelivered,
            length: markdown.textContent?.trim().length ?? 0,
            top: viewport.scrollTop,
            textTop: bounds.top,
            textHeight: bounds.height,
            cardTop:
              assistant?.querySelector('.message-cards')?.getBoundingClientRect().top ?? null,
            footerVisible:
              !!footer &&
              getComputedStyle(footer).visibility !== 'hidden' &&
              Number.parseFloat(getComputedStyle(footer).opacity) > 0,
          })
        }
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    await page.route('**/api/agent-runs/*/events', async (route) => {
      delivered = true
      const events: [string, unknown][] = [
        [
          'run.snapshot',
          { run: { id: 'run-1', status: 'running' }, messages: [], active_tools: [] },
        ],
        [
          'message.delta',
          {
            message_id: 'assistant-1',
            start_offset: 0,
            end_offset: Array.from(text).length,
            delta: text,
          },
        ],
        ...(withCards
          ? ([['card.upsert', { message_id: 'assistant-1', card: strategyCard }]] as [
              string,
              unknown,
            ][])
          : []),
        ['run.finished', { status: 'completed', error: null }],
      ]
      await route.fulfill({
        contentType: 'text/event-stream',
        body: events
          .map(
            ([event, payload]) =>
              `event: ${event}\ndata: ${JSON.stringify({ conversation_id: conversationId, run_id: 'run-1', occurred_at: '2026-10-13T15:25:00Z', payload })}\n\n`,
          )
          .join(''),
      })
    })
    try {
      await page.goto(`/conversations/${conversationId}`)
      await page.evaluate(() => document.fonts.ready)
      await page.getByRole('textbox', { name: '交易想法' }).fill('检查结束时复制和时间的位置')
      await page.getByRole('button', { name: '发送研究想法' }).click()
      const assistant = page.locator('[data-message-id="assistant-1"]')
      const markdown = assistant.locator('.markdown-content')
      await expect
        .poll(async () => (await markdown.textContent())?.trim().length ?? 0)
        .toBeGreaterThan(30)
      await expect(assistant.getByRole('button', { name: '复制 Markdown' })).toBeHidden()
      if (withCards) {
        await expect(assistant.locator('.assistant-message-footer')).toHaveAttribute('inert', '')
        await expect(assistant.locator('.assistant-message-footer')).toHaveAttribute(
          'aria-hidden',
          'true',
        )
      }
      await page.evaluate(() => {
        ;(window as typeof window & { releaseReplyFinish: () => void }).releaseReplyFinish()
      })
      // The authoritative Run has finished while the presentation queue still has work.
      await page.getByRole('textbox', { name: '交易想法' }).fill('下一轮草稿')
      await expect(
        page.getByRole('button', { name: '发送研究想法', includeHidden: true }),
      ).toBeEnabled()
      expect((await markdown.textContent())!.trim().length).toBeLessThan(text.length)
      await expect(assistant.getByRole('button', { name: '复制 Markdown' })).toBeHidden()
      await expect(markdown).toHaveText(text)
      await expect(assistant.getByRole('button', { name: '复制 Markdown' })).toBeVisible()
      await expect(assistant.locator('time')).toBeVisible()
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      )
      const samples = await page.evaluate(
        () =>
          (
            window as typeof window & {
              footerSamples: {
                terminal: boolean
                length: number
                top: number
                textTop: number
                textHeight: number
                cardTop: number | null
                footerVisible: boolean
              }[]
            }
          ).footerSamples,
      )
      await test.info().attach('reply-footer-positions.json', {
        body: JSON.stringify(samples),
        contentType: 'application/json',
      })
      const queued = samples.filter((sample) => sample.terminal && sample.length < text.length)
      expect(queued.length).toBeGreaterThan(10)
      expect(queued.every((sample) => !sample.footerVisible)).toBe(true)
      const beforeTerminal = samples.findLast((sample) => !sample.terminal)!
      const afterTerminal = queued[2]!
      expect(
        Math.abs(
          afterTerminal.top -
            beforeTerminal.top -
            (afterTerminal.textHeight - beforeTerminal.textHeight),
        ),
      ).toBeLessThan(1)
      const beforeReveal = samples.findLast((sample) => sample.length < text.length)!
      const afterReveal = samples.findLast((sample) => sample.footerVisible)!
      expect(
        Math.abs(
          afterReveal.top - beforeReveal.top - (afterReveal.textHeight - beforeReveal.textHeight),
        ),
      ).toBeLessThan(1)
      if (withCards) {
        expect(Math.abs(afterTerminal.cardTop! - beforeTerminal.cardTop!)).toBeLessThan(1)
        expect(Math.abs(afterReveal.cardTop! - beforeReveal.cardTop!)).toBeLessThan(1)
      }
      // Line wrapping may grow the reply naturally. With unchanged text height, neither
      // the raw terminal event nor the copy/time reveal may move the text or viewport.
      const stationaryPairs = samples.slice(1).flatMap((sample, index) => {
        const previous = samples[index]!
        return sample.textHeight === previous.textHeight ? [{ previous, sample }] : []
      })
      expect(stationaryPairs.length).toBeGreaterThan(10)
      const movement = stationaryPairs.map(({ previous, sample }) => ({
        from: previous.length,
        to: sample.length,
        terminal: sample.terminal,
        footerVisible: sample.footerVisible,
        scroll: sample.top - previous.top,
        text: sample.textTop - previous.textTop,
      }))
      await test.info().attach('reply-footer-movement.json', {
        body: JSON.stringify(movement),
        contentType: 'application/json',
      })
      expect(
        Math.max(...movement.map((item) => Math.abs(item.scroll))),
        JSON.stringify(movement.filter((item) => Math.abs(item.scroll) >= 1)),
      ).toBeLessThan(1)
      expect(Math.max(...movement.map((item) => Math.abs(item.text)))).toBeLessThan(1)
      await page.screenshot({ path: test.info().outputPath('reply-footer-completed.png') })
    } finally {
      await page
        .evaluate(() => {
          ;(window as typeof window & { releaseReplyFinish?: () => void }).releaseReplyFinish?.()
        })
        .catch(() => {})
    }
  })

test('large SSE chunks reveal continuously and retain existing Markdown nodes', async ({
  page,
}) => {
  await stubConversation(page, { manyMessages: true, replyChunks: [first, ...tails] })
  await probe(page)
  await page.goto(`/conversations/${conversationId}`)
  const input = page.getByRole('textbox', { name: '交易想法' })
  await input.fill('检查连续展示')
  await input.press('Enter')
  await input.fill('下一轮草稿')
  const markdown = page.locator('[data-message-id="assistant-1"] .markdown-content')
  const code = markdown.locator('pre')
  await expect(code).toContainText('long-code-'.repeat(20))
  await code.evaluate((el) => {
    el.scrollLeft = 80
  })
  await expect(
    page.getByRole('button', { name: '发送研究想法', includeHidden: true }),
  ).toBeEnabled()
  await expect(markdown).toContainText(tails[2]!.trim())
  const samples = await page.evaluate(
    () => (window as typeof window & { streamSamples: Sample[] }).streamSamples,
  )
  await test.info().attach('stream-samples.json', {
    body: JSON.stringify(samples),
    contentType: 'application/json',
  })
  expect(new Set(samples.map((sample) => sample.length)).size).toBeGreaterThan(100)
  expect(samples.every((sample) => sample.stable)).toBe(true)
  expect(samples.some((sample) => sample.toolEmpty && sample.toolHeight === 20)).toBe(true)
  expect(samples.some((sample) => !sample.toolEmpty && sample.toolHeight === 20)).toBe(true)
  expect(await code.evaluate((el) => el.scrollLeft)).toBe(80)
  await expect(page.locator('[data-message-id]').first()).toHaveAttribute(
    'data-message-id',
    'old-30',
  )
  await page.screenshot({ path: test.info().outputPath('continuous-stream.png') })
  await page.reload()
  await expect(markdown).toContainText(tails[2]!.trim())
  const restored = await page.evaluate(
    () => (window as typeof window & { streamSamples: Sample[] }).streamSamples,
  )
  expect(new Set(restored.map((sample) => sample.length)).size).toBe(1)
})

test('scrolling up interrupts following while queued text continues rendering', async ({
  page,
}) => {
  await stubConversation(page, { manyMessages: true, replyChunks: [first, ...tails] })
  await page.goto(`/conversations/${conversationId}`)
  await page.getByRole('textbox', { name: '交易想法' }).fill('检查上滚暂停跟随')
  await page.getByRole('button', { name: '发送研究想法' }).click()
  await page.getByRole('textbox', { name: '交易想法' }).fill('下一轮草稿')
  const markdown = page.locator('[data-message-id="assistant-1"] .markdown-content')
  await expect(markdown).toContainText('新增段落 1')
  const viewport = page.locator('.message-scroll')
  const before = await viewport.evaluate((el) => el.scrollTop)
  const bounds = (await viewport.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 100)
  await page.mouse.wheel(0, -400)
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeLessThan(before - 200)
  const reading = await viewport.evaluate((el) => el.scrollTop)
  await expect(
    page.getByRole('button', { name: '发送研究想法', includeHidden: true }),
  ).toBeEnabled()
  await expect(markdown).toContainText(tails[2]!.trim())
  expect(await viewport.evaluate((el) => el.scrollTop)).toBe(reading)
  await expect(page.locator('[data-message-id]').first()).toHaveAttribute(
    'data-message-id',
    'old-30',
  )
  await page.getByRole('button', { name: '回到最新消息', exact: true }).click()
  await expect
    .poll(() => viewport.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
    .toBeLessThan(1)
})

test('a large final chunk appears a few characters per frame even after the Run completes', async ({
  page,
}) => {
  const text = '文字逐步出现'.repeat(180)
  await stubConversation(page, { replyChunks: [text] })
  await probe(page)
  await page.goto(`/conversations/${conversationId}`)
  const input = page.getByRole('textbox', { name: '交易想法' })
  await input.fill('检查大块文本')
  await input.press('Enter')
  await input.fill('下一轮草稿')
  await expect(
    page.getByRole('button', { name: '发送研究想法', includeHidden: true }),
  ).toBeEnabled()
  const markdown = page.locator('[data-message-id="assistant-1"] .markdown-content')
  expect((await markdown.textContent())!.trim().length).toBeLessThan(text.length)
  await expect(markdown).toHaveText(text)
  const samples = await page.evaluate(
    () => (window as typeof window & { streamSamples: Sample[] }).streamSamples,
  )
  const steps = samples.slice(1).map((sample, index) => sample.length - samples[index]!.length)
  expect(steps.every((step) => step >= 0 && step <= 4)).toBe(true)
  expect(new Set(samples.map((sample) => sample.length)).size).toBeGreaterThan(270)
})

test('reduced motion renders complete chunks without a reveal animation', async ({ page }) => {
  const chunks = ['首段'.repeat(100), '\n\n' + '后段'.repeat(100)]
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await stubConversation(page, { replyChunks: chunks })
  await probe(page)
  await page.goto(`/conversations/${conversationId}`)
  await page.getByRole('textbox', { name: '交易想法' }).fill('检查减少动态效果')
  await page.getByRole('button', { name: '发送研究想法' }).click()
  const markdown = page.locator('[data-message-id="assistant-1"] .markdown-content')
  await expect(markdown).toContainText('后段'.repeat(100))
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { streamSamples: Sample[] }).streamSamples.at(-1)?.length,
      ),
    )
    .toBe(402)
  const samples = await page.evaluate(
    () => (window as typeof window & { streamSamples: Sample[] }).streamSamples,
  )
  expect(new Set(samples.map((sample) => sample.length))).toEqual(new Set([201, 402]))
})
