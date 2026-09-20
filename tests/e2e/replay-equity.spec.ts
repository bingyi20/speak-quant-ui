import { expect, test, type Page } from '@playwright/test'
import { conversationId } from './conversation-fixtures'
import { envelope } from './auth-fixtures'
import { candles, iso, replayDetail, stubReplay } from './replay-fixtures'

async function setupEquity(
  page: Page,
  values: Array<string | null>,
  capital: string,
  sizing = '1',
  expected = '0.4',
) {
  await stubReplay(page, { empty: true, multi: true })
  const bars = candles(values.length).map((c, i) => ({
    ...c,
    // The rising market prices deliberately do not resemble the equity drawdown.
    open: String(100 + i),
    high: String(102 + i),
    low: String(99 + i),
    close: String(101 + i),
    state:
      values[i] === null
        ? null
        : {
            ...c.state!,
            equity: values[i]!,
            cash: '0',
            position: 'long',
            position_quantity: '1',
            unrealized_pnl: '4',
            cumulative_return_rate: '9',
            drawdown_rate: '0.99',
          },
  }))
  await page.route(/\/api\/replays\/[^/?]+$/, (route) =>
    route.fulfill({
      json: envelope({
        ...replayDetail,
        conditions: {
          ...replayDetail.conditions,
          initial_capital: capital,
          end_at: iso(values.length),
        },
        counts: { candles: values.length, trades: 0, insights: 0 },
        execution_assumptions: {
          capital_currency: 'USDT',
          position_sizing: { type: 'equity_percent', value: sizing },
          commission_rate: '0.001',
          slippage_rate: '0.0005',
          data: {
            source: 'Fixture',
            available_start_at: null,
            available_end_at: null,
            delay_seconds: null,
          },
          assumptions: [],
        },
        result: {
          ...replayDetail.result,
          trade_count: 0,
          net_return_rate: '0.4',
          net_profit: '4',
          max_drawdown_rate: expected,
          total_fee: '2',
        },
      }),
    }),
  )
  await page.route(/\/api\/replays\/[^/?]+\/candles(?:\?.*)?$/, (route) => {
    const timeframe = new URL(route.request().url()).searchParams.get('timeframe') ?? '1h'
    return route.fulfill({
      json: envelope({
        timeframe,
        execution_timeframe: '1h',
        available_timeframes: ['1h', '4h'],
        items:
          timeframe === '1h'
            ? bars
            : bars
                .filter((_, i) => i % 4 === 0)
                .map((c) => ({ ...c, close_time: iso(c.sequence - 1 + 4), state: null })),
        has_more: false,
        next_cursor: null,
      }),
    })
  })
  await page.goto(`/conversations/${conversationId}`)
  await page.locator('.message-list-shell .message-card').click()
  const panel = page.locator('.asset-detail-panel'),
    slider = panel.locator('.replay-timeline input'),
    metrics = panel.locator('.replay-summary-metrics dd')
  await expect(panel.getByRole('button', { name: '从头播放', exact: true })).toBeEnabled()
  const seek = async (n: number) => {
    await slider.evaluate(
      (input, value) => {
        ;(input as HTMLInputElement).value = value
        input.dispatchEvent(new Event('input', { bubbles: true }))
      },
      String(Date.parse(iso(n)) / 1000),
    )
    await expect(panel.locator('.replay-chart')).toHaveAttribute(
      'data-visible-end',
      String(Date.parse(iso(n)) / 1000),
    )
  }
  const inspect = async () => {
    await panel.getByRole('button', { name: '结果定位', exact: true }).click()
    await page.getByRole('menuitem', { name: '最大回撤区间', exact: true }).click()
    await expect(panel.locator('.replay-evidence-shade')).toBeVisible()
    await expect(panel.locator('.replay-trade-card[aria-pressed=true]')).toHaveCount(0)
  }
  const detailRow = (label: string) =>
    page
      .getByRole('dialog')
      .locator('.replay-key-values > div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
      .locator('dd')
  return { panel, metrics, seek, inspect, detailRow }
}

test('equity drawdown uses historical prefixes, restores the earlier trough and ignores display timeframe', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop equity metrics')
  const { panel, metrics, seek, inspect, detailRow } = await setupEquity(
    page,
    ['12', '15', '13', '9', '14', '14'],
    '10',
    '1.00000000',
  )
  await panel.getByRole('button', { name: '条件', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('全仓 · 连续复投')
  await page.keyboard.press('Escape')
  await seek(2)
  await expect(metrics.nth(0)).toHaveText('+30.0000%')
  await expect(metrics.nth(1)).toHaveText('13.3333%')
  await inspect()
  const shortWidth = (await panel.locator('.replay-track-evidence').boundingBox())!.width
  await seek(3)
  await expect(metrics.nth(0)).toHaveText('-10.0000%')
  await expect(metrics.nth(1)).toHaveText('40.0000%')
  await inspect()
  const worstWidth = (await panel.locator('.replay-track-evidence').boundingBox())!.width
  expect(worstWidth / shortWidth).toBeCloseTo(2, 1)
  await seek(4)
  await expect(metrics.nth(1)).toHaveText('40.0000%')
  await inspect()
  expect((await panel.locator('.replay-track-evidence').boundingBox())!.width).toBeCloseTo(
    worstWidth,
    1,
  )
  await panel.getByRole('button', { name: '查看详情', exact: true }).click()
  await expect(detailRow('当前回撤')).toHaveText('6.6667%')
  await expect(detailRow('权益')).toHaveText('14.00')
  await expect(detailRow('回撤峰值权益')).toHaveText('15.00 · 2025/01/01 02:00')
  await expect(detailRow('回撤谷值权益')).toHaveText('9.00 · 2025/01/01 04:00')
  await page.screenshot({
    path: test.info().outputPath('equity-prefix-details.png'),
    animations: 'disabled',
  })
  await page.keyboard.press('Escape')
  const before = await metrics.allTextContents()
  await panel.getByRole('button', { name: '4h', exact: true }).click()
  await expect(panel.locator('.replay-chart')).toHaveAttribute(
    'data-visible-end',
    String(Date.parse(iso(0)) / 1000),
  )
  await expect(metrics).toHaveText(before)
  await panel.getByRole('button', { name: '1h', exact: true }).click()
  await seek(2)
  await expect(metrics.nth(1)).toHaveText('13.3333%')
  await inspect()
  expect((await panel.locator('.replay-track-evidence').boundingBox())!.width).toBeCloseTo(
    shortWidth,
    1,
  )
  await seek(0)
  await expect(metrics.nth(1)).toHaveText('0.0000%')
  await expect(panel.locator('.replay-evidence-shade')).toBeHidden()
  await expect(panel.getByRole('button', { name: '结果定位', exact: true })).toBeDisabled()
  await seek(5)
  await expect(panel.locator('.replay-result-label')).toHaveText('最终结果')
  await expect(metrics.nth(0)).toHaveText('+40.0000%')
  await expect(metrics.nth(1)).toHaveText('40.0000%')
})

test('playing updates selected equity drawdown through a new trough and retains it during recovery', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop equity metrics')
  const { panel, metrics, seek, inspect } = await setupEquity(
    page,
    ['12', '15', '13', '9', '14', '14'],
    '10',
  )
  await seek(2)
  const evidence = panel.locator('.replay-track-evidence')
  const clockStart = Date.now()
  await page.clock.install({ time: clockStart })
  await page.clock.pauseAt(clockStart + 60_000)
  await panel.getByRole('button', { name: '播放', exact: true }).click()
  await inspect()
  const shortWidth = (await evidence.boundingBox())!.width
  await page.clock.runFor(150)
  await expect(panel.locator('.replay-result-label')).toHaveText('截至此时')
  await expect(metrics.nth(0)).toHaveText('-10.0000%')
  await expect(metrics.nth(1)).toHaveText('40.0000%')
  expect((await evidence.boundingBox())!.width / shortWidth).toBeCloseTo(2, 1)
  await page.clock.runFor(150)
  await expect(metrics.nth(0)).toHaveText('+40.0000%')
  await expect(metrics.nth(1)).toHaveText('40.0000%')
  expect((await evidence.boundingBox())!.width / shortWidth).toBeCloseTo(2, 1)
  await panel.getByRole('button', { name: '暂停', exact: true }).click()
  await page.clock.resume()
  await seek(2)
  await expect(metrics.nth(1)).toHaveText('13.3333%')
})

test('legacy sizing and mismatched final drawdown stay backend-authoritative without rescaling history', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop equity metrics')
  const { panel, metrics, seek, inspect, detailRow } = await setupEquity(
    page,
    ['990', '1000', '1000'],
    '1000',
    '0.1',
    '0.5',
  )
  await expect(metrics.nth(1)).toHaveText('50.0000%')
  await expect(panel.getByRole('button', { name: '结果定位', exact: true })).toBeDisabled()
  await panel.getByRole('button', { name: '条件', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('权益的 10.00%')
  await expect(page.getByRole('dialog')).not.toContainText('全仓 · 连续复投')
  await page.keyboard.press('Escape')
  await seek(0)
  await expect(metrics.nth(0)).toHaveText('-1.0000%')
  await expect(metrics.nth(1)).toHaveText('1.0000%')
  await inspect()
  await panel.getByRole('button', { name: '查看详情', exact: true }).click()
  await expect(detailRow('回撤峰值权益')).toHaveText('1,000.00 · 2025/01/01 00:00')
  await expect(detailRow('回撤谷值权益')).toHaveText('990.00 · 2025/01/01 01:00')
  await page.keyboard.press('Escape')
  await seek(2)
  await expect(metrics.nth(1)).toHaveText('50.0000%')
  await expect(panel.locator('.replay-evidence-shade')).toBeHidden()
  await expect(panel.getByRole('button', { name: '结果定位', exact: true })).toBeDisabled()
})

test('missing equity invalidates the whole following prefix while rewind and backend totals remain available', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop equity metrics')
  const { panel, metrics, seek } = await setupEquity(
    page,
    ['990', null, '900', '900'],
    '1000',
    '1',
    '0.1',
  )
  await seek(2)
  await expect(metrics).toHaveText(['—', '—', '—', '—', '—', '—'])
  await expect(panel.getByRole('button', { name: '结果定位', exact: true })).toBeDisabled()
  await seek(0)
  await expect(metrics.nth(0)).toHaveText('-1.0000%')
  await expect(metrics.nth(1)).toHaveText('1.0000%')
  await seek(3)
  await expect(metrics.nth(1)).toHaveText('10.0000%')
  await expect(panel.getByRole('button', { name: '结果定位', exact: true })).toBeDisabled()
})
