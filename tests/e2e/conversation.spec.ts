import { expect, test, type Locator } from '@playwright/test'
import { conversationId, message, strategyCard, stubConversation } from './conversation-fixtures'
import { anonymous, authResponse, envelope, stubGoogle } from './auth-fixtures'

test('asset detail aligns its header and resizes directly from its border', async ({
  page,
  isMobile,
}) => {
  await stubConversation(page, {
    initialMessages: [message('asset-message', 1, 'assistant', '策略已生成', [strategyCard])],
  })
  await page.goto(`/conversations/${conversationId}`)
  const input = page.getByRole('textbox', { name: '交易想法' })
  await input.fill('调整面板时保留草稿')
  await page.getByRole('button', { name: '查看资产', exact: true }).click()
  const panel = page.locator('.asset-detail-panel')
  await page
    .locator('.asset-list-panel')
    .getByRole('button', { name: /BTC 双均线策略/ })
    .click()
  await expect(panel).toBeVisible()
  await expect(page.locator('.split-pane')).not.toHaveClass(/is-transitioning/)
  const bounds = (await panel.boundingBox())!
  const header = (await panel.locator('header').boundingBox())!
  const toolbar = (await page.locator('.workspace-toolbar').boundingBox())!
  expect(toolbar.height).toBe(48)
  expect(bounds.y).toBe(4)
  expect(header.height).toBe(44)
  expect(header.y + header.height).toBe(toolbar.y + toolbar.height)
  const handle = page.getByRole('separator')
  if (isMobile) {
    await expect(handle).toBeHidden()
  } else {
    await expect(handle).toBeVisible()
    const edge = (await handle.boundingBox())!
    expect(edge.x + edge.width / 2).toBeCloseTo(bounds.x, 1)
    await page.clock.install({ time: new Date('2026-09-08T00:00:00Z') })
    await page.clock.pauseAt(new Date('2026-09-08T00:00:01Z'))
    const hoverY = Math.round(bounds.y + bounds.height * 0.3)
    await page.mouse.move(bounds.x, hoverY)
    const hint = page.getByRole('tooltip', { name: '拖动调整宽度' })
    const grip = page.locator('.split-grip')
    await expect(grip).toHaveCSS('opacity', '0.4')
    await page.clock.runFor(399)
    await expect(hint).toBeHidden()
    await page.clock.runFor(1)
    await expect(hint).toBeVisible()
    const hintBounds = (await hint.boundingBox())!
    const gripBounds = (await grip.boundingBox())!
    expect(hintBounds.x + hintBounds.width).toBeLessThan(bounds.x)
    expect(hintBounds.y + hintBounds.height / 2).toBeCloseTo(hoverY, 1)
    expect(gripBounds.y + gripBounds.height / 2).toBeCloseTo(bounds.y + bounds.height / 2, 1)
    await page.screenshot({ path: test.info().outputPath('panel-edge-hover.png') })
    await page.mouse.down()
    await expect(hint).toBeHidden()
    await expect(grip).toHaveCSS('opacity', '1')
    await page.mouse.move(bounds.x - 100, hoverY + 30, { steps: 5 })
    await expect(hint).toBeHidden()
    await expect(grip).toHaveCSS('opacity', '1')
    const resized = (await panel.boundingBox())!
    expect(resized.width - bounds.width).toBeCloseTo(100, 0)
    await page.screenshot({ path: test.info().outputPath('panel-edge-dragging.png') })
    await page.mouse.up()
    await expect(grip).toHaveCSS('opacity', '0.4')
    // Starting a drag during the hover delay must cancel the pending tooltip.
    await page.mouse.move(resized.x - 30, hoverY)
    await page.mouse.move(resized.x, hoverY)
    await page.clock.runFor(200)
    await page.mouse.down()
    await page.clock.runFor(600)
    await expect(hint).toBeHidden()
    await expect(grip).toHaveCSS('opacity', '1')
    await page.mouse.up()
    await page.mouse.move(resized.x - 30, hoverY)
    await page.clock.runFor(600)
    await expect(hint).toBeHidden()
    await handle.press('Home')
    await expect(handle).toHaveAttribute('aria-valuenow', '35')
    await handle.press('End')
    await expect(handle).toHaveAttribute('aria-valuenow', '65')
    await handle.press('ArrowLeft')
    await expect(handle).toHaveAttribute('aria-valuenow', '63')
    await page.clock.resume()
  }
  await panel.getByRole('button', { name: '全屏', exact: true }).click()
  await expect(handle).toBeHidden()
  await expect(page.getByRole('tooltip')).toBeHidden()
  expect((await panel.boundingBox())!.y).toBe(4)
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(input).toHaveValue('调整面板时保留草稿')
})

for (const source of ['list', 'detail', 'list-detail']) {
  test(`asset ${source} slides in from the right and reverses without resizing its content`, async ({
    page,
    isMobile,
  }) => {
    await stubConversation(page, {
      initialMessages: [message('asset-message', 1, 'assistant', '策略已生成', [strategyCard])],
    })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(`/conversations/${conversationId}`)
    const input = page.getByRole('textbox', { name: '交易想法' })
    await input.fill('面板动画期间保留草稿')
    const originalInput = await input.elementHandle()
    const panelSelector = source === 'list' ? '.asset-list-panel' : '.asset-detail-panel'
    const panel = page.locator(panelSelector)
    if (source === 'list-detail') {
      await page.getByRole('button', { name: '查看资产', exact: true }).click()
      await expect(page.locator('.split-pane')).not.toHaveClass(/is-transitioning/)
    }
    async function capture(trigger: Locator) {
      const recording = trigger.evaluate(
        (button, selector) =>
          new Promise<{ x: number; width: number; chatWidth: number }[]>((resolve) => {
            button.addEventListener(
              'click',
              () => {
                const frames: { x: number; width: number; chatWidth: number }[] = []
                const start = performance.now()
                function sample() {
                  const panel = document.querySelector(selector)!
                  const rect = panel.getBoundingClientRect()
                  if (rect.width)
                    frames.push({
                      x: rect.x,
                      width: rect.width,
                      chatWidth: document.querySelector('.chat-column')!.getBoundingClientRect()
                        .width,
                    })
                  if (performance.now() - start < 350) requestAnimationFrame(sample)
                  else resolve(frames)
                }
                requestAnimationFrame(sample)
              },
              { once: true },
            )
          }),
        panelSelector,
      )
      await trigger.click()
      return recording
    }
    const opening = await capture(
      source === 'list'
        ? page.getByRole('button', { name: '查看资产', exact: true })
        : source === 'list-detail'
          ? page.locator('.asset-list-panel .message-card').first()
          : page.locator('.message-list-shell .message-card').first(),
    )
    if (!isMobile) {
      expect(opening[0]!.chatWidth - opening.at(-1)!.chatWidth).toBeGreaterThan(20)
      for (let i = 1; i < opening.length; i++)
        expect(opening[i]!.chatWidth).toBeLessThanOrEqual(opening[i - 1]!.chatWidth + 1)
    }
    expect(opening[0]!.x - opening.at(-1)!.x).toBeGreaterThan(20)
    expect(
      opening.some((frame) => frame.x > opening.at(-1)!.x + 10 && frame.x < opening[0]!.x - 10),
    ).toBe(true)
    expect(
      Math.max(...opening.map((frame) => frame.width)) -
        Math.min(...opening.map((frame) => frame.width)),
    ).toBeLessThan(1)
    const closing = await capture(
      source === 'list'
        ? page.getByRole('button', { name: '查看资产', exact: true })
        : panel.getByRole('button', { name: '关闭', exact: true }),
    )
    expect(closing.at(-1)!.x - closing[0]!.x).toBeGreaterThan(20)
    await expect(panel).toBeHidden()
    await expect(input).toHaveValue('面板动画期间保留草稿')
    expect(await input.evaluate((element, original) => element === original, originalInput)).toBe(
      true,
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByRole('button', { name: '查看资产', exact: true }).click()
    await expect(page.locator('.split-pane')).not.toHaveClass(/is-transitioning/)
    await expect(page.locator('.asset-list-panel')).toHaveCSS('transform', 'none')
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
  })
}

test('new research streams, locks only send, submits multiple answers and restores history', async ({
  page,
  isMobile,
}) => {
  const { calls } = await stubConversation(page)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/new-task')
  const input = page.getByRole('textbox', { name: '交易想法' })
  await input.fill('**用户纯文本** <b>不是 HTML</b>')
  await input.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/conversations/${conversationId}$`))
  await expect(page.locator('.user-bubble')).toHaveText('**用户纯文本** <b>不是 HTML</b>')
  expect(await page.locator('.user-bubble b, .user-bubble strong').count()).toBe(0)
  await expect(page.getByRole('heading', { name: '研究结论' })).toBeVisible()
  await expect(page.locator('.assistant-message table')).toHaveCount(0)
  await input.fill('保留给下一轮的草稿')
  await expect(input).toBeEditable()
  await expect(page.getByRole('button', { name: '发送研究想法' })).toBeDisabled()
  await input.press('Enter')
  expect(calls.filter((c) => c.method === 'send')).toHaveLength(0)
  await expect(page.locator('.assistant-message table')).toBeVisible()
  expect(await page.locator('.assistant-message script').count()).toBe(0)
  expect(calls.filter((c) => c.method === 'create')).toHaveLength(1)
  await expect(page.locator('.chat-input .research-composer textarea')).toHaveValue(
    '保留给下一轮的草稿',
  )
  const questions = page.getByRole('form', { name: '补充研究信息' })
  await expect(questions).toBeVisible()
  await expect(input).toBeVisible()
  await expect(questions.locator('.question-progress')).toHaveText('1 / 2')
  await expect(questions.getByRole('heading', { name: '选择执行周期' })).toHaveCount(0)
  const heightWithQuestions = (await page.locator('.chat-input').boundingBox())!.height
  await expect
    .poll(() =>
      page.evaluate(() => {
        const messages = document.querySelectorAll('[data-message-id]')
        const last = messages[messages.length - 1]!.getBoundingClientRect()
        return last.bottom <= document.querySelector('.chat-input')!.getBoundingClientRect().top
      }),
    )
    .toBe(true)
  await page.getByRole('button', { name: '现货', exact: true }).click()
  await expect(questions.locator('.question-progress')).toHaveText('2 / 2')
  expect(calls.filter((c) => c.method === 'send')).toHaveLength(0)
  await expect(page.getByRole('button', { name: '跳过', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '自定义', exact: true }).click()
  await page.getByRole('textbox', { name: '选择执行周期' }).fill('15m')
  await page.getByRole('textbox', { name: '选择执行周期' }).press('Enter')
  await expect(questions).toBeHidden()
  await expect
    .poll(async () => (await page.locator('.chat-input').boundingBox())!.height)
    .toBeLessThan(heightWithQuestions)
  await expect(page.locator('.assistant-message .answered-questions')).toHaveCount(0)
  await expect(page.locator('.user-message').filter({ hasText: '选择交易市场' })).toContainText(
    '15m',
  )
  expect(calls.filter((c) => c.method === 'send').at(-1)?.body).toEqual({
    reply_to_message_id: 'assistant-1',
    structured_answers: [
      { question_id: 'market', value: '现货' },
      { question_id: 'timeframe', custom_text: '15m' },
    ],
  })
  await expect(page.getByRole('button', { name: '发送研究想法' })).toBeEnabled()
  await page.locator('.message-card').first().click()
  await expect(page.getByText('详情将在后续接入。')).toBeVisible()
  if (!isMobile) await expect(page.getByRole('separator')).toBeVisible()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.locator('.asset-list-panel .message-card').first().click()
  await expect(page.getByText('详情将在后续接入。')).toBeVisible()
  await page.getByRole('button', { name: '全屏', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(input).toHaveValue('保留给下一轮的草稿')
  await page.locator('[data-card-id="replay-card"]').first().click()
  await expect(page.getByRole('heading', { name: 'Replay', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.locator('.user-message')).toHaveCount(2)
  await expect(page.locator('.assistant-message')).toHaveCount(2)
  await expect(page.locator('.assistant-message .answered-questions')).toHaveCount(0)
  await expect(page.locator('.user-message').filter({ hasText: '选择交易市场' })).toContainText(
    '15m',
  )
  await expect(input).toHaveValue('保留给下一轮的草稿')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  expect(errors).toEqual([])
})

test('a failed send retries the frozen body with one key and no duplicate user bubble', async ({
  page,
}) => {
  const { calls } = await stubConversation(page, { failSendOnce: true })
  await page.goto(`/conversations/${conversationId}`)
  const input = page.getByRole('textbox', { name: '交易想法' })
  await input.fill('第一条消息')
  await page.getByRole('button', { name: '发送研究想法' }).click()
  await expect(page.getByRole('button', { name: '重新发送这条消息' })).toBeVisible()
  await input.fill('新的草稿')
  await page.getByRole('button', { name: '重新发送这条消息' }).click()
  await page.getByRole('button', { name: '收起问题，改用文字回复' }).click()
  await expect(page.getByRole('button', { name: '发送研究想法' })).toBeEnabled()
  expect(calls.filter((c) => c.method === 'send')).toHaveLength(2)
  expect(calls[0]!.key).toBe(calls[1]!.key)
  expect(calls[1]!.body).toEqual({ content: '第一条消息' })
  await expect(page.locator('.user-message')).toHaveCount(1)
  await expect(input).toHaveValue('新的草稿')
})

test('EOF reconnects the original Run without resending a message', async ({ page }) => {
  const { calls } = await stubConversation(page, { disconnectOnce: true })
  await page.goto('/new-task')
  await page.getByRole('textbox', { name: '交易想法' }).fill('断线恢复测试')
  await page.getByRole('button', { name: '发送研究想法' }).click()
  await expect(page.getByText('正在恢复连接…', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '交易想法' }).fill('下一轮')
  await page.getByRole('button', { name: '收起问题，改用文字回复' }).click()
  await expect(page.getByRole('button', { name: '发送研究想法' })).toBeEnabled()
  await expect(page.locator('.assistant-message')).toHaveCount(1)
  expect(calls).toHaveLength(1)
})

test('earlier messages preserve scroll position and conversation drafts are isolated', async ({
  page,
}) => {
  await stubConversation(page, { manyMessages: true })
  await page.goto(`/conversations/${conversationId}`)
  await expect(page.locator('[data-message-id]')).toHaveCount(50)
  await page.locator('.message-scroll').evaluate((el) => {
    el.scrollTop = 0
  })
  await page.getByRole('button', { name: '加载更早的消息' }).click()
  await expect(page.locator('[data-message-id]')).toHaveCount(80)
  expect(await page.locator('.message-scroll').evaluate((el) => el.scrollTop)).toBeGreaterThan(500)
  await page.getByRole('textbox', { name: '交易想法' }).fill('仅属于当前会话')
  await page.goto('/new-task')
  await expect(page.getByRole('textbox', { name: '交易想法' })).toHaveValue('')
})

test('floating composer leaves messages readable and stays aligned through resizing', async ({
  page,
  isMobile,
}) => {
  await stubConversation(page, {
    initialMessages: Array.from({ length: 80 }, (_, i) =>
      message(
        `old-${i}`,
        i + 1,
        i % 2 ? 'assistant' : 'user',
        `历史消息 ${i + 1}`,
        i === 79 ? [strategyCard] : [],
      ),
    ),
  })
  await page.goto(`/conversations/${conversationId}`)
  await expect(page.locator('[data-message-id]')).toHaveCount(50)
  const expectAligned = async () => {
    await expect
      .poll(() =>
        page.evaluate(() => {
          const message = document.querySelector('.assistant-message')!.getBoundingClientRect()
          const composer = document
            .querySelector('.chat-input .research-composer')!
            .getBoundingClientRect()
          return Math.max(
            Math.abs(message.left - composer.left),
            Math.abs(message.right - composer.right),
          )
        }),
      )
      .toBeLessThan(0.1)
  }
  const expectFloating = async () => {
    await expect
      .poll(() =>
        page.evaluate(() => {
          const viewport = document.querySelector('.message-scroll')!.getBoundingClientRect()
          const input = document.querySelector('.chat-input')!.getBoundingClientRect()
          const messages = document.querySelectorAll('[data-message-id]')
          const last = messages[messages.length - 1]!.getBoundingClientRect()
          return {
            reachesPageBottom: Math.abs(viewport.bottom - innerHeight) < 1,
            inputOverlapsMessages: input.top < viewport.bottom && input.top > viewport.top,
            lastMessageClear: last.bottom <= input.top,
          }
        }),
      )
      .toEqual({ reachesPageBottom: true, inputOverlapsMessages: true, lastMessageClear: true })
  }
  await expectAligned()
  await expectFloating()
  const viewport = page.locator('.message-scroll')
  const jump = page.getByRole('button', { name: '回到最新消息', exact: true })
  async function distanceFromBottom(distance: number) {
    await viewport.evaluate((el, gap) => {
      el.scrollTop = el.scrollHeight - el.clientHeight - gap
      el.dispatchEvent(new Event('scroll'))
    }, distance)
  }
  await distanceFromBottom(20)
  await expect(jump).toBeHidden()
  await distanceFromBottom(50)
  await expect(jump).toBeHidden()
  await distanceFromBottom(70)
  await expect(jump).toBeVisible()
  await distanceFromBottom(30)
  await expect(jump).toBeVisible()
  await distanceFromBottom(5)
  await expect(jump).toBeHidden()
  await distanceFromBottom(0)
  const scrollTop = await viewport.evaluate((el) => el.scrollTop)
  const dock = (await page.locator('.chat-input').boundingBox())!
  await page.mouse.move(dock.x + dock.width / 2, dock.y + 8)
  await page.mouse.wheel(0, -400)
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeLessThan(scrollTop)
  const latest = page.getByRole('button', { name: '回到最新消息', exact: true })
  await expect(latest).toBeVisible()
  expect((await latest.boundingBox())!.y + (await latest.boundingBox())!.height).toBeLessThan(
    dock.y,
  )
  await page.screenshot({ path: test.info().outputPath('floating-composer-gradient.png') })
  await latest.click()
  await expectFloating()
  await page.getByRole('button', { name: '查看资产', exact: true }).click()
  const panel = page.locator(isMobile ? '.asset-list-panel' : '.asset-detail-panel')
  await expect(page.locator('.asset-list-panel')).toBeVisible()
  if (!isMobile) {
    await expectAligned()
    await expectFloating()
    await page
      .locator('.asset-list-panel')
      .getByRole('button', { name: /BTC 双均线策略/ })
      .click()
    const edge = (await page.getByRole('separator').boundingBox())!
    await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2)
    await page.mouse.down()
    await page.mouse.move(edge.x + edge.width / 2 - 80, edge.y + edge.height / 2, { steps: 5 })
    await page.mouse.up()
    await expectAligned()
    await expectFloating()
    await page.screenshot({ path: test.info().outputPath('composer-aligned-panel.png') })
    await page.getByRole('button', { name: '收起侧栏', exact: true }).click()
    await expectAligned()
  }
  if (isMobile) await page.getByRole('button', { name: '查看资产', exact: true }).click()
  else await panel.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(panel).toBeHidden()
  await expectAligned()
  await expectFloating()
  await page.screenshot({ path: test.info().outputPath('composer-aligned.png') })
})

test('composer grows and shrinks with text, caps at sixteen lines and restores its height', async ({
  page,
  isMobile,
}) => {
  await stubConversation(page, { manyMessages: true })
  if (!isMobile) await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto(`/conversations/${conversationId}`)
  const input = page.getByRole('textbox', { name: '交易想法' })
  await expect(input).toBeVisible()
  await expect(page.locator('[data-message-id]')).toHaveCount(50)
  const viewport = page.locator('.message-scroll')
  await expect
    .poll(() => viewport.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
    .toBeLessThan(1)
  const initialScrollTop = await viewport.evaluate((el) => el.scrollTop)
  const paddingBottom = () =>
    page
      .locator('.message-list')
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingBottom))
  const initialPadding = await paddingBottom()
  const expectScrollUnchanged = async (scrollTop: number) => {
    // Wait for the input measurement, padding update and any scheduled scrolling to settle.
    await expect
      .poll(() =>
        page.evaluate(() =>
          Math.abs(
            Number.parseFloat(
              getComputedStyle(document.querySelector('.message-list')!).paddingBottom,
            ) -
              document.querySelector('.chat-input')!.getBoundingClientRect().height -
              24,
          ),
        ),
      )
      .toBeLessThan(1)
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    )
    expect(await viewport.evaluate((el) => el.scrollTop)).toBe(scrollTop)
  }
  const expectRows = async (rows: number) => {
    await expect
      .poll(() =>
        input.evaluate(
          (el) =>
            el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).lineHeight),
        ),
      )
      .toBeCloseTo(rows, 1)
  }
  await expectRows(2)
  await input.fill('第一行\n第二行')
  await input.press('Shift+Enter')
  await expect(input).toHaveValue('第一行\n第二行\n')
  await expectRows(3)
  await expectScrollUnchanged(initialScrollTop)
  expect(await paddingBottom()).toBeGreaterThan(initialPadding)
  await input.press('Backspace')
  await expectRows(2)
  await expectScrollUnchanged(initialScrollTop)
  await input.fill(Array.from({ length: 20 }, (_, i) => `研究条件 ${i + 1}`).join('\n'))
  await expectRows(16)
  await expect(input).toHaveCSS('overflow-y', 'auto')
  await input.press('Shift+Enter')
  await expectRows(16)
  await expect
    .poll(() => input.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
    .toBeLessThan(5)
  await expectScrollUnchanged(initialScrollTop)
  await page.screenshot({ path: test.info().outputPath('composer-sixteen-lines.png') })
  await input.fill('删回一行')
  await expectRows(2)
  await expect(input).toHaveCSS('overflow-y', 'hidden')
  expect(await input.evaluate((el) => el.scrollTop)).toBe(0)
  await expectScrollUnchanged(initialScrollTop)
  expect(await paddingBottom()).toBeCloseTo(initialPadding, 1)
  // Reading older messages must also stay still while the input grows and shrinks.
  const bounds = (await viewport.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 80)
  await page.mouse.wheel(0, -400)
  const latest = page.getByRole('button', { name: '回到最新消息', exact: true })
  await expect(latest).toBeVisible()
  const readingScrollTop = await viewport.evaluate((el) => el.scrollTop)
  await input.fill('多行草稿\n'.repeat(8))
  await expectRows(9)
  await expectScrollUnchanged(readingScrollTop)
  await input.fill('删回一行')
  await expectRows(2)
  await expectScrollUnchanged(readingScrollTop)
  await latest.click()
  const wrapped = '这是随面板宽度自动折行的研究条件。'.repeat(10)
  await input.fill(wrapped)
  await expect
    .poll(() =>
      input.evaluate(
        (el) =>
          el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).lineHeight),
      ),
    )
    .toBeGreaterThan(2)
  const wideHeight = (await input.boundingBox())!.height
  if (!isMobile) {
    await page.getByRole('button', { name: '查看资产', exact: true }).click()
    await expect.poll(async () => (await input.boundingBox())!.height).toBeGreaterThan(wideHeight)
    await page.getByRole('button', { name: '查看资产', exact: true }).click()
    await expect.poll(async () => (await input.boundingBox())!.height).toBeCloseTo(wideHeight, 0)
  }
  await page.reload()
  await expect(input).toHaveValue(wrapped)
  await expect.poll(async () => (await input.boundingBox())!.height).toBeCloseTo(wideHeight, 0)
  await input.fill('发送后恢复两行')
  await input.press('Enter')
  await expect(input).toHaveValue('')
  await expectRows(2)
})

test('guest explicit submit continues once after login; ordinary drafts never auto-send', async ({
  page,
}) => {
  const { calls } = await stubConversation(page)
  let loggedIn = false
  await stubGoogle(page)
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      status: loggedIn ? 200 : 401,
      json: loggedIn ? envelope(authResponse) : anonymous,
    }),
  )
  await page.route('**/api/auth/google/config', (route) =>
    route.fulfill({ json: envelope({ client_id: 'test', nonce: 'test' }) }),
  )
  await page.route('**/api/auth/google', (route) => {
    loggedIn = true
    return route.fulfill({ json: envelope(authResponse) })
  })
  await page.goto('/')
  await page.getByRole('textbox', { name: '交易想法' }).fill('访客发起的研究')
  await page.getByRole('button', { name: '发送研究想法' }).click()
  await expect(page).toHaveURL(/\/login\?returnTo=/)
  await page.getByRole('button', { name: '使用 Google 继续' }).click()
  await expect(page).toHaveURL(new RegExp(`/conversations/${conversationId}$`))
  await expect(page.locator('.user-bubble')).toHaveText('访客发起的研究')
  expect(calls.filter((c) => c.method === 'create')).toHaveLength(1)
})

test('question drafts restore on reload and older questions do not reappear in a later round', async ({
  page,
}) => {
  await stubConversation(page)
  await page.goto('/new-task')
  await page.getByRole('textbox', { name: '交易想法' }).fill('需要澄清的研究')
  await page.getByRole('button', { name: '发送研究想法' }).click()
  await page.getByRole('button', { name: '现货', exact: true }).click()
  await page.getByRole('button', { name: '自定义', exact: true }).click()
  await page.getByRole('textbox', { name: '选择执行周期' }).fill('15m')
  await expect(page.getByRole('button', { name: '跳过', exact: true })).toBeEnabled()
  await page.reload()
  await expect(page.getByRole('textbox', { name: '选择执行周期' })).toHaveValue('15m')
  await page.getByRole('button', { name: '上一题', exact: true }).click()
  await expect(page.getByRole('button', { name: '现货', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page
    .locator('.question-navigation')
    .getByRole('button', { name: '下一题', exact: true })
    .click()
  await expect(page.getByRole('textbox', { name: '选择执行周期' })).toHaveValue('15m')
  await page.getByRole('textbox', { name: '交易想法' }).fill('改为用文字直接继续研究')
  await page.getByRole('button', { name: '发送研究想法' }).click()
  await expect(page.locator('.clarification-questions')).toBeHidden()
  await expect(page.getByText('问题记录 · 2 题未提交', { exact: true })).toBeVisible()
  await expect(page.locator('.assistant-message')).toHaveCount(2)
  await page.reload()
  await expect(page.locator('.clarification-questions')).toBeHidden()
})

test('cancelling guest login restores editable input without an automatic submission later', async ({
  page,
}) => {
  const { calls } = await stubConversation(page)
  let loggedIn = false
  await stubGoogle(page)
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      status: loggedIn ? 200 : 401,
      json: loggedIn ? envelope(authResponse) : anonymous,
    }),
  )
  await page.route('**/api/auth/google/config', (route) =>
    route.fulfill({ json: envelope({ client_id: 'test', nonce: 'test' }) }),
  )
  await page.route('**/api/auth/google', (route) => {
    loggedIn = true
    return route.fulfill({ json: envelope(authResponse) })
  })
  await page.goto('/')
  await page.getByRole('textbox', { name: '交易想法' }).fill('先保留，稍后再发')
  await page.getByRole('button', { name: '发送研究想法' }).click()
  await expect(page).toHaveURL(/\/login\?returnTo=/)
  await page.locator('a[href="/"]').first().click()
  await expect(page.getByRole('textbox', { name: '交易想法' })).toHaveValue('先保留，稍后再发')
  await page.goto('/login')
  await page.getByRole('button', { name: '使用 Google 继续' }).click()
  await expect(page).toHaveURL(/\/new-task$/)
  await expect(page.getByRole('textbox', { name: '交易想法' })).toHaveValue('先保留，稍后再发')
  expect(calls).toHaveLength(0)
})

test('edits made while creating a conversation are carried into its composer', async ({ page }) => {
  await stubConversation(page)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(/\/api\/conversations$/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    await gate
    return route.fallback()
  })
  await page.goto('/new-task')
  const input = page.getByRole('textbox', { name: '交易想法' })
  await input.fill('创建研究')
  await page.getByRole('button', { name: '发送研究想法' }).click()
  await input.fill('创建时写下的新草稿')
  release()
  await expect(page).toHaveURL(new RegExp(`/conversations/${conversationId}$`))
  await expect(input).toHaveValue('创建时写下的新草稿')
  await page.goto('/new-task')
  await expect(input).toHaveValue('')
})
