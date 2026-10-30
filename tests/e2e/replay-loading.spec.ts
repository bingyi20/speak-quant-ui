import { expect, test } from '@playwright/test'
import { conversationId } from './conversation-fixtures'
import { stubReplay } from './replay-fixtures'
import { envelope } from './auth-fixtures'

function gate() {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  return { pending, release }
}

test('delayed replay detail and candles show centered loading without moving the chart', async ({
  page,
  isMobile,
}) => {
  await stubReplay(page, { multi: true })
  const detail = gate()
  const candles = gate()
  await page.route(/\/api\/replays\/[^/?]+$/, async (route) => {
    await detail.pending
    await route.fallback()
  })
  await page.route(/\/api\/replays\/[^/?]+\/candles(?:\?.*)?$/, async (route) => {
    await candles.pending
    await route.fallback()
  })
  await page.goto(`/conversations/${conversationId}`)
  await page.locator('.message-list-shell .message-card').click()
  const panel = page.locator('.asset-detail-panel')
  await expect(panel.locator('.replay-detail-loading')).toBeVisible()
  await expect(panel.locator('.replay-chart')).toHaveCount(0)
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    )
  })
  detail.release()
  const plot = panel.locator('.replay-chart')
  const loading = panel.locator('.replay-chart-loading')
  await expect(loading).toBeVisible()
  await expect(loading.locator('.loading-spinner')).toBeVisible()
  await expect(panel.locator('.replay-metric-skeleton')).toHaveCount(5)
  const before = (await plot.boundingBox())!
  const chartRegion = (await panel.locator('.replay-chart-block').boundingBox())!
  const spinner = (await loading.locator('.loading-spinner').boundingBox())!
  expect(
    Math.abs(spinner.x + spinner.width / 2 - (chartRegion.x + chartRegion.width / 2)),
  ).toBeLessThan(1)
  if (!isMobile)
    expect(
      Math.abs(spinner.y + spinner.height / 2 - (chartRegion.y + chartRegion.height / 2)),
    ).toBeLessThan(1)
  const viewport = page.viewportSize()!
  expect(spinner.y).toBeGreaterThanOrEqual(0)
  expect(spinner.y + spinner.height).toBeLessThanOrEqual(viewport.height)
  if (isMobile) {
    const playback = (await panel.locator('.replay-playback-controls').boundingBox())!
    expect(spinner.y + spinner.height).toBeLessThanOrEqual(playback.y)
  }
  await page.screenshot({ path: test.info().outputPath('replay-candles-loading.png') })
  candles.release()
  await expect(loading).toBeHidden()
  await expect(panel.getByRole('button', { name: '从头播放', exact: true })).toBeEnabled()
  await expect(panel.locator('.replay-metric-skeleton')).toHaveCount(0)
  const after = (await plot.boundingBox())!
  for (const key of ['x', 'y', 'width', 'height'] as const)
    expect(Math.abs(after[key] - before[key]), key).toBeLessThan(1)
})

test('failed initial candles replace loading with an in-chart retry state', async ({
  page,
  isMobile,
}) => {
  await stubReplay(page)
  let fail = true
  await page.route(/\/api\/replays\/[^/?]+\/candles(?:\?.*)?$/, async (route) => {
    if (fail) await route.fulfill({ status: 500, json: { detail: 'unavailable' } })
    else await route.fallback()
  })
  await page.goto(`/conversations/${conversationId}`)
  await page.locator('.message-list-shell .message-card').click()
  const panel = page.locator('.asset-detail-panel')
  const state = panel.locator('.replay-chart-empty')
  await expect(state).toHaveAttribute('role', 'alert')
  await expect(state.getByRole('button', { name: '重试', exact: true })).toBeVisible()
  await expect(panel.locator('.replay-chart-loading')).toBeHidden()
  if (!isMobile) {
    await expect(panel.locator('.replay-result-label')).toHaveText('截至此时')
    const values = await panel.locator('.replay-summary-metrics dd').allTextContents()
    expect(values.map((value) => value.trim())).toEqual(Array(6).fill('—'))
  }
  const retry = (await state.getByRole('button', { name: '重试', exact: true }).boundingBox())!
  expect(retry.y).toBeGreaterThanOrEqual(0)
  expect(retry.y + retry.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  if (isMobile) {
    const playback = (await panel.locator('.replay-playback-controls').boundingBox())!
    expect(retry.y + retry.height).toBeLessThanOrEqual(playback.y)
  }
  fail = false
  await state.getByRole('button', { name: '重试', exact: true }).click()
  await expect(state).toBeHidden()
  await expect(panel.getByRole('button', { name: '从头播放', exact: true })).toBeEnabled()
})

test('delayed timeframe loading keeps the current candles visible', async ({ page, isMobile }) => {
  await stubReplay(page, { multi: true })
  const timeframe = gate()
  await page.route(/\/api\/replays\/[^/?]+\/candles(?:\?.*)?$/, async (route) => {
    if (new URL(route.request().url()).searchParams.get('timeframe') === '4h')
      await timeframe.pending
    await route.fallback()
  })
  await page.goto(`/conversations/${conversationId}`)
  await page.locator('.message-list-shell .message-card').click()
  const panel = page.locator('.asset-detail-panel')
  await expect(panel.getByRole('button', { name: '从头播放', exact: true })).toBeEnabled()
  const chart = panel.locator('.replay-chart')
  const previousEnd = await chart.getAttribute('data-visible-end')
  if (isMobile) {
    await panel.getByRole('combobox', { name: '查看周期' }).click()
    await page.getByRole('option', { name: '4h', exact: true }).click()
  } else await panel.getByRole('button', { name: '4h', exact: true }).click()
  await expect(panel.locator('.replay-chart-toolbar .loading-spinner')).toBeVisible()
  await expect(chart).toHaveAttribute('aria-label', 'BTC/USDT 1h K 线图')
  await expect(chart).toHaveAttribute('data-visible-end', previousEnd!)
  await expect(panel.locator('.replay-chart-loading')).toBeHidden()
  timeframe.release()
  await expect(chart).toHaveAttribute('aria-label', 'BTC/USDT 4h K 线图')
  await expect(panel.locator('.replay-chart-toolbar .loading-spinner')).toBeHidden()
})

test('confirmed empty candles show a visible empty state instead of an endless loader', async ({
  page,
  isMobile,
}) => {
  await stubReplay(page, { empty: true })
  await page.route(/\/api\/replays\/[^/?]+\/candles(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({ timeframe: '1h', items: [], has_more: false, next_cursor: null }),
    }),
  )
  await page.goto(`/conversations/${conversationId}`)
  await page.locator('.message-list-shell .message-card').click()
  const panel = page.locator('.asset-detail-panel')
  const state = panel.locator('.replay-chart-empty')
  await expect(state).toHaveAttribute('role', 'status')
  await expect(state).toContainText('暂无行情数据')
  await expect(panel.locator('.replay-chart-loading')).toBeHidden()
  const text = await state.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const bounds = range.getBoundingClientRect()
    return { top: bounds.top, bottom: bounds.bottom }
  })
  expect(text.top).toBeGreaterThanOrEqual(0)
  expect(text.bottom).toBeLessThanOrEqual(page.viewportSize()!.height)
  if (isMobile) {
    const playback = (await panel.locator('.replay-playback-controls').boundingBox())!
    expect(text.bottom).toBeLessThanOrEqual(playback.y)
  }
})
