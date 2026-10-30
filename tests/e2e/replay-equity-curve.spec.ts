import { expect, test, type Locator, type Page } from '@playwright/test'
import { envelope } from './auth-fixtures'
import { conversationId } from './conversation-fixtures'
import { iso } from './replay-fixtures'
import { portfolioDetail, stubPortfolio } from './replay-multi-fixtures'

const seconds = (hour: number) => String(Date.parse(iso(hour)) / 1000)

async function stubEquityCurve(
  page: Page,
  options: {
    sharpe?: string | null
    fail?: () => boolean
    equityAt?: (hour: number) => number
  } = {},
) {
  const portfolio = await stubPortfolio(page)
  const requests: URL[] = []
  const points = Array.from({ length: 201 }, (_, sequence) => {
    const equity = options.equityAt?.(sequence) ?? 10000 + sequence * 20
    return {
      sequence,
      time: iso(sequence),
      open_time: sequence ? iso(sequence - 1) : null,
      equity: String(equity),
      net_return_rate: String((equity - 10000) / 10000),
      drawdown_rate: '0',
      is_initial: sequence === 0,
    }
  })
  const sharpe = options.sharpe === undefined ? '-1.23' : options.sharpe
  await page.route(/\/api\/replays\/[^/?]+$/, (route) =>
    route.fulfill({
      json: envelope({
        ...portfolioDetail,
        result: {
          ...portfolioDetail.result,
          sharpe_ratio: sharpe,
          sharpe: {
            ratio: sharpe,
            method: 'equity_returns_v1',
            sampling_timeframe: '1h',
            annualization_factor: '8760',
            risk_free_rate: '0',
            sample_count: 200,
            unavailable_reason: sharpe === null ? 'zero_volatility' : null,
          },
        },
      }),
    }),
  )
  await page.route(/\/api\/replays\/[^/?]+\/equity-curve(?:\?.*)?$/, (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    if (options.fail?.())
      return route.fulfill({
        status: 503,
        json: { code: 'REPLAY_ASSET_UNAVAILABLE', message: 'Equity asset unavailable' },
      })
    const cursor = url.searchParams.get('cursor'),
      offset = cursor ? Number(cursor.replace('equity:', '')) : 0,
      items = points.slice(offset, offset + 73),
      hasMore = offset + items.length < points.length
    return route.fulfill({
      json: envelope({
        capital_currency: 'USDT',
        execution_timeframe: '1h',
        initial_capital: '10000',
        start_at: iso(0),
        end_at: iso(200),
        items,
        next_cursor: hasMore ? `equity:${offset + items.length}` : null,
        has_more: hasMore,
      }),
    })
  })
  return { requests, ...portfolio }
}

async function openReplay(page: Page) {
  await page.goto(`/conversations/${conversationId}`)
  await page.locator('.message-list-shell .message-card').click()
  const panel = page.locator('.asset-detail-panel')
  await expect(panel.getByRole('button', { name: '从头播放', exact: true })).toBeEnabled()
  await expect(panel.locator('.replay-chart:visible')).toHaveAttribute('aria-busy', 'false')
  return panel
}

async function seek(panel: Locator, hour: number) {
  const slider = panel.locator('.replay-timeline input')
  await slider.evaluate((element, value) => {
    ;(element as HTMLInputElement).value = value
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }, seconds(hour))
  await expect(slider).toHaveValue(seconds(hour))
}

function sharpeValue(panel: Locator) {
  return panel
    .locator('.replay-summary-metrics > div')
    .filter({ hasText: /sharpe/i })
    .locator('dd')
}

async function setTimeframe(page: Page, panel: Locator, mobile: boolean, timeframe: string) {
  if (mobile) {
    await panel.getByRole('combobox', { name: '查看周期' }).click()
    await page.getByRole('option', { name: timeframe, exact: true }).click()
  } else await panel.getByRole('button', { name: timeframe, exact: true }).click()
}

async function timeAxisImage(chart: Locator) {
  return chart.evaluate(async (host) => {
    await document.fonts.ready
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    const bottom = host.getBoundingClientRect().bottom
    const axis = [...host.querySelectorAll('canvas')].find((canvas) => {
      const bounds = canvas.getBoundingClientRect()
      return bounds.height > 0 && bounds.height < 40 && Math.abs(bounds.bottom - bottom) < 2
    })!
    return axis.toDataURL()
  })
}

test('equity uses the complete account curve, a fixed full-period axis and the playback prefix', async ({
  page,
  isMobile,
}) => {
  const { requests, invalidRequests } = await stubEquityCurve(page)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const panel = await openReplay(page),
    tabs = panel.getByRole('tablist', { name: '图表视图', exact: true }),
    equityTab = tabs.getByRole('tab', { name: '资金曲线', exact: true }),
    btc = tabs.getByRole('tab', { name: /BTC\/USDT.*现货/ }),
    chart = panel.locator('.replay-equity-chart')
  await expect(tabs.getByRole('tab').first()).toHaveText('资金曲线')
  await expect(sharpeValue(panel)).toHaveText('-1.23')
  const labels = await panel.locator('.replay-summary-metrics dt').allTextContents()
  expect(labels.findIndex((label) => /sharpe/i.test(label))).toBe(labels.indexOf('盈亏因子') + 1)
  await setTimeframe(page, panel, isMobile, '4h')
  await expect(panel.locator('.replay-chart:visible')).toHaveAttribute(
    'data-visible-end',
    seconds(196),
  )
  const heightBefore = (await panel.locator('.replay-chart-region').boundingBox())!.height
  await equityTab.click()
  await expect(equityTab).toHaveAttribute('aria-selected', 'true')
  await expect(chart).toHaveAttribute('data-visible-count', '201')
  await expect(chart).toHaveAttribute('data-visible-end', seconds(200))
  await expect(chart).toHaveAttribute('data-range-start', seconds(0))
  await expect(chart).toHaveAttribute('data-range-end', seconds(200))
  await expect(panel.locator('.replay-equity-current')).toContainText('14,000.00')
  await expect(panel.locator('.replay-equity-return')).toContainText(/\+?40\.00(?:00)?%/)
  expect((await panel.locator('.replay-chart-region').boundingBox())!.height).toBeCloseTo(
    heightBefore,
    0,
  )
  expect(requests).toHaveLength(3)
  expect(requests.map((url) => url.searchParams.get('cursor'))).toEqual([
    null,
    'equity:73',
    'equity:146',
  ])
  for (const url of requests) {
    expect(url.searchParams.has('instrument')).toBe(false)
    expect(url.searchParams.has('timeframe')).toBe(false)
  }
  await page.mouse.move(0, 0)
  const fullTimeAxis = await timeAxisImage(chart)
  // The slider represents the candle's open time; v3 equity is effective on the
  // global close boundary, independently of the selected instrument/timeframe.
  await seek(panel, 19)
  await expect(chart).toHaveAttribute('data-visible-count', '21')
  await expect(chart).toHaveAttribute('data-visible-end', seconds(20))
  await expect(panel.locator('.replay-equity-current')).toContainText('10,400.00')
  await expect(panel.locator('.replay-equity-return')).toContainText(/\+?4\.00(?:00)?%/)
  await expect(sharpeValue(panel)).toHaveText('-1.23')
  await seek(panel, 3)
  await expect(chart).toHaveAttribute('data-visible-count', '5')
  await expect(chart).toHaveAttribute('data-visible-end', seconds(4))
  await expect(chart).toHaveAttribute('data-range-start', seconds(0))
  await expect(chart).toHaveAttribute('data-range-end', seconds(200))
  await expect(panel.locator('.replay-equity-current')).toContainText('10,080.00')
  await expect(panel.locator('.replay-timeline input')).toHaveValue(seconds(3))
  // Compare real rendered ticks as well as the contract attributes: revealing
  // fewer points must not zoom the early prefix to fill the available width.
  await expect.poll(() => timeAxisImage(chart)).toBe(fullTimeAxis)
  await seek(panel, 99)
  await expect(chart).toHaveAttribute('data-visible-count', '101')
  await expect(panel.locator('.replay-equity-current')).toContainText('12,000.00')
  await chart.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: test.info().outputPath('equity-curve-prefix.png'),
    animations: 'disabled',
  })
  await seek(panel, 3)
  await btc.click()
  await expect(btc).toHaveAttribute('aria-selected', 'true')
  await expect(panel.locator('.replay-chart:visible')).toHaveAttribute(
    'data-visible-end',
    seconds(0),
  )
  await expect(panel.locator('.replay-timeline input')).toHaveValue(seconds(3))
  await expect(sharpeValue(panel)).toHaveText('-1.23')
  await equityTab.click()
  await expect(chart).toHaveAttribute('data-visible-count', '5')
  expect(requests).toHaveLength(3)
  await seek(panel, 199)
  await expect(chart).toHaveAttribute('data-visible-end', seconds(200))
  // A fill still leads to its owning instrument without moving the account clock.
  await panel.locator('[data-event-id="fill:portfolio-fill-asset_b-0"]').click()
  await expect(tabs.getByRole('tab', { name: /ETH\/USDT/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(chart).toBeHidden()
  await expect(panel.locator('.replay-timeline input')).toHaveValue(seconds(199))
  await expect(sharpeValue(panel)).toHaveText('-1.23')
  expect(invalidRequests).toEqual([])
  expect(pageErrors).toEqual([])
})

test('unavailable equity can retry without inventing values and null Sharpe stays unavailable', async ({
  page,
}) => {
  let fail = true
  const { requests } = await stubEquityCurve(page, { sharpe: null, fail: () => fail })
  const panel = await openReplay(page),
    tab = panel.getByRole('tab', { name: '资金曲线', exact: true })
  await expect(sharpeValue(panel)).toHaveText('—')
  await tab.click()
  const region = panel.locator('.replay-chart-region'),
    error = region.getByRole('alert')
  await expect(error).toBeVisible()
  expect((await region.locator('.replay-equity-current').allTextContents()).join('')).not.toContain(
    '10,000',
  )
  const height = (await region.boundingBox())!.height
  fail = false
  await error.getByRole('button', { name: '重试', exact: true }).click()
  await expect(panel.locator('.replay-equity-chart')).toHaveAttribute('data-visible-count', '201')
  await expect(error).toBeHidden()
  expect((await region.boundingBox())!.height).toBeCloseTo(height, 0)
  await seek(panel, 19)
  await expect(sharpeValue(panel)).toHaveText('—')
  await expect(panel.locator('.replay-equity-current')).toContainText('10,400.00')
  expect(requests.filter((url) => !url.searchParams.has('cursor')).length).toBeGreaterThanOrEqual(2)
})

test('account equity and fixed Sharpe remain available when market candles fail', async ({
  page,
}) => {
  const { requests } = await stubEquityCurve(page)
  await page.route(/\/api\/replays\/[^/?]+\/candles(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 503,
      json: { code: 'REPLAY_ASSET_UNAVAILABLE', message: 'Candle asset unavailable' },
    }),
  )
  await page.goto(`/conversations/${conversationId}`)
  await page.locator('.message-list-shell .message-card').click()
  const panel = page.locator('.asset-detail-panel')
  await expect(panel.locator('.replay-chart-region').getByRole('alert')).toBeVisible()
  await expect(sharpeValue(panel)).toHaveText('-1.23')
  await panel.getByRole('tab', { name: '资金曲线', exact: true }).click()
  await expect(panel.locator('.replay-equity-chart')).toHaveAttribute('data-visible-count', '201')
  await expect(panel.locator('.replay-equity-chart')).toHaveAttribute(
    'data-visible-end',
    seconds(200),
  )
  await expect(panel.locator('.replay-equity-current')).toContainText('14,000.00')
  await expect(sharpeValue(panel)).toHaveText('-1.23')
  await expect(panel.getByRole('button', { name: '播放', exact: true })).toBeDisabled()
  expect(requests).toHaveLength(3)
})

test('zero and negative equity remain visible and playback advances the curve without refetching', async ({
  page,
}) => {
  const { requests } = await stubEquityCurve(page, {
    equityAt: (hour) => (hour === 20 ? 0 : hour === 21 ? -100 : 10000 + hour * 20),
  })
  const panel = await openReplay(page),
    chart = panel.locator('.replay-equity-chart')
  await panel.getByRole('tab', { name: '资金曲线', exact: true }).click()
  await expect(chart).toHaveAttribute('data-visible-count', '201')
  await seek(panel, 19)
  await expect(panel.locator('.replay-equity-current')).toContainText('0.00')
  await expect(panel.locator('.replay-equity-return')).toContainText(/-100\.00(?:00)?%/)
  await seek(panel, 20)
  await expect(panel.locator('.replay-equity-current')).toContainText('-100.00')
  await expect(panel.locator('.replay-equity-return')).toContainText(/-101\.00(?:00)?%/)
  const clockStart = Date.now()
  await page.clock.install({ time: clockStart })
  await page.clock.pauseAt(clockStart + 60_000)
  await panel.getByRole('button', { name: '播放', exact: true }).click()
  await page.clock.runFor(700)
  await expect
    .poll(async () => Number(await chart.getAttribute('data-visible-count')))
    .toBeGreaterThan(22)
  await expect(chart).toHaveAttribute('data-range-end', seconds(200))
  await expect(sharpeValue(panel)).toHaveText('-1.23')
  await panel.getByRole('button', { name: '暂停', exact: true }).click()
  await page.clock.resume()
  expect(requests).toHaveLength(3)
})
