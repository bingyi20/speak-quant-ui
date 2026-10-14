import { expect, test, type Locator } from '@playwright/test'
import { envelope } from './auth-fixtures'
import { conversationId, message, strategyCard, stubConversation } from './conversation-fixtures'
import { currentStrategy, historyNode } from './strategy-fixtures'

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

async function expectCenteredLoading(container: Locator) {
  await expect(container.getByRole('status')).toBeVisible()
  await expect(container.locator('.loading-spinner')).toBeVisible()
  const offset = await container.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const spinner = element.querySelector('.loading-spinner')!.getBoundingClientRect()
    const style = getComputedStyle(element)
    const left = bounds.left + parseFloat(style.paddingLeft)
    const right = bounds.right - parseFloat(style.paddingRight)
    const top = bounds.top + parseFloat(style.paddingTop)
    const bottom = bounds.bottom - parseFloat(style.paddingBottom)
    return {
      x: Math.abs(spinner.left + spinner.width / 2 - (left + right) / 2),
      y: Math.abs(spinner.top + spinner.height / 2 - (top + bottom) / 2),
    }
  })
  expect(offset.x).toBeLessThanOrEqual(1)
  expect(offset.y).toBeLessThanOrEqual(1)
}

test('strategy initial and version loads stay centered and recover without showing stale copy or content', async ({
  page,
}) => {
  await stubConversation(page, {
    initialMessages: [message('strategy', 1, 'assistant', '策略已生成', [strategyCard])],
  })
  const initial = deferred()
  await page.route(/\/api\/conversations\/[^/?]+\/strategy$/, async (route) => {
    await initial.promise
    await route.fulfill({ json: envelope(currentStrategy) })
  })
  await page.goto(`/conversations/${conversationId}`)
  await page.locator('.message-list-shell .message-card').click()
  const panel = page.locator('.asset-detail-panel')
  const body = panel.locator('.strategy-detail-body')
  await expect(panel).toHaveCSS('transform', 'none')
  await expect(body).toHaveAttribute('aria-busy', 'true')
  await expectCenteredLoading(body)
  await expect(panel.locator('.strategy-floating-copy')).toHaveCount(0)
  const loadingBounds = await body.boundingBox()
  initial.release()
  await expect(panel.locator('.strategy-document')).toContainText('当前设计')
  await expect(body).toHaveAttribute('aria-busy', 'false')
  await expect(panel.locator('.strategy-floating-copy')).toBeVisible()
  expect(await body.boundingBox()).toEqual(loadingBounds)
  await panel.getByRole('tab', { name: '代码' }).click()
  await expect(panel.locator('code')).toContainText('stop_pct = 0.03')
  await expect(panel.getByRole('button', { name: '复制代码', exact: true })).toBeVisible()
  await panel.getByRole('tab', { name: '设计' }).click()

  const failed = deferred()
  const retry = deferred()
  let attempts = 0
  await page.route('**/api/strategy-nodes/node-old', async (route) => {
    attempts++
    if (attempts === 1) {
      await failed.promise
      await route.fulfill({ status: 500, json: { code: 50000, message: 'failed' } })
    } else {
      await retry.promise
      await route.fulfill({ json: envelope(historyNode) })
    }
  })
  await panel.getByRole('combobox', { name: '切换策略版本' }).click()
  await page.getByRole('option', { name: /增加成交量过滤/ }).click()
  await expectCenteredLoading(body)
  await expect(panel.locator('.strategy-document')).toHaveCount(0)
  await expect(panel.locator('.strategy-floating-copy')).toHaveCount(0)
  failed.release()
  await expect(panel.getByRole('alert')).toContainText('策略加载失败')
  await expect(panel.locator('.strategy-document')).toHaveCount(0)
  await panel.getByRole('button', { name: '重试', exact: true }).click()
  await expectCenteredLoading(body)
  retry.release()
  await expect(panel.locator('.strategy-document')).toContainText('历史设计')
  await expect(panel.locator('.strategy-document')).not.toContainText('当前设计')
  await expect(panel.locator('.strategy-floating-copy')).toBeVisible()
  await expect(panel.getByRole('alert')).toHaveCount(0)
})

test('asset list initial loading stays centered, distinguishes empty data and preserves panel geometry', async ({
  page,
}) => {
  await stubConversation(page)
  const pending = deferred()
  await page.route(/\/api\/conversations\/[^/?]+\/assets(?:\?.*)?$/, async (route) => {
    await pending.promise
    await route.fulfill({
      json: envelope({
        strategy: null,
        replays: { items: [], page: 1, size: 20, total: 0, total_pages: 0 },
      }),
    })
  })
  await page.goto(`/conversations/${conversationId}`)
  await page.getByRole('button', { name: '查看资产', exact: true }).click()
  const panel = page.locator('.asset-list-panel')
  const content = panel.locator('.panel-content')
  await expect(panel).toHaveCSS('transform', 'none')
  await expectCenteredLoading(content)
  await expect(content).toHaveAttribute('aria-busy', 'true')
  await expect(panel.locator('.asset-empty')).toHaveCount(0)
  const bounds = await panel.boundingBox()
  pending.release()
  await expect(content).toHaveAttribute('aria-busy', 'false')
  await expect(panel.locator('.asset-empty')).toBeVisible()
  await expect(panel.getByRole('status')).toHaveCount(0)
  expect(await panel.boundingBox()).toEqual(bounds)
})

test('asset list initial failure retries through the same centered loader and shows the returned cards', async ({
  page,
}) => {
  await stubConversation(page)
  const retry = deferred()
  let attempts = 0
  await page.route(/\/api\/conversations\/[^/?]+\/assets(?:\?.*)?$/, async (route) => {
    attempts++
    if (attempts === 1)
      return route.fulfill({ status: 500, json: { code: 50000, message: 'failed' } })
    await retry.promise
    await route.fulfill({
      json: envelope({
        strategy: { id: 'strategy-1', name: strategyCard.title, status: 'draft', revision: 1 },
        replays: { items: [], page: 1, size: 20, total: 0, total_pages: 0 },
      }),
    })
  })
  await page.goto(`/conversations/${conversationId}`)
  await page.getByRole('button', { name: '查看资产', exact: true }).click()
  const panel = page.locator('.asset-list-panel')
  await expect(panel.getByRole('alert')).toContainText('暂时无法加载资产')
  await panel.getByRole('button', { name: '重试', exact: true }).click()
  await expect(panel).toHaveCSS('transform', 'none')
  await expectCenteredLoading(panel.locator('.panel-content'))
  await expect(panel.getByRole('alert')).toHaveCount(0)
  retry.release()
  await expect(panel.locator('.message-card')).toHaveCount(1)
  await expect(panel.locator('.message-card')).toContainText(strategyCard.title)
  await expect(panel.getByRole('status')).toHaveCount(0)
})
