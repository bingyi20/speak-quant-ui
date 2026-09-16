import { expect, test } from '@playwright/test'
import { envelope } from './auth-fixtures'
import {
  conversationId,
  message,
  replayCard,
  strategyCard,
  stubConversation,
} from './conversation-fixtures'
import { currentStrategy, historyNode, replay, stubStrategyDetails } from './strategy-fixtures'

test.use({ timezoneId: 'Asia/Shanghai' })

async function openStrategy(page: import('@playwright/test').Page) {
  await page.goto(`/conversations/${conversationId}`)
  await page.locator('.message-list-shell .message-card').click()
  await expect(page.locator('.strategy-document')).toContainText('当前设计')
}
test.beforeEach(async ({ page }) => {
  await stubConversation(page, {
    initialMessages: [message('strategy', 1, 'assistant', '策略已生成', [strategyCard])],
  })
})

test('global version switches Design, code and replays; scopes reset and no old results fill a draft', async ({
  page,
}) => {
  await stubStrategyDetails(page, { ...currentStrategy, status: 'modified', current_node_id: null })
  await openStrategy(page)
  const panel = page.locator('.asset-detail-panel')
  await expect(panel.locator('.strategy-version-title')).toHaveText(currentStrategy.change_summary!)
  await expect(panel.getByRole('button', { name: '返回', exact: true })).toHaveCount(0)
  await panel.getByRole('tab', { name: '回测记录' }).click()
  await expect(panel.getByText('所选版本尚无回测记录')).toBeVisible()
  await panel.getByRole('button', { name: '查看所有回测' }).click()
  await expect(panel.locator('[data-replay-id]')).toHaveCount(2)
  await expect(panel.locator('.is-selected-version')).toHaveCount(0)
  await panel.getByRole('combobox', { name: '切换策略版本' }).click()
  await page.getByRole('option', { name: /增加成交量过滤/ }).click()
  await expect(panel.locator('[data-replay-id]')).toHaveCount(1)
  await expect(panel.getByRole('button', { name: '查看所有回测' })).toBeVisible()
  await expect(panel.locator('.strategy-version-title')).toHaveText(historyNode.change_summary!)
  await panel.getByRole('tab', { name: '设计' }).click()
  await expect(panel.locator('.strategy-document')).toContainText('历史设计')
  await panel.getByRole('tab', { name: '代码' }).click()
  await expect(panel.locator('code')).toContainText('volume_filter = True')
  await panel.getByRole('combobox', { name: '切换策略版本' }).click()
  await page.getByRole('option', { name: currentStrategy.change_summary!, exact: true }).click()
  await expect(panel.locator('code')).toContainText('stop_pct = 0.03')
  await expect(panel.locator('code script')).toHaveCount(0)
  await expect(page.getByRole('listbox')).toBeHidden()
  await expect(panel.locator('header h2')).toBeInViewport()
  await expect(panel.getByRole('button', { name: '关闭', exact: true })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('strategy-code.png'),
  })
  await panel.getByRole('tab', { name: '回测记录' }).click()
  await panel.getByRole('button', { name: '查看所有回测' }).click()
  await panel.getByRole('tab', { name: '设计' }).click()
  await panel.getByRole('tab', { name: '回测记录' }).click()
  await expect(panel.getByText('所选版本尚无回测记录')).toBeVisible()
  await panel.getByRole('button', { name: '查看所有回测' }).click()
  await panel.getByRole('button', { name: '关闭', exact: true }).click()
  await page.locator('.message-list-shell .message-card').click()
  await expect(panel.getByText('所选版本尚无回测记录')).toBeVisible()
})

test('all replays mark the selected version and returning from Replay preserves scope and scroll', async ({
  page,
}) => {
  const replays = [
    currentStrategy.replays[0]!,
    ...Array.from({ length: 18 }, (_, i) => replay(`old-${i}`, 'node-old', `历史验证 ${i + 1}`)),
  ]
  await stubStrategyDetails(page, { ...currentStrategy, replays })
  await openStrategy(page)
  const panel = page.locator('.asset-detail-panel')
  await panel.getByRole('tab', { name: '回测记录' }).click()
  await expect(panel.locator('[data-replay-id]')).toHaveCount(1)
  const currentRow = panel.locator('[data-replay-id="replay-1"]')
  const rowHeight = (await currentRow.boundingBox())!.height
  await panel.getByRole('button', { name: '查看所有回测' }).click()
  await expect(panel.locator('[data-replay-id]')).toHaveCount(19)
  await expect(panel.locator('.is-selected-version')).toHaveCount(1)
  expect((await currentRow.boundingBox())!.height).toBe(rowHeight)
  await expect(currentRow).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(currentRow.locator('.selected-version-label')).toHaveText('所选版本')
  await expect(panel.locator('.replay-arrow')).toHaveCount(0)
  const target = panel.getByRole('button', { name: '历史验证 15', exact: true })
  await target.scrollIntoViewIfNeeded()
  const scroll = await panel.locator('.strategy-detail-body').evaluate((el) => el.scrollTop)
  await target.click()
  await expect(panel.locator('.replay-summary-metrics')).toContainText('18.60%')
  await panel.getByRole('button', { name: '返回策略' }).click()
  await expect(panel.getByRole('button', { name: '仅看所选版本' })).toBeVisible()
  expect(await panel.locator('.strategy-detail-body').evaluate((el) => el.scrollTop)).toBeCloseTo(
    scroll,
    0,
  )
  await expect(target).toBeFocused()
  await expect(panel.locator('[data-replay-id]')).toHaveCount(19)
})

test('change summaries distinguish same-name nodes, long summaries fit and legacy nodes remain selectable', async ({
  page,
}) => {
  const longName = 'BTC 双均线趋势策略（加入成交量过滤与动态仓位管理）'
  const summary =
    '止损从 2% 收紧到 1.5%，加入放量突破确认；将单次仓位从 20% 调整为 10%，保留原有均线交叉入场和收盘确认规则'
  const adjustedNode = {
    ...historyNode,
    id: 'node-adjusted',
    change_summary: '止损从 2% 收紧到 1.5%',
    design: { ...historyNode.design, content: '# 收紧止损设计' },
    code: { language: 'python', content: 'stop_pct = 0.015' },
  }
  const legacyNode = {
    ...historyNode,
    id: 'node-legacy',
    change_summary: null,
    formed_at: '2026-09-12T01:00:00Z',
    design: { ...historyNode.design, content: '# 旧版设计' },
  }
  await stubStrategyDetails(page, { ...currentStrategy, name: longName, change_summary: summary }, [
    adjustedNode,
    historyNode,
    legacyNode,
  ])
  await openStrategy(page)
  const panel = page.locator('.asset-detail-panel')
  const selector = panel.getByRole('combobox', { name: '切换策略版本' })
  await expect(selector).toHaveAttribute('title', `${summary}\n${longName} · 当前策略`)
  await expect(panel.locator('.strategy-version-title')).toHaveText(summary)
  await expect(panel.getByRole('heading', { name: summary, exact: true })).toBeVisible()
  await expect(panel.locator('.strategy-detail-body')).not.toContainText(summary)
  await panel.locator('header').screenshot({
    animations: 'disabled',
    path: test.info().outputPath('strategy-header-long.png'),
  })
  await selector.click()
  const current = page.getByRole('option').filter({ hasText: summary })
  await expect(current.locator('.strategy-version-option-label')).toHaveText(summary)
  await expect(current).not.toContainText('当前')
  await expect(current.locator('time')).toHaveText('9/15 18:00')
  await expect(current.locator('.strategy-version-name')).toHaveText(longName)
  await expect(page.getByRole('option')).toHaveCount(4)
  const menu = (await page.getByRole('listbox').boundingBox())!
  expect(menu.x).toBeGreaterThanOrEqual(0)
  expect(menu.x + menu.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  expect(await current.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('strategy-change-summaries.png'),
  })
  await page.getByRole('option', { name: adjustedNode.change_summary, exact: true }).click()
  await expect(panel.locator('.strategy-version-title')).toHaveText(adjustedNode.change_summary)
  await expect(panel.locator('.strategy-document')).toContainText('收紧止损设计')
  await selector.click()
  await page.getByRole('option', { name: /^增加成交量过滤/ }).click()
  await expect(panel.locator('.strategy-version-title')).toHaveText(historyNode.change_summary!)
  await expect(panel.locator('.strategy-document')).toContainText('历史设计')
  await selector.click()
  const legacy = page.getByRole('option', { name: /^双均线策略/ })
  await expect(legacy).toContainText('09:00')
  await expect(legacy).not.toContainText('未记录变更摘要')
  await legacy.click()
  await expect(selector.locator('.strategy-version-title')).toHaveText(historyNode.name)
  await expect(selector).toHaveAttribute('title', /09:00/)
  await expect(panel.locator('.strategy-document')).toContainText('旧版设计')
  await panel.getByRole('button', { name: '关闭', exact: true }).click()
  await stubStrategyDetails(page, { ...currentStrategy, change_summary: null }, [legacyNode])
  await page.locator('.message-list-shell .message-card').click()
  await expect(selector).toHaveAttribute('title', `${currentStrategy.name}\n当前策略`)
  await expect(panel.locator('.strategy-version-title')).toHaveText(currentStrategy.name)
})

test('header controls stay inside the header, menus handle Escape, layouts fit and Markdown copies raw', async ({
  page,
  isMobile,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          ;(window as unknown as { copied: string }).copied = text
        },
      },
    }),
  )
  await openStrategy(page)
  const panel = page.locator('.asset-detail-panel')
  await expect(panel.getByRole('combobox', { name: '切换策略版本' })).toBeVisible()
  await panel.getByRole('button', { name: '复制 Markdown' }).click()
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe(
    currentStrategy.design.content,
  )
  const header = (await panel.locator('header').boundingBox())!
  expect(header.height).toBe(44)
  const selector = panel.getByRole('combobox', { name: '切换策略版本' })
  await expect(panel.locator('header h2').getByRole('combobox')).toHaveCount(1)
  await expect(selector).toHaveCSS('border-width', '0px')
  await expect(selector).toHaveText(currentStrategy.change_summary!)
  const triggerBounds = (await selector.boundingBox())!
  expect(triggerBounds.height).toBe(isMobile ? 36 : 30)
  expect(triggerBounds.y).toBeGreaterThan(header.y)
  expect(triggerBounds.y + triggerBounds.height).toBeLessThan(header.y + header.height)
  await panel
    .locator('header')
    .screenshot({ animations: 'disabled', path: test.info().outputPath('strategy-header.png') })
  await panel.locator('.strategy-version-title').click()
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(selector).toBeFocused()
  for (const label of ['全屏', '关闭']) {
    const button = panel.getByRole('button', { name: label, exact: true })
    const bounds = (await button.boundingBox())!
    expect(bounds.y).toBeGreaterThanOrEqual(header.y)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(header.y + header.height)
    expect(bounds.width).toBeLessThanOrEqual(36)
    if (!isMobile) await button.hover()
  }
  await selector.locator('[data-slot="trailing"]').click()
  await expect(page.getByRole('listbox')).toBeVisible()
  await expect(
    page.getByRole('option', { name: currentStrategy.change_summary!, exact: true }),
  ).toHaveAttribute('data-state', 'checked')
  await expect(
    page.getByRole('option', { name: /增加成交量过滤/ }).locator('time'),
  ).toHaveAttribute('title', /18:00/)
  await expect(page.getByRole('listbox')).not.toContainText('次回测')
  await expect(page.getByRole('listbox')).not.toContainText('已回测')
  await expect(page.getByRole('listbox')).not.toContainText('2026年')
  await page.keyboard.press('End')
  await expect(page.getByRole('option', { name: /增加成交量过滤/ })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(selector).toHaveText(historyNode.change_summary!)
  await expect(selector).toHaveAttribute('title', /增加成交量过滤\n双均线策略 · .*18:00/)
  await expect(panel.locator('.strategy-document')).toContainText('历史设计')
  await panel.getByRole('combobox', { name: '切换策略版本' }).click()
  await expect(page.getByRole('option', { name: /增加成交量过滤/ })).toHaveAttribute(
    'data-state',
    'checked',
  )
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('strategy-version-select.png'),
  })
  await page.getByRole('listbox').screenshot({
    animations: 'disabled',
    path: test.info().outputPath('strategy-version-menu.png'),
  })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toBeHidden()
  await expect(panel.getByRole('combobox', { name: '切换策略版本' })).toBeFocused()
  await expect(panel).toBeVisible()
  await panel.getByRole('tab', { name: '回测记录' }).click()
  await panel.getByRole('button', { name: '查看所有回测' }).click()
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('strategy-replays.png'),
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await panel.getByRole('button', { name: '全屏', exact: true }).click()
  await expect(panel).toHaveClass(/is-modal/)
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('strategy-fullscreen.png'),
  })
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark'
  })
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('strategy-dark.png'),
  })
})

test('failed details retry and late version responses never replace the selected version', async ({
  page,
}) => {
  let fail = true
  await page.route(/\/api\/conversations\/[^/?]+\/strategy$/, (route) => {
    if (fail) {
      fail = false
      return route.fulfill({ status: 500, json: { code: 50000, message: 'failed' } })
    }
    return route.fulfill({ json: envelope(currentStrategy) })
  })
  await page.goto(`/conversations/${conversationId}`)
  await page.locator('.message-list-shell .message-card').click()
  const panel = page.locator('.asset-detail-panel')
  await expect(panel.getByRole('alert')).toContainText('策略加载失败')
  await panel.getByRole('button', { name: '重试', exact: true }).click()
  await expect(panel.locator('.strategy-document')).toContainText('当前设计')
  let release!: () => void
  const delayed = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/strategy-nodes/node-old', async (route) => {
    await delayed
    await route.fulfill({ json: envelope(historyNode) }).catch(() => {})
  })
  await panel.getByRole('combobox', { name: '切换策略版本' }).click()
  await page.getByRole('option', { name: /增加成交量过滤/ }).click()
  await expect(panel.getByRole('status')).toHaveText('正在加载')
  await panel.getByRole('combobox', { name: '切换策略版本' }).click()
  await page.getByRole('option', { name: currentStrategy.change_summary!, exact: true }).click()
  release()
  await expect(panel.locator('.strategy-document')).toContainText('当前设计')
  await expect(panel.locator('.strategy-document')).not.toContainText('历史设计')
})

test('fullscreen covers the viewport for strategy and Replay while preserving the reading state', async ({
  page,
}) => {
  await stubConversation(page, {
    initialMessages: [
      message('strategy', 1, 'assistant', '策略已生成', [strategyCard, replayCard]),
    ],
  })
  await stubStrategyDetails(page, {
    ...currentStrategy,
    code: {
      language: 'python',
      content: Array.from({ length: 100 }, (_, i) => `# ${i} ${'strategy '.repeat(80)}`).join('\n'),
    },
  })
  await page.goto(`/conversations/${conversationId}`)
  await page.locator('.message-list-shell .message-card').first().click()
  const panel = page.locator('.asset-detail-panel')
  await expect(panel.locator('.strategy-document')).toContainText('当前设计')
  await expect(panel.locator('.strategy-tabs')).toHaveCSS('border-bottom-width', '0px')
  const initial = (await panel.boundingBox())!
  await panel.getByRole('tab', { name: '代码', exact: true }).click()
  const body = panel.locator('.strategy-detail-body')
  const code = panel.locator('.strategy-code-scroll')
  await expect(code).toBeVisible()
  await body.evaluate((el) => {
    el.scrollTop = 120
  })
  await code.evaluate((el) => {
    el.scrollLeft = 80
  })
  await panel.getByRole('button', { name: '全屏', exact: true }).click()
  await expect(panel).toHaveClass(/is-fullscreen/)
  await expect(page.locator('.workspace-shell')).toHaveAttribute('inert', '')
  await expect(panel).toHaveCSS('border-radius', '0px')
  await expect(panel).toHaveCSS('box-shadow', 'none')
  expect(await panel.boundingBox()).toEqual({ x: 0, y: 0, ...page.viewportSize()! })
  expect(await body.evaluate((el) => el.scrollTop)).toBe(120)
  expect(await code.evaluate((el) => el.scrollLeft)).toBe(80)
  expect((await code.boundingBox())!.width).toBeGreaterThan(page.viewportSize()!.width - 80)
  const first = panel.getByRole('combobox', { name: '切换策略版本' })
  await first.focus()
  await page.keyboard.press('Shift+Tab')
  await expect(code).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(first).toBeFocused()
  await first.click()
  const menu = page.getByRole('listbox')
  await expect(menu).toBeVisible()
  const panelLayer = await panel.evaluate((el) => Number(getComputedStyle(el).zIndex))
  expect(
    await menu.evaluate((el) => Number(getComputedStyle(el.parentElement!).zIndex)),
  ).toBeGreaterThan(panelLayer)
  await menu.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('strategy-fullscreen-menu.png'),
  })
  await page.getByRole('option', { name: historyNode.change_summary!, exact: true }).click()
  await expect(panel.locator('code')).toContainText('volume_filter = True')
  await expect(first).toHaveText(historyNode.change_summary!)
  await first.click()
  await page.getByRole('option', { name: currentStrategy.change_summary!, exact: true }).click()
  await expect(panel.locator('code')).toContainText('# 99')
  await first.click()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(panel).toBeVisible()
  await panel.getByRole('tab', { name: '设计' }).click()
  const documentBounds = (await panel.locator('.strategy-document').boundingBox())!
  expect(documentBounds.width).toBeLessThanOrEqual(660)
  if (page.viewportSize()!.width > 760) expect(documentBounds.width).toBe(660)
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('design-fullscreen.png'),
  })
  await panel.getByRole('tab', { name: '回测记录' }).click()
  await panel.getByRole('button', { name: '查看所有回测' }).click()
  const replayBounds = (await panel.locator('.strategy-replays').boundingBox())!
  expect(replayBounds.width).toBeLessThanOrEqual(1120)
  expect(replayBounds.x + replayBounds.width / 2).toBeCloseTo(page.viewportSize()!.width / 2, 0)
  await panel.getByRole('button', { name: '历史区间验证', exact: true }).click()
  await expect(panel.locator('.replay-summary-metrics')).toBeVisible()
  expect(await panel.boundingBox()).toEqual({ x: 0, y: 0, ...page.viewportSize()! })
  await panel.getByRole('button', { name: '返回策略' }).click()
  await expect(panel.getByRole('button', { name: '仅看所选版本' })).toBeVisible()
  await panel.getByRole('button', { name: '退出全屏', exact: true }).click()
  await expect(panel).not.toHaveClass(/is-fullscreen/)
  expect((await panel.boundingBox())!.width).toBeCloseTo(initial.width, 0)
  await panel.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(panel).toBeHidden()
  await page.locator('.message-list-shell .message-card').last().click()
  await expect(panel.locator('.replay-summary-metrics')).toBeVisible()
  await panel.getByRole('button', { name: '全屏', exact: true }).click()
  await expect(panel).toHaveCSS('border-radius', '0px')
  expect(await panel.boundingBox()).toEqual({ x: 0, y: 0, ...page.viewportSize()! })
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('replay-fullscreen.png'),
  })
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(page.locator('.message-list-shell .message-card').last()).toBeFocused()
})

test('replay rows stay compact and centered on wide screens when revealing their versions', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Wide desktop layout')
  await page.setViewportSize({ width: 2560, height: 1440 })
  await stubStrategyDetails(page)
  await openStrategy(page)
  const panel = page.locator('.asset-detail-panel')
  await panel.getByRole('button', { name: '全屏', exact: true }).click()
  await panel.getByRole('tab', { name: '回测记录' }).click()
  const row = panel.locator('[data-replay-id="replay-1"]')
  const height = (await row.boundingBox())!.height
  await panel.getByRole('button', { name: '查看所有回测' }).click()
  expect((await row.boundingBox())!.height).toBe(height)
  expect((await panel.locator('.strategy-replays').boundingBox())!.width).toBe(1120)
  const headline = (await row.locator('.replay-headline').boundingBox())!
  const version = (await row.locator('.replay-version').boundingBox())!
  expect(version.y).toBeGreaterThanOrEqual(headline.y)
  expect(version.y + version.height).toBeLessThanOrEqual(headline.y + headline.height)
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('strategy-replays-wide.png'),
  })
})
