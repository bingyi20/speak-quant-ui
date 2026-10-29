import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { ReplayTrade } from '../../app/features/replay/types'
import { envelope } from './auth-fixtures'
import { conversationId } from './conversation-fixtures'
import { candles, iso, replayDetail, replayTrades, stubReplay } from './replay-fixtures'

type TagDraw = { label: string; x: number; y: number; ink: string }
type MarkerWindow = Window & {
  markerFrames: WeakMap<HTMLCanvasElement, TagDraw[]>
}
const darkSurface = readFileSync(
  new URL('../../app/assets/css/themes/dark.css', import.meta.url),
  'utf8',
)
  .match(/--color-bg-surface:\s*([^;]+);/)![1]!
  .trim()

async function stubPositionMarkers(page: Page) {
  await stubReplay(page)
  const bars = candles(60)
  const trade = (
    direction: 'long' | 'short',
    sequence: number,
    entry: number,
    exit: number,
  ): ReplayTrade => {
    const source = replayTrades[sequence - 1]!
    return {
      ...source,
      id: `position-${direction}`,
      direction,
      entry_candle_id: `c-${entry}`,
      exit_candle_id: `c-${exit}`,
      entry_at: iso(entry),
      exit_at: iso(exit),
      entry_price: bars[entry]!.close,
      exit_price: bars[exit]!.close,
      fills: source.fills.map((fill, i) => ({
        ...fill,
        id: `${direction}-${i ? 'close' : 'open'}`,
        candle_id: `c-${i ? exit : entry}`,
        occurred_at: iso(i ? exit : entry),
        price: bars[i ? exit : entry]!.close,
      })),
    }
  }
  // The two sell fills deliberately share both candle and price. Their position
  // directions must keep them separate and individually reachable on the chart.
  const trades = [trade('long', 1, 20, 35), trade('short', 2, 35, 50)]
  await page.route(/\/api\/replays\/[^/?]+$/, (route) =>
    route.fulfill({
      json: envelope({
        ...replayDetail,
        conditions: {
          ...replayDetail.conditions,
          market_type: 'futures',
          contract_type: 'perpetual',
          end_at: iso(60),
        },
      }),
    }),
  )
  await page.route(/\/api\/replays\/[^/?]+\/candles(?:\?.*)?$/, (route) => {
    const query = new URL(route.request().url()).searchParams
    return route.fulfill({
      json: envelope({
        timeframe: '1h',
        items: bars.filter(
          (bar) =>
            (!query.get('from') || Date.parse(bar.time) >= Date.parse(query.get('from')!)) &&
            (!query.get('to') || Date.parse(bar.time) < Date.parse(query.get('to')!)),
        ),
        has_more: false,
        next_cursor: null,
      }),
    })
  })
  await page.route(/\/api\/replays\/[^/?]+\/trades(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({ items: trades, page: 1, size: 100, total: 2, total_pages: 1 }),
    }),
  )
  await page.route(/\/api\/replays\/[^/?]+\/insights$/, (route) =>
    route.fulfill({ json: envelope({ items: [] }) }),
  )
}

async function recordMarkerDrawing(page: Page) {
  await page.addInitScript(() => {
    const runtime = window as MarkerWindow
    runtime.markerFrames = new WeakMap()
    const clear = CanvasRenderingContext2D.prototype.clearRect,
      write = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.clearRect = function (x, y, width, height) {
      if (x === 0 && y === 0) runtime.markerFrames.set(this.canvas, [])
      clear.call(this, x, y, width, height)
    }
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      write.call(this, text, x, y, maxWidth)
      if (!this.canvas.closest('.replay-chart') || !/^[BS](?:×\d+)?$/.test(text)) return
      const matrix = this.getTransform(),
        frames = runtime.markerFrames.get(this.canvas) ?? []
      frames.push({
        label: text,
        x: matrix.a * x + matrix.c * y + matrix.e,
        y: matrix.b * x + matrix.d * y + matrix.f,
        ink: String(this.fillStyle),
      })
      runtime.markerFrames.set(this.canvas, frames)
    }
  })
}

async function markerTags(chart: Locator) {
  return chart.evaluate((host) => {
    const runtime = window as MarkerWindow,
      swatch = document.createElement('canvas').getContext('2d')!
    const rgb = (color: string) => {
      swatch.clearRect(0, 0, 1, 1)
      swatch.fillStyle = color
      swatch.fillRect(0, 0, 1, 1)
      return [...swatch.getImageData(0, 0, 1, 1).data]
    }
    const css = getComputedStyle(host),
      background = rgb(css.getPropertyValue('--color-bg-surface').trim()),
      tagText = rgb(css.getPropertyValue('--color-chart-tag-text').trim()),
      buy = rgb(css.getPropertyValue('--color-chart-buy').trim()),
      sell = rgb(css.getPropertyValue('--color-chart-sell').trim()),
      buyText = rgb(css.getPropertyValue('--color-chart-buy-text').trim()),
      sellText = rgb(css.getPropertyValue('--color-chart-sell-text').trim())
    const near = (a: number[], b: number[]) => a.every((value, i) => Math.abs(value - b[i]!) < 12)
    return [...host.querySelectorAll('canvas')]
      .flatMap((canvas) => {
        const box = canvas.getBoundingClientRect(),
          ratio = canvas.width / box.width
        if (!ratio || box.height < 100) return []
        return (runtime.markerFrames.get(canvas) ?? []).map((tag) => {
          const color = tag.label.startsWith('B') ? buy : sell,
            textColor = tag.label.startsWith('B') ? buyText : sellText,
            fill = [
              ...canvas
                .getContext('2d')!
                .getImageData(Math.round(tag.x + 8 * ratio), Math.round(tag.y - 6 * ratio), 1, 1)
                .data,
            ],
            ink = rgb(tag.ink)
          return {
            label: tag.label,
            x: box.x + tag.x / ratio,
            y: box.y + tag.y / ratio,
            hollow: near(fill, background) && near(ink, textColor),
            solid: near(fill, color) && near(ink, tagText),
          }
        })
      })
      .sort((a, b) => a.x - b.x || a.y - b.y)
  })
}

async function openChart(page: Page, english: boolean, dark: boolean) {
  await page.goto(`/conversations/${conversationId}`)
  await page.locator('.message-list-shell .message-card').click()
  const panel = page.locator('.asset-detail-panel'),
    chart = panel.locator('.replay-chart:visible')
  await expect(
    panel.getByRole('button', { name: english ? 'Play from start' : '从头播放', exact: true }),
  ).toBeEnabled()
  await expect(chart).toHaveAttribute('aria-busy', 'false')
  if (dark) {
    // Apply after hydration and chart creation; the preferences plugin owns the
    // initial document attributes and can overwrite an earlier test-only change.
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark'
      document.documentElement.classList.add('dark')
    })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await expect
      .poll(() =>
        chart.evaluate((host) =>
          getComputedStyle(host).getPropertyValue('--color-bg-surface').trim(),
        ),
      )
      .toBe(darkSurface)
  }
  await chart.scrollIntoViewIfNeeded()
  await page.mouse.move(0, 0)
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
  })
  if (dark)
    await expect
      .poll(() =>
        chart.evaluate((host, surface) => {
          const canvas = host.querySelector('canvas')!,
            ratio = canvas.width / canvas.getBoundingClientRect().width,
            swatch = document.createElement('canvas').getContext('2d')!
          swatch.fillStyle = surface
          swatch.fillRect(0, 0, 1, 1)
          return [
            ...canvas
              .getContext('2d')!
              .getImageData(Math.round(5 * ratio), Math.round(5 * ratio), 1, 1).data,
          ].every((channel, i) => channel === swatch.getImageData(0, 0, 1, 1).data[i])
        }, darkSurface),
      )
      .toBe(true)
  return { panel, chart }
}

for (const variant of ['Chinese light', 'English dark'] as const) {
  test(`position markers retain buy/sell letters and distinguish long/short in ${variant}`, async ({
    page,
    isMobile,
  }) => {
    const english = variant === 'English dark'
    if (english)
      await page
        .context()
        .addCookies([{ name: 'trade-locale-manual', value: 'en-US', url: 'http://localhost:6002' }])
    await stubPositionMarkers(page)
    await recordMarkerDrawing(page)
    let { panel, chart } = await openChart(page, english, english)
    await expect.poll(async () => (await markerTags(chart)).length).toBe(4)
    const tags = await markerTags(chart)
    expect(tags.filter((tag) => tag.label === 'B' && tag.solid)).toHaveLength(1)
    expect(tags.filter((tag) => tag.label === 'S' && tag.solid)).toHaveLength(1)
    expect(tags.filter((tag) => tag.label === 'S' && tag.hollow)).toHaveLength(1)
    expect(tags.filter((tag) => tag.label === 'B' && tag.hollow)).toHaveLength(1)
    expect(tags.some((tag) => tag.label.includes('×'))).toBe(false)
    const sells = tags.filter((tag) => tag.label === 'S')
    expect(Math.abs(sells[0]!.x - sells[1]!.x)).toBeLessThan(1)
    expect(Math.abs(sells[0]!.y - sells[1]!.y)).toBeGreaterThan(23)
    await panel.screenshot({
      path: `/tmp/speakquant-position-markers-${isMobile ? 'mobile' : 'desktop'}-${english ? 'dark' : 'light'}.png`,
    })

    if (!isMobile) {
      for (const [label, hollow, action] of [
        ['B', false, english ? 'Open long' : '开多'],
        ['S', false, english ? 'Close long' : '平多'],
        ['S', true, english ? 'Open short' : '开空'],
        ['B', true, english ? 'Close short' : '平空'],
      ] as const) {
        const tag = tags.find((item) => item.label === label && item.hollow === hollow)!
        await page.mouse.move(tag.x, tag.y)
        const tooltip = panel.locator('.replay-chart-local-fill')
        await expect(tooltip).toBeVisible()
        await expect(tooltip.locator('.replay-fill-tooltip-row')).toHaveCount(1)
        await expect(tooltip.locator('.replay-fill-tooltip-row')).toContainText(action)
        await page.mouse.move(0, 0)
        await expect(tooltip).toBeHidden()
      }
    } else {
      for (const [hollow, direction, action] of [
        [false, english ? 'Long' : '做多', english ? 'Close long' : '平多'],
        [true, english ? 'Short' : '做空', english ? 'Open short' : '开空'],
      ] as const) {
        // Each tap starts from the same full replay so evidence navigation from
        // the first sell cannot hide the second one or alter its hit geometry.
        ;({ panel, chart } = await openChart(page, english, english))
        await expect.poll(async () => (await markerTags(chart)).length).toBe(4)
        const tag = (await markerTags(chart)).find(
          (item) => item.label === 'S' && item.hollow === hollow,
        )!
        await page.touchscreen.tap(tag.x, tag.y)
        await expect(panel.locator('.replay-chart-cluster')).toHaveCount(0)
        const selected = panel.locator('.replay-trade.is-selected')
        await expect(selected.locator('.replay-trade-row')).toContainText(direction)
        await expect(selected.locator('.replay-fill-row.is-selected')).toContainText(action)
      }
    }
  })
}
