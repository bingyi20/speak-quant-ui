import { expect, test, type Locator, type Page } from '@playwright/test'
import { conversationId } from './conversation-fixtures'
import { iso, stubReplay } from './replay-fixtures'
import { stubPortfolio } from './replay-multi-fixtures'

async function openPortfolio(page: Page) {
  await page.goto(`/conversations/${conversationId}`)
  await page.locator('.message-list-shell .message-card').click()
  const panel = page.locator('.asset-detail-panel')
  await expect(panel.getByRole('button', { name: '从头播放', exact: true })).toBeEnabled()
  await expect(panel.locator('.replay-chart:visible')).toHaveAttribute('aria-busy', 'false')
  return panel
}

function tabs(panel: Locator) {
  return panel.getByRole('tablist', { name: '行情标的', exact: true })
}

function tradeCards(panel: Locator, isMobile: boolean) {
  return panel.locator(isMobile ? '.replay-trade-row' : '.replay-trade-card')
}

async function setTimeframe(page: Page, panel: Locator, isMobile: boolean, timeframe: string) {
  if (isMobile) {
    await panel.getByRole('combobox', { name: '查看周期' }).click()
    await page.getByRole('option', { name: timeframe, exact: true }).click()
  } else await panel.getByRole('button', { name: timeframe, exact: true }).click()
}

async function waitForChartPaint(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
  })
}

async function timeAxisImage(chart: Locator) {
  return chart.evaluate((host) => {
    const bottom = host.getBoundingClientRect().bottom
    const axis = [...host.querySelectorAll('canvas')].find((canvas) => {
      const box = canvas.getBoundingClientRect()
      return box.height > 0 && box.height < 40 && Math.abs(box.bottom - bottom) < 2
    })!
    return axis.toDataURL()
  })
}

async function recordChartPrices(page: Page) {
  await page.addInitScript(() => {
    const runtime = window as Window & { replayChartPrices: string[] }
    runtime.replayChartPrices = []
    const fillText = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (this.canvas.closest('.replay-chart') && /^\d[\d,.]*$/.test(text)) {
        runtime.replayChartPrices.push(text)
        if (runtime.replayChartPrices.length > 2000) runtime.replayChartPrices.shift()
      }
      fillText.call(this, text, x, y, maxWidth)
    }
  })
}

async function chartFrame(chart: Locator) {
  return chart.evaluate((host) => {
    const swatch = document.createElement('canvas').getContext('2d')!
    const rgb = (key: string) => {
      swatch.fillStyle = getComputedStyle(host).getPropertyValue(key).trim()
      swatch.fillRect(0, 0, 1, 1)
      return [...swatch.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }
    const candleColors = (
        window.matchMedia('(min-width: 761px)').matches
          ? ['--color-chart-candle-up', '--color-chart-candle-down']
          : ['--color-chart-up', '--color-chart-down']
      ).map(rgb),
      markerColors = ['--color-chart-buy', '--color-chart-sell'].map(rgb),
      canvas = host.querySelector('canvas')!,
      box = canvas.getBoundingClientRect(),
      ratio = canvas.width / box.width,
      overlay = document.createElement('canvas'),
      candleColumns: number[] = [],
      markerColumns: number[] = []
    overlay.width = canvas.width
    overlay.height = canvas.height
    // Trade tags use a separate top canvas. Isolate their pixels from the
    // transient crosshair, which can remain on a continuously visible chart.
    for (const layer of host.querySelectorAll('canvas'))
      if (layer !== canvas && layer.width === overlay.width && layer.height === overlay.height)
        overlay.getContext('2d')!.drawImage(layer, 0, 0)
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data,
      markerPixels = overlay
        .getContext('2d')!
        .getImageData(0, 0, overlay.width, overlay.height).data
    for (let x = 0; x < canvas.width; x++) {
      let candle = false,
        marker = false
      for (let y = 0; y < canvas.height && (!candle || !marker); y++) {
        const at = (y * canvas.width + x) * 4
        const matches = (data: Uint8ClampedArray, colors: number[][]) =>
          data[at + 3]! >= 240 &&
          colors.some((color) => color.every((value, i) => Math.abs(data[at + i]! - value) < 5))
        candle ||= matches(pixels, candleColors)
        marker ||= matches(markerPixels, markerColors)
      }
      if (candle) candleColumns.push(x)
      if (marker) markerColumns.push(x)
    }
    const centers = (columns: number[]) => {
      const groups: number[][] = []
      for (const x of columns) {
        if (!groups.length || x - groups.at(-1)!.at(-1)! > 1) groups.push([])
        groups.at(-1)!.push(x)
      }
      return groups.map((xs) => (xs[0]! + xs.at(-1)!) / 2 / ratio)
    }
    const candles = centers(candleColumns),
      bottom = host.getBoundingClientRect().bottom,
      axis = [...host.querySelectorAll('canvas')].find((item) => {
        const bounds = item.getBoundingClientRect()
        return bounds.height > 0 && bounds.height < 40 && Math.abs(bounds.bottom - bottom) < 2
      })!
    // Comparing actual raster output catches stale candles and misplaced trade tags,
    // even when the quote text and data-visible-end have already changed.
    const hash = (item: HTMLCanvasElement, colors?: number[][]) => {
      const bytes = item.getContext('2d')!.getImageData(0, 0, item.width, item.height).data
      let value = 2166136261
      for (let at = 0; at < bytes.length; at += 4) {
        const include =
          !colors ||
          (bytes[at + 3]! >= 240 &&
            colors.some((color) =>
              color.every((channel, i) => Math.abs(bytes[at + i]! - channel) < 5),
            ))
        for (let i = 0; i < 4; i++)
          value = Math.imul(value ^ (include ? bytes[at + i]! : 0), 16777619)
      }
      return `${item.width}x${item.height}:${value >>> 0}`
    }
    return {
      plot: hash(canvas),
      markerRaster: hash(overlay, markerColors),
      axis: hash(axis),
      width: box.width,
      candles,
      markers: centers(markerColumns),
      spacing: candles.length > 4 ? (candles.at(-2)! - candles[1]!) / (candles.length - 3) : 0,
    }
  })
}

async function seekPortfolio(panel: Locator, index: number) {
  const slider = panel.locator('.replay-timeline input')
  await slider.press('Home')
  await expect(slider).toHaveValue(String(Date.parse(iso(0)) / 1000))
  for (let current = 10; current <= index; current += 10) {
    await slider.press('PageUp')
    await expect(slider).toHaveValue(String(Date.parse(iso(current)) / 1000))
  }
  for (let current = Math.floor(index / 10) * 10 + 1; current <= index; current++) {
    await slider.press('ArrowRight')
    await expect(slider).toHaveValue(String(Date.parse(iso(current)) / 1000))
  }
}

async function panChart(page: Page, chart: Locator, fraction: number) {
  await chart.scrollIntoViewIfNeeded()
  const box = (await chart.boundingBox())!,
    x = box.x + box.width / 2,
    y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + Math.sign(fraction) * 3, y)
  await page.mouse.move(x + box.width * fraction, y, { steps: 10 })
  await page.mouse.up()
  await page.mouse.move(0, 0)
  await waitForChartPaint(page)
}

async function prepareCatchupPage(page: Page) {
  await stubPortfolio(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const panel = await openPortfolio(page),
    instruments = tabs(panel),
    eth = instruments.getByRole('tab', { name: /ETH\/USDT/ }),
    btc = instruments.getByRole('tab', { name: /BTC\/USDT.*现货/ }),
    chart = panel.locator('.replay-chart:visible')
  await eth.click()
  await expect(eth).toHaveAttribute('aria-selected', 'true')
  await expect(chart).toHaveAttribute('aria-busy', 'false')
  await chart.scrollIntoViewIfNeeded()
  await waitForChartPaint(page)
  // Give both viewports enough history to follow, while leaving the trades at
  // 80h and 100h visible together. Zoom is an ordinary user gesture.
  for (let zoom = 0; zoom < 3; zoom++) {
    const before = await timeAxisImage(chart)
    const box = (await chart.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -200)
    await page.mouse.move(0, 0)
    await expect.poll(() => timeAxisImage(chart)).not.toBe(before)
  }
  await seekPortfolio(panel, 90)
  await waitForChartPaint(page)
  await expect(panel.getByRole('button', { name: '回到最新', exact: true })).toBeHidden()
  return { page, panel, eth, btc, chart }
}

test('portfolio tabs isolate chart feeds while trades, account result and the timeline retain every instrument', async ({
  page,
  isMobile,
}) => {
  const { candleRequests, tradeRequests, invalidRequests } = await stubPortfolio(page)
  await recordChartPrices(page)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const panel = await openPortfolio(page),
    instruments = tabs(panel)
  await expect(instruments.getByRole('tab')).toHaveCount(4)
  await expect(instruments.getByRole('tab', { name: /BTC\/USDT.*现货/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(instruments.getByRole('tab', { name: /BTC\/USDT.*永续/ })).toBeVisible()
  const accountResult = await panel.locator('.replay-summary-metrics dd').allTextContents()
  const timelineRange = await panel.locator('.replay-timeline input').getAttribute('max')
  await expect(tradeCards(panel, isMobile)).toHaveCount(3)
  await expect(tradeCards(panel, isMobile).filter({ hasText: 'ETH/USDT' })).toHaveCount(1)
  await expect(tradeCards(panel, isMobile).filter({ hasText: /BTC\/USDT.*现货/s })).toHaveCount(1)
  await expect(tradeCards(panel, isMobile).filter({ hasText: /BTC\/USDT.*永续/s })).toHaveCount(1)
  if (!isMobile)
    await expect(panel.locator('.replay-track-marker[data-event-id^="fill:"]')).toHaveCount(6)

  await instruments.getByRole('tab', { name: /ETH\/USDT/ }).click()
  await expect(panel.getByRole('img', { name: 'ETH/USDT 1h K 线图' })).toHaveAttribute(
    'aria-busy',
    'false',
  )
  await expect(panel.locator('.replay-chart:visible')).toHaveAttribute(
    'data-visible-end',
    String(Date.parse(iso(199)) / 1000),
  )
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as Window & { replayChartPrices: string[] }).replayChartPrices.some((label) => {
          const value = Number(label.replaceAll(',', ''))
          return value > 3100 && value < 3500
        }),
      ),
    )
    .toBe(true)
  await setTimeframe(page, panel, isMobile, '2h')
  await expect(panel.getByRole('img', { name: 'ETH/USDT 2h K 线图' })).toHaveAttribute(
    'aria-busy',
    'false',
  )
  await expect(tradeCards(panel, isMobile)).toHaveCount(3)
  await expect(panel.locator('.replay-timeline input')).toHaveAttribute('max', timelineRange!)
  // Position may be specific to the chart instrument; the five portfolio metrics are shared.
  await expect(panel.locator('.replay-summary-metrics dd').first()).toHaveText(accountResult[0]!)
  await expect(panel.locator('.replay-summary-metrics dd').nth(2)).toHaveText('3')
  if (!isMobile)
    await expect(panel.locator('.replay-track-marker[data-event-id^="fill:"]')).toHaveCount(6)

  await tradeCards(panel, isMobile)
    .filter({ hasText: /BTC\/USDT.*永续/s })
    .click()
  await expect(instruments.getByRole('tab', { name: /BTC\/USDT.*永续/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(panel.getByRole('img', { name: 'BTC/USDT 1h K 线图' })).toHaveAttribute(
    'aria-busy',
    'false',
  )
  await expect(panel.locator('.replay-chart:visible .replay-evidence-shade')).toBeVisible()
  await expect(tradeCards(panel, isMobile)).toHaveCount(3)
  if (!isMobile) {
    await panel.locator('[data-trade-details="portfolio-trade-asset_b"]').click()
    const dialog = page.getByRole('dialog', { name: '交易明细', exact: true })
    await expect(dialog).toContainText('ETH/USDT')
    await dialog.locator('.replay-fill-row').first().click()
    await expect(instruments.getByRole('tab', { name: /ETH\/USDT/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  }
  expect(tradeRequests.some((url) => url.searchParams.get('page') === '2')).toBe(true)
  expect(tradeRequests.every((url) => !url.searchParams.has('instrument'))).toBe(true)
  expect(
    candleRequests.some(
      (url) =>
        url.searchParams.get('instrument') === 'asset_b' &&
        url.searchParams.get('timeframe') === '2h',
    ),
  ).toBe(true)
  expect(candleRequests.some((url) => url.searchParams.get('instrument') === 'hedge')).toBe(true)
  expect(invalidRequests).toEqual([])
  expect(pageErrors).toEqual([])
  await waitForChartPaint(page)
  await page.screenshot({
    path: test.info().outputPath('portfolio-replay.png'),
    animations: 'disabled',
  })
  await panel.locator('.replay-detail-content').evaluate((element) => {
    element.scrollTop = 0
  })
  await page.screenshot({
    path: `/tmp/speakquant-portfolio-${isMobile ? 'mobile' : 'desktop-panel'}.png`,
    animations: 'disabled',
  })
  if (!isMobile) {
    await panel.getByRole('button', { name: '全屏', exact: true }).click()
    await expect(panel).toHaveClass(/is-fullscreen/)
    await expect
      .poll(
        async () =>
          (await panel.locator('.replay-chart:visible canvas').first().boundingBox())?.width ?? 0,
      )
      .toBeGreaterThan(1000)
    await waitForChartPaint(page)
    await page.screenshot({
      path: '/tmp/speakquant-portfolio-desktop-fullscreen.png',
      animations: 'disabled',
    })
  }
})

test('keyboard instrument tabs support a read-only feed without inventing execution candles', async ({
  page,
  isMobile,
}) => {
  const { candleRequests, invalidRequests } = await stubPortfolio(page)
  const panel = await openPortfolio(page),
    instruments = tabs(panel),
    first = instruments.getByRole('tab').first(),
    benchmark = instruments.getByRole('tab', { name: /SOL\/USDT/ })
  const end = await panel.locator('.replay-timeline input').getAttribute('max')
  await first.focus()
  await first.press('End')
  await expect(benchmark).toBeFocused()
  // Supports both automatic and manual activation while keeping keyboard focus visible.
  await benchmark.press('Enter')
  await expect(benchmark).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByRole('img', { name: 'SOL/USDT 4h K 线图' })).toHaveAttribute(
    'aria-busy',
    'false',
  )
  await expect(panel.locator('.replay-chart:visible')).toHaveAttribute(
    'data-visible-end',
    String(Date.parse(iso(196)) / 1000),
  )
  await expect(panel.locator('.replay-timeline input')).toHaveAttribute('max', end!)
  await expect(tradeCards(panel, isMobile)).toHaveCount(3)
  await expect(panel.locator('.replay-summary-metrics dd').nth(2)).toHaveText('3')
  expect(
    candleRequests
      .filter((url) => url.searchParams.get('instrument') === 'benchmark')
      .every(
        (url) => !url.searchParams.has('timeframe') || url.searchParams.get('timeframe') === '4h',
      ),
  ).toBe(true)
  expect(invalidRequests).toEqual([])
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({
    path: test.info().outputPath('portfolio-readonly-feed.png'),
    animations: 'disabled',
  })
})

test('a late instrument response cannot overwrite a newer chart selection', async ({ page }) => {
  const { invalidRequests } = await stubPortfolio(page)
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  let held = false
  await page.route(/\/api\/replays\/[^/?]+\/candles(?:\?.*)?$/, async (route) => {
    if (new URL(route.request().url()).searchParams.get('instrument') === 'asset_b' && !held) {
      held = true
      await waiting
    }
    await route.fallback()
  })
  const panel = await openPortfolio(page),
    instruments = tabs(panel)
  await instruments.getByRole('tab', { name: /ETH\/USDT/ }).click()
  await expect.poll(() => held).toBe(true)
  await instruments.getByRole('tab', { name: /BTC\/USDT.*现货/ }).click()
  release()
  await expect(instruments.getByRole('tab', { name: /BTC\/USDT.*现货/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(panel.getByRole('img', { name: 'BTC/USDT 1h K 线图' })).toHaveAttribute(
    'aria-busy',
    'false',
  )
  await expect(panel.locator('.replay-chart:visible')).toHaveAttribute(
    'data-visible-end',
    String(Date.parse(iso(199)) / 1000),
  )
  await expect(panel.locator('.replay-chart-block:visible .replay-ohlc dd').first()).toHaveText(
    '95,199.00',
  )
  await expect(panel.locator('.replay-inline-error')).toHaveCount(0)
  expect(invalidRequests).toEqual([])
})

test('a failed instrument switch preserves the current chart and the same tab can retry', async ({
  page,
}) => {
  await stubPortfolio(page)
  let failed = false
  await page.route(/\/api\/replays\/[^/?]+\/candles(?:\?.*)?$/, async (route) => {
    if (new URL(route.request().url()).searchParams.get('instrument') === 'asset_b' && !failed) {
      failed = true
      return route.fulfill({
        status: 503,
        json: { code: 50300, message: 'Feed temporarily unavailable' },
      })
    }
    return route.fallback()
  })
  const panel = await openPortfolio(page),
    instruments = tabs(panel),
    original = instruments.getByRole('tab', { name: /BTC\/USDT.*现货/ }),
    target = instruments.getByRole('tab', { name: /ETH\/USDT/ })
  await target.click()
  await expect(panel.locator('.replay-inline-error')).toBeVisible()
  await expect(original).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByRole('img', { name: 'BTC/USDT 1h K 线图' })).toBeVisible()
  await expect(panel.locator('.replay-chart-block:visible .replay-ohlc dd').first()).toHaveText(
    '95,199.00',
  )
  await target.click()
  await expect(target).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByRole('img', { name: 'ETH/USDT 1h K 线图' })).toHaveAttribute(
    'data-visible-end',
    String(Date.parse(iso(199)) / 1000),
  )
  await expect(panel.locator('.replay-chart-block:visible .replay-ohlc dd').first()).toHaveText(
    '3,399.00',
  )
  await expect(panel.locator('.replay-inline-error')).toHaveCount(0)
})

test('legacy single-instrument replays retain their chart without a redundant instrument tab', async ({
  page,
}) => {
  const { requested } = await stubReplay(page)
  const panel = await openPortfolio(page)
  await expect(tabs(panel)).toHaveCount(0)
  await expect(panel.getByRole('img', { name: 'BTC/USDT 1h K 线图' })).toBeVisible()
  expect(requested.every((url) => !new URL(url).searchParams.has('instrument'))).toBe(true)
})

test('each visited instrument retains its own chart instance and zoom when switching back', async ({
  page,
  isMobile,
}) => {
  await stubPortfolio(page)
  const panel = await openPortfolio(page),
    instruments = tabs(panel),
    btc = instruments.getByRole('tab', { name: /BTC\/USDT.*现货/ }),
    eth = instruments.getByRole('tab', { name: /ETH\/USDT/ }),
    activeChart = panel.locator('.replay-chart:visible')
  await setTimeframe(page, panel, isMobile, '4h')
  await expect(panel.getByRole('img', { name: 'BTC/USDT 4h K 线图' })).toHaveAttribute(
    'aria-busy',
    'false',
  )
  await waitForChartPaint(page)
  const btcHost = await activeChart.elementHandle(),
    btcCanvas = await activeChart.locator('canvas').first().elementHandle()
  expect(btcHost).not.toBeNull()
  expect(btcCanvas).not.toBeNull()
  const originalAxis = await timeAxisImage(activeChart)
  await activeChart.scrollIntoViewIfNeeded()
  const box = (await activeChart.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -200)
  await page.mouse.move(0, 0)
  await expect.poll(() => timeAxisImage(activeChart)).not.toBe(originalAxis)
  await waitForChartPaint(page)
  const zoomedAxis = await timeAxisImage(activeChart)

  await eth.click()
  await expect(eth).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByRole('img', { name: 'ETH/USDT 1h K 线图' })).toBeVisible()
  await expect(activeChart).toHaveAttribute('aria-busy', 'false')
  expect(await activeChart.evaluate((element, previous) => element === previous, btcHost)).toBe(
    false,
  )
  expect(
    await activeChart
      .locator('canvas')
      .first()
      .evaluate((canvas, previous) => canvas === previous, btcCanvas),
  ).toBe(false)
  const ethCanvas = await activeChart.locator('canvas').first().elementHandle()
  await setTimeframe(page, panel, isMobile, '2h')
  await expect(panel.getByRole('img', { name: 'ETH/USDT 2h K 线图' })).toHaveAttribute(
    'aria-busy',
    'false',
  )

  await btc.click()
  await expect(btc).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByRole('img', { name: 'BTC/USDT 4h K 线图' })).toBeVisible()
  expect(await activeChart.evaluate((element, previous) => element === previous, btcHost)).toBe(
    true,
  )
  expect(
    await activeChart
      .locator('canvas')
      .first()
      .evaluate((canvas, previous) => canvas === previous, btcCanvas),
  ).toBe(true)
  await page.mouse.move(0, 0)
  await expect.poll(() => timeAxisImage(activeChart)).toBe(zoomedAxis)

  await eth.click()
  await expect(eth).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByRole('img', { name: 'ETH/USDT 2h K 线图' })).toBeVisible()
  expect(
    await activeChart
      .locator('canvas')
      .first()
      .evaluate((canvas, previous) => canvas === previous, ethCanvas),
  ).toBe(true)

  await page.mouse.move(0, 0)
  await waitForChartPaint(page)
  const beforeStrategy = await timeAxisImage(activeChart)
  await panel.getByRole('button', { name: '查看策略', exact: true }).click()
  await expect(panel.getByText('历史设计', { exact: true })).toBeVisible()
  await expect(activeChart).toHaveCount(0)
  await panel.getByRole('button', { name: '返回回测', exact: true }).click()
  await expect(eth).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByRole('img', { name: 'ETH/USDT 2h K 线图' })).toHaveAttribute(
    'aria-busy',
    'false',
  )
  expect(
    await activeChart
      .locator('canvas')
      .first()
      .evaluate((canvas, previous) => canvas === previous, ethCanvas),
  ).toBe(true)
  await page.mouse.move(0, 0)
  await expect.poll(() => timeAxisImage(activeChart)).toBe(beforeStrategy)
})

for (const scenario of ['following', 'detached', 'filling', 'global seek'] as const) {
  test(`hidden instrument catches up to the continuously visible chart after ${scenario}`, async ({
    page,
    browser,
    baseURL,
    viewport,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    userAgent,
    locale,
  }) => {
    test.setTimeout(60_000)
    // Playwright's mocked clock is shared by pages in one context. Use a second
    // context with the same device so each path advances only its own playback.
    const referenceContext = await browser.newContext({
      baseURL,
      viewport,
      deviceScaleFactor,
      isMobile,
      hasTouch,
      userAgent,
      locale,
    })
    const referencePage = await referenceContext.newPage()
    try {
      const reference = await prepareCatchupPage(referencePage),
        hidden = await prepareCatchupPage(page),
        paths = [reference, hidden]
      if (scenario === 'detached' || scenario === 'filling') {
        for (const path of paths) {
          await panChart(path.page, path.chart, scenario === 'detached' ? 0.45 : -0.2)
          await expect(
            path.panel.getByRole('button', { name: '回到最新', exact: true }),
          ).toBeVisible()
        }
      }
      const initial = await chartFrame(reference.chart)
      await expect.poll(async () => (await chartFrame(hidden.chart)).axis).toBe(initial.axis)
      const canvas = await hidden.chart.locator('canvas').first().elementHandle()
      expect(canvas).not.toBeNull()
      await hidden.btc.click()
      await expect(hidden.btc).toHaveAttribute('aria-selected', 'true')
      await expect(hidden.chart).toHaveAttribute('aria-busy', 'false')
      await waitForChartPaint(page)
      const dormantImage = await canvas!.evaluate((element) => element.toDataURL())

      if (scenario === 'global seek') {
        for (const path of paths) {
          // Forward past both ETH fills, then backwards before either fill.
          // The hidden chart must consume the latest seek, including its framing.
          await seekPortfolio(path.panel, 140)
          await seekPortfolio(path.panel, 40)
          await waitForChartPaint(path.page)
        }
      } else {
        const clockStart = Date.now()
        for (const path of paths) {
          await path.page.bringToFront()
          await path.page.clock.install({ time: clockStart })
          await path.page.clock.pauseAt(clockStart + 60_000)
          await path.panel.getByRole('button', { name: '播放', exact: true }).click()
          await expect(path.panel.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
          await path.page.clock.runFor(2400)
          await path.panel.getByRole('button', { name: '暂停', exact: true }).click()
          await path.page.mouse.move(0, 0)
          await path.page.clock.runFor(100)
        }
        expect(Number(await reference.panel.locator('.replay-timeline input').inputValue())).toBe(
          Number(await hidden.panel.locator('.replay-timeline input').inputValue()),
        )
        expect(
          Number(await hidden.panel.locator('.replay-timeline input').inputValue()),
        ).toBeGreaterThan(Date.parse(iso(100)) / 1000)
      }
      // While hidden, the original chart does no drawing. Its canvas survives
      // reactivation and then catches up to the same output as the live chart.
      expect(await canvas!.evaluate((element) => element.toDataURL())).toBe(dormantImage)
      await referencePage.bringToFront()
      await referencePage.mouse.move(0, 0)
      if (scenario === 'global seek') await waitForChartPaint(referencePage)
      else await referencePage.clock.runFor(100)
      const expected = await chartFrame(reference.chart),
        cutoff = await reference.panel.locator('.replay-timeline input').inputValue(),
        expectedReturnControl = await reference.panel
          .getByRole('button', { name: '回到最新', exact: true })
          .isVisible()
      if (scenario === 'detached' && !isMobile) expect(expected.axis).toBe(initial.axis)
      if (scenario === 'global seek') expect(expected.markers).toHaveLength(0)
      else if (scenario !== 'detached') expect(expected.markers.length).toBeGreaterThan(0)
      await page.bringToFront()
      await hidden.eth.click()
      await expect(hidden.eth).toHaveAttribute('aria-selected', 'true')
      await expect(hidden.chart).toHaveAttribute('aria-busy', 'false')
      await page.mouse.move(0, 0)
      if (scenario === 'global seek') await waitForChartPaint(page)
      else await page.clock.runFor(150)
      expect(
        await hidden.chart
          .locator('canvas')
          .first()
          .evaluate((element, previous) => element === previous, canvas),
      ).toBe(true)
      await expect(hidden.chart).toHaveAttribute('data-visible-end', cutoff)
      const actual = await chartFrame(hidden.chart)
      await test.info().attach('chart-comparison', {
        body: JSON.stringify({ cutoff, initial, expected, actual }, null, 2),
        contentType: 'application/json',
      })
      expect(actual.axis).toBe(expected.axis)
      expect(actual.plot).toBe(expected.plot)
      expect(actual.markerRaster).toBe(expected.markerRaster)
      expect(actual.markers).toEqual(expected.markers)
      expect(Math.abs(actual.spacing - initial.spacing)).toBeLessThan(0.1)
      if (expectedReturnControl)
        await expect(
          hidden.panel.getByRole('button', { name: '回到最新', exact: true }),
        ).toBeVisible()
      else
        await expect(
          hidden.panel.getByRole('button', { name: '回到最新', exact: true }),
        ).toBeHidden()
    } finally {
      await referenceContext.close()
    }
  })
}

test('English instrument tabs expose keyboard selection and translated market labels', async ({
  page,
}) => {
  await page
    .context()
    .addCookies([{ name: 'trade-locale-manual', value: 'en-US', url: 'http://localhost:6002' }])
  await stubPortfolio(page)
  await page.goto(`/conversations/${conversationId}`)
  await page.locator('.message-list-shell .message-card').click()
  const panel = page.locator('.asset-detail-panel'),
    instruments = panel.getByRole('tablist', { name: 'Chart instrument', exact: true }),
    first = instruments.getByRole('tab', { name: /BTC\/USDT.*Spot/ }),
    second = instruments.getByRole('tab', { name: /ETH\/USDT.*Perpetual/ })
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await first.focus()
  await first.press('ArrowRight')
  await expect(second).toBeFocused()
  await second.press('Enter')
  await expect(second).toHaveAttribute('aria-selected', 'true')
  await expect(panel.locator('.replay-chart:visible')).toHaveAttribute('aria-label', /ETH\/USDT/)
  await expect(panel.locator('.replay-chart:visible')).toHaveAttribute('aria-busy', 'false')
})
