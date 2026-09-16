import { expect, test } from '@playwright/test'
import { envelope } from './auth-fixtures'
import { currentStrategy } from './strategy-fixtures'
import {
  conversationId,
  message,
  replayCard,
  strategyCard,
  stubConversation,
} from './conversation-fixtures'

test('asset list toggles below the toolbar and opens shared cards without reopening on detail close', async ({
  page,
  isMobile,
}) => {
  await stubConversation(page, {
    initialMessages: [
      message('assets', 1, 'assistant', '策略与回测已准备好。', [strategyCard, replayCard]),
    ],
  })
  await page.route(/\/api\/conversations\/[^/?]+\/assets(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({
        strategy: { id: 'strategy-1', name: strategyCard.title, status: 'draft', revision: 1 },
        replays: {
          items: [
            {
              id: 'replay-1',
              name: replayCard.title,
              symbol: 'BTC/USDT',
              execution_timeframe: '1h',
            },
          ],
          page: 1,
          total: 1,
          total_pages: 1,
        },
      }),
    }),
  )
  await page.goto(`/conversations/${conversationId}`)
  const toggle = page.getByRole('button', { name: '查看资产', exact: true })
  const panel = page.locator('.asset-list-panel')
  const detail = page.locator('.asset-detail-panel')
  const chat = page.locator('.chat-column')
  const input = page.getByRole('textbox', { name: '交易想法' })
  await input.fill('查看资产时保留草稿')
  const originalWidth = (await chat.boundingBox())!.width
  const toggleBounds = (await toggle.boundingBox())!
  await expect(toggle).toHaveText('')
  await expect(toggle.locator('.iconify')).toHaveCSS('mask-image', /url\(/)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  const normalBackground = await toggle.evaluate((el) => getComputedStyle(el).backgroundColor)
  if (!isMobile) {
    await toggle.hover()
    await expect(page.getByRole('tooltip', { name: '研究资产' })).toBeVisible()
    await expect
      .poll(() => toggle.evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe(normalBackground)
    await page.screenshot({ path: test.info().outputPath('assets-hover.png') })
  }
  await toggle.click()
  await page.mouse.move(0, 0)
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(panel).toBeVisible()
  const canvas = await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor)
  await expect(panel).toHaveCSS('background-color', canvas)
  await expect(page.locator('.split-pane')).not.toHaveClass(/is-transitioning/)
  await expect(panel).toHaveCSS('transform', 'none')
  expect(await toggle.boundingBox()).toEqual(toggleBounds)
  expect((await panel.boundingBox())!.y).toBe(52)
  await expect(page.getByRole('separator')).toBeHidden()
  await expect(panel.getByRole('button', { name: '全屏', exact: true })).toBeHidden()
  await expect(panel.locator('.message-card')).toHaveCount(2)
  await expect(panel.locator('header button')).toHaveCount(0)
  await expect(panel.locator('header')).toHaveCSS('border-bottom-width', '0px')
  await expect(panel.getByRole('heading')).toHaveCount(1)
  await expect(panel.locator('.message-card').first()).toContainText(strategyCard.title)
  await expect(panel.locator('.message-card').last()).toContainText(replayCard.title)
  const panelBounds = (await panel.boundingBox())!
  expect(page.viewportSize()!.width - panelBounds.x - panelBounds.width).toBe(8)
  expect(page.viewportSize()!.height - panelBounds.y - panelBounds.height).toBe(8)
  const cardBounds = (await panel.locator('.message-card').first().boundingBox())!
  expect(cardBounds.x - panelBounds.x).toBe(20)
  expect(panelBounds.x + panelBounds.width - cardBounds.x - cardBounds.width).toBe(20)
  await expect(panel.locator('header')).toHaveCSS('padding-left', '20px')
  if (!isMobile) {
    expect(panelBounds.width).toBe(384)
    expect(originalWidth - (await chat.boundingBox())!.width).toBe(396)
    expect((await chat.boundingBox())!.x + (await chat.boundingBox())!.width).toBeLessThan(
      (await panel.boundingBox())!.x,
    )
  } else {
    expect((await panel.boundingBox())!.x).toBe(4)
    expect((await panel.boundingBox())!.width).toBe(page.viewportSize()!.width - 12)
  }
  await page.screenshot({ path: test.info().outputPath('assets-open.png') })
  await toggle.click()
  await expect(panel).toBeHidden()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect((await chat.boundingBox())!.width).toBe(originalWidth)
  await toggle.click()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(toggle).toBeFocused()

  for (const name of [strategyCard.title, replayCard.title]) {
    await toggle.click()
    await panel.getByRole('button', { name: new RegExp(name) }).click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(
      detail.getByRole('heading', {
        name: name === strategyCard.title ? currentStrategy.change_summary! : name,
        exact: true,
      }),
    ).toBeVisible()
    if (!isMobile) expect((await detail.boundingBox())!.width).toBeGreaterThan(400)
    await detail.getByRole('button', { name: '关闭', exact: true }).click()
    await expect(detail).toBeHidden()
    await expect(panel).toBeHidden()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(input).toHaveValue('查看资产时保留草稿')
  }
  await page.locator('.message-list-shell .message-card').first().click()
  await page.keyboard.press('Escape')
  await expect(detail).toBeHidden()
  await expect(panel).toBeHidden()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.message-list-shell .message-card').first()).toBeFocused()
})

test('list and detail finish their own transitions when detail closes and the list reopens', async ({
  page,
}) => {
  await stubConversation(page, {
    initialMessages: [message('assets', 1, 'assistant', '策略已生成', [strategyCard])],
  })
  await page.goto(`/conversations/${conversationId}`)
  await page.locator('.agent-workspace').evaluate((el) => {
    // Deliberately different durations catch a shared transition or stale completion callback.
    const style = (el as HTMLElement).style
    style.setProperty('--motion-asset-list', '500ms')
    style.setProperty('--motion-asset-detail', '160ms')
  })
  const toggle = page.getByRole('button', { name: '查看资产', exact: true })
  const list = page.locator('.asset-list-panel')
  const detail = page.locator('.asset-detail-panel')
  await toggle.click()
  await expect(page.locator('.split-pane')).not.toHaveClass(/is-transitioning/)
  await list.locator('.message-card').click()
  await expect(detail).toBeVisible()
  await expect(list).toHaveAttribute('inert', '')
  await page.keyboard.press('Escape')
  await expect(detail).toBeHidden()
  await toggle.click()
  await expect(list).toBeVisible()
  await expect(page.locator('.split-pane')).not.toHaveClass(/is-transitioning/)
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await list.locator('.message-card').click()
  await expect(
    detail.getByRole('heading', { name: currentStrategy.change_summary!, exact: true }),
  ).toBeVisible()
  await detail.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(detail).toBeHidden()
  await expect(list).toBeHidden()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
})

test('asset list handles rapid toggles, narrow desktop widths and reduced motion', async ({
  page,
  isMobile,
}) => {
  await stubConversation(page, { manyMessages: true })
  if (!isMobile) await page.setViewportSize({ width: 1024, height: 900 })
  await page.goto(`/conversations/${conversationId}`)
  await expect(page.locator('[data-message-id]')).toHaveCount(50)
  const scroll = page.locator('.message-scroll')
  await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight / 2
  })
  const scrollTop = await scroll.evaluate((el) => el.scrollTop)
  const toggle = page.getByRole('button', { name: '查看资产', exact: true })
  for (let i = 0; i < 5; i++) {
    await toggle.evaluate((el) => (el as HTMLButtonElement).click())
    await page.waitForTimeout(40)
  }
  await expect(page.locator('.split-pane')).not.toHaveClass(/is-transitioning/)
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.asset-list-panel')).toBeVisible()
  await expect(page.locator('.asset-list-panel')).toHaveCSS('transform', 'none')
  if (!isMobile) {
    await expect(page.locator('.asset-list-panel')).toHaveAttribute('role', 'region')
    expect((await page.locator('.asset-list-panel').boundingBox())!.width).toBe(384)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('assets-narrow.png') })
  await page.keyboard.press('Escape')
  await expect(page.locator('.asset-list-panel')).toBeHidden()
  expect(await scroll.evaluate((el) => el.scrollTop)).toBeCloseTo(scrollTop, 0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await toggle.click()
  await expect(page.locator('.split-pane')).not.toHaveClass(/is-transitioning/)
  await expect(page.locator('.asset-list-panel')).toHaveCSS('transform', 'none')
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark'
  })
  await page.screenshot({ path: test.info().outputPath('assets-dark.png') })
  await toggle.click()
  await expect(page.locator('.asset-list-panel')).toBeHidden()
})
