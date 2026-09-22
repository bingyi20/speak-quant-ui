import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { conversationId } from './conversation-fixtures'
import { stubReplay } from './replay-fixtures'
async function open(page: import('@playwright/test').Page, ready = true) {
  await page.goto(`/conversations/${conversationId}`)
  await page.locator('.message-list-shell .message-card').click()
  await expect(page.locator('.replay-chart canvas').first()).toBeVisible()
  if (ready) await expect(page.getByRole('button', { name: '从头播放', exact: true })).toBeEnabled()
}
async function insightDots(chart: import('@playwright/test').Locator) {
  return chart.evaluate((host) => {
    const swatch = document.createElement('canvas').getContext('2d')!
    swatch.fillStyle = getComputedStyle(host).getPropertyValue('--color-chart-insight').trim()
    swatch.fillRect(0, 0, 1, 1)
    const rgb = [...swatch.getImageData(0, 0, 1, 1).data].slice(0, 3)
    for (const canvas of host.querySelectorAll('canvas')) {
      const box = canvas.getBoundingClientRect(),
        ratio = canvas.width / box.width
      if (box.height < 100 || !ratio) continue
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      const matches = (x: number, y: number) => {
        const at = (Math.round(y) * canvas.width + Math.round(x)) * 4
        return rgb.every((v, i) => Math.abs(data[at + i]! - v) < 40) && data[at + 3]! > 240
      }
      const columns: number[] = []
      for (let x = 0; x < canvas.width; x++)
        for (let y = Math.max(0, Math.floor(canvas.height - 32 * ratio)); y < canvas.height; y++)
          if (matches(x, y)) {
            columns.push(x)
            break
          }
      const groups: number[][] = []
      for (const x of columns) {
        if (!groups.length || x - groups.at(-1)!.at(-1)! > 2 * ratio) groups.push([])
        groups.at(-1)!.push(x)
      }
      const result = groups
        .filter((xs) => xs.at(-1)! - xs[0]! > 11 * ratio)
        .map((xs) => {
          const centerX = (xs[0]! + xs.at(-1)!) / 2
          const centerY = canvas.height - 18 * ratio
          return {
            x: box.x + centerX / ratio,
            y: box.y + centerY / ratio,
            width: (xs.at(-1)! - xs[0]! + 1) / ratio,
            active: matches(centerX + 5 * ratio, centerY + 1 * ratio),
          }
        })
      if (result.length) return result
    }
    return []
  })
}
async function candleGeometry(chart: import('@playwright/test').Locator) {
  return chart.evaluate((host) => {
    const swatch = document.createElement('canvas').getContext('2d')!
    const colors = ['--color-chart-candle-up', '--color-chart-candle-down'].map((key) => {
      swatch.fillStyle = getComputedStyle(host).getPropertyValue(key).trim()
      swatch.fillRect(0, 0, 1, 1)
      return [...swatch.getImageData(0, 0, 1, 1).data].slice(0, 3)
    })
    const canvas = host.querySelector('canvas')!
    const box = canvas.getBoundingClientRect(),
      ratio = canvas.width / box.width
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    const columns: number[] = []
    for (let x = 0; x < canvas.width; x++) {
      for (let y = 0; y < canvas.height; y++) {
        const at = (y * canvas.width + x) * 4
        if (
          data[at + 3]! > 240 &&
          colors.some((color) => color.every((v, i) => Math.abs(data[at + i]! - v) < 10))
        ) {
          columns.push(x)
          break
        }
      }
    }
    const groups: number[][] = []
    for (const x of columns) {
      if (!groups.length || x - groups.at(-1)!.at(-1)! > 1) groups.push([])
      groups.at(-1)!.push(x)
    }
    const centers = groups.map((xs) => (xs[0]! + xs.at(-1)!) / 2 / ratio)
    const gaps = centers
      .slice(1)
      .map((x, i) => x - centers[i]!)
      .sort((a, b) => a - b)
    return {
      first: centers[0] ?? null,
      last: centers.at(-1) ?? null,
      width: box.width,
      spacing: gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : null,
    }
  })
}
async function openTradeDetails(page: import('@playwright/test').Page, id: string) {
  await page.locator(`[data-trade-details="${id}"]`).click()
  const dialog = page.getByRole('dialog', { name: '交易明细', exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}
async function timeAxisImage(chart: import('@playwright/test').Locator) {
  return chart.evaluate((host) => {
    const bottom = host.getBoundingClientRect().bottom
    const axis = [...host.querySelectorAll('canvas')].find((canvas) => {
      const box = canvas.getBoundingClientRect()
      return box.height > 0 && box.height < 40 && Math.abs(box.bottom - bottom) < 2
    })!
    return axis.toDataURL()
  })
}
async function closeTradeDetails(page: import('@playwright/test').Page) {
  const dialog = page.getByRole('dialog', { name: '交易明细', exact: true })
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog).toBeHidden()
}
test('full-width chart, frozen strategy return, evidence, context retry and strategy download', async ({
  page,
  isMobile,
}) => {
  const { calls } = await stubReplay(page, { multi: true, failSendOnce: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await open(page)
  const panel = page.locator('.asset-detail-panel')
  expect(
    (await panel.locator('.replay-chart').boundingBox())!.width /
      (await panel.boundingBox())!.width,
  ).toBeGreaterThan(0.87)
  await expect(page.locator('.replay-chart a')).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('backtest-overview.png') })
  await panel.getByRole('button', { name: '查看策略', exact: true }).click()
  await expect(panel.getByText('历史设计', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '返回回测', exact: true }).click()
  await expect(panel.getByRole('button', { name: '从头播放', exact: true })).toBeEnabled()
  if (isMobile) {
    await panel.getByRole('tab', { name: /洞察/ }).click()
    await panel.getByRole('button', { name: /趋势区间表现更好/ }).click()
    await expect(panel.getByText('第一次交易验证趋势信号')).toBeVisible()
    await panel.getByRole('button', { name: '关联交易 #1', exact: true }).click()
  } else {
    await expect(panel.locator('.replay-overall-insight')).toHaveCount(0)
    await panel.locator('[data-trade-id="t-1"]').click()
  }
  await expect(panel.locator('.replay-evidence-shade')).toBeVisible()
  const tradeDetail = isMobile ? panel : await openTradeDetails(page, 't-1')
  if (isMobile) await panel.getByRole('button', { name: '成交明细 · 2 次', exact: true }).click()
  await expect(tradeDetail.locator('.replay-fill-row')).toHaveCount(2)
  await tradeDetail.getByRole('button', { name: '询问 Agent', exact: true }).click()
  await expect(page.locator('.replay-reference')).toContainText('BTC 均线验证')
  if (!isMobile)
    await panel
      .locator('.asset-detail-header')
      .getByRole('button', { name: '关闭', exact: true })
      .click()
  await page.getByRole('textbox', { name: '交易想法' }).fill('解释这笔交易')
  await page.getByRole('button', { name: '发送研究想法', exact: true }).click()
  await expect(page.getByRole('button', { name: '重试', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect.poll(() => calls.filter((c) => c.method === 'send').length).toBe(2)
  const send = calls.filter((c) => c.method === 'send')
  expect(send[0]!.body.context).toMatchObject({ replay_id: 'replay-1', trade_id: 't-1' })
  expect(send[0]!.body).toEqual(send[1]!.body)
  expect(send[0]!.key).toBe(send[1]!.key)
  await page.locator('.message-list-shell .message-card').first().click()
  await expect(panel.getByRole('button', { name: '更多回测操作' })).toHaveCount(0)
  await expect(panel.getByRole('button', { name: '下载运行包' })).toHaveCount(0)
  await panel.getByRole('button', { name: '查看策略', exact: true }).click()
  if (process.env.NUXT_PUBLIC_ENABLE_RUNNER_DOWNLOAD !== 'true') {
    await expect(panel.getByRole('button', { name: '下载运行包', exact: true })).toHaveCount(0)
    expect(errors).toEqual([])
    return
  }
  await expect(panel.getByRole('button', { name: '下载运行包', exact: true })).toBeEnabled()
  await panel.getByRole('button', { name: '下载运行包', exact: true }).click()
  let request: Record<string, string> | undefined
  await page.route('**/api/runner-packages/download', (route) => {
    request = route.request().postDataJSON()
    return route.fulfill({
      contentType: 'application/zip',
      headers: {
        'content-disposition': 'attachment; filename="runner.zip"',
        'access-control-expose-headers': 'Content-Disposition',
      },
      body: Buffer.from('PK\x05\x06' + '\x00'.repeat(18)),
    })
  })
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 ZIP', exact: true }).click()
  expect((await downloading).suggestedFilename()).toBe('runner.zip')
  expect(request).toMatchObject({ strategy_node_id: 'node-old', source_replay_id: 'replay-old' })
  expect(errors).toEqual([])
})
test('server timeframe switching, playback pause, event navigation, responsive fullscreen', async ({
  page,
  isMobile,
}) => {
  const { requested } = await stubReplay(page, { multi: true })
  await open(page)
  const panel = page.locator('.asset-detail-panel')
  if (isMobile) {
    await panel.getByRole('combobox', { name: '查看周期' }).click()
    await page.getByRole('option', { name: '4h', exact: true }).click()
  } else await panel.getByRole('button', { name: '4h', exact: true }).click()
  await expect(panel.getByRole('img', { name: 'BTC/USDT 4h K 线图' })).toBeVisible()
  expect(requested.some((url) => new URL(url).searchParams.get('timeframe') === '4h')).toBe(true)
  await panel.getByRole('button', { name: '从头播放', exact: true }).click()
  await expect(panel.getByRole('img', { name: 'BTC/USDT 1h K 线图' })).toBeVisible()
  await expect(panel.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(panel.getByRole('button', { name: '播放', exact: true })).toBeVisible()
  await expect(panel.getByText('反向信号触发止损', { exact: true })).toBeHidden()
  await panel.locator('.replay-timeline input').press('Home')
  for (let i = 0; i < 20; i++) await panel.locator('.replay-timeline input').press('ArrowRight')
  if (isMobile) await expect(panel.locator('.replay-current-state')).toContainText('持有多仓')
  else await expect(panel.locator('.replay-result-label')).toHaveText('截至此时')
  if (isMobile) {
    await panel.getByRole('combobox', { name: '查看周期' }).click()
    await page.getByRole('option', { name: '4h', exact: true }).click()
  } else await panel.getByRole('button', { name: '4h', exact: true }).click()
  const { iso } = await import('./replay-fixtures')
  await expect(panel.getByRole('img', { name: 'BTC/USDT 4h K 线图' })).toHaveAttribute(
    'data-visible-end',
    String(Date.parse(iso(16)) / 1000),
  )
  await panel.locator('.replay-timeline input').press('Home')
  await expect(panel.locator('.replay-chart')).not.toHaveAttribute('data-visible-end')
  await panel.locator('.replay-timeline input').press('End')
  await expect(panel.getByRole('img', { name: 'BTC/USDT 4h K 线图' })).toHaveAttribute(
    'data-visible-end',
    String(Date.parse(iso(196)) / 1000),
  )
  await panel.getByRole('button', { name: '全屏', exact: true }).click()
  await expect(panel).toHaveClass(/is-fullscreen/)
  expect(
    (await panel.locator('.replay-chart').boundingBox())!.width / page.viewportSize()!.width,
  ).toBeGreaterThan(0.85)
  await page.screenshot({ path: test.info().outputPath('backtest-fullscreen.png') })
  expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
})
test('old candle contract, partial failure retry, no trades and public notices', async ({
  page,
  isMobile,
}) => {
  await stubReplay(page, { empty: true, failCandles: true })
  await open(page, false)
  await expect(page.getByRole('button', { name: '4h', exact: true })).toBeHidden()
  await page
    .locator('.replay-inline-error')
    .getByRole('button', { name: '重试', exact: true })
    .click()
  await expect(page.locator('.replay-inline-error')).toHaveCount(0)
  if (isMobile) await page.getByRole('tab', { name: /交易/ }).click()
  await expect(page.getByText('没有触发交易', { exact: true })).toBeVisible()
  await page.goto('/zh-CN/open-source')
  await expect(page.getByRole('heading', { name: '开源声明', exact: true })).toBeVisible()
  await expect(page.locator('article a[href="https://www.tradingview.com/"]')).toBeVisible()
})

test('only a live completion opens playback; closing and reduced motion suppress auto restart', async ({
  page,
}) => {
  await stubReplay(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(`/conversations/${conversationId}`)
  await expect(page.locator('.message-list-shell .message-card')).toBeVisible()
  await expect(page.locator('.asset-detail-panel')).toBeHidden()
  await page.getByRole('textbox', { name: '交易想法' }).fill('运行验证')
  await page.getByRole('button', { name: '发送研究想法' }).click()
  await page.locator('.workspace-toolbar').click()
  await expect(page.locator('.asset-detail-panel')).toBeVisible()
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  await page
    .locator('.asset-detail-panel')
    .getByRole('button', { name: '关闭', exact: true })
    .click()
  await expect(page.locator('.asset-detail-panel')).toBeHidden()
  await expect(page.locator('.replay-chart canvas')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '发送研究想法' })).toBeDisabled()
  await page.reload()
  await expect(page.locator('.message-list-shell .message-card').first()).toBeVisible()
  await expect(page.locator('.asset-detail-panel')).toBeHidden()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('textbox', { name: '交易想法' }).fill('重新验证')
  await page.getByRole('button', { name: '发送研究想法' }).click()
  await expect(page.getByRole('textbox', { name: '交易想法' })).toHaveValue('')
  await expect(page.getByText('研究结论', { exact: true }).last()).toBeVisible()
  await expect(page.locator('.asset-detail-panel')).toBeHidden()
})

test('large frozen history keeps the chart interactive and limits trade DOM', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  const { candles, iso, replayDetail, replayTrades } = await import('./replay-fixtures')
  const { envelope } = await import('./auth-fixtures')
  await stubReplay(page)
  const count = 200_000,
    raw = candles(count)
  await page.route(/\/api\/replays\/[^/?]+$/, (r) =>
    r.fulfill({
      json: envelope({
        ...replayDetail,
        conditions: { ...replayDetail.conditions, end_at: iso(count) },
        result: { ...replayDetail.result, trade_count: 10000 },
      }),
    }),
  )
  await page.route(/\/api\/replays\/[^/?]+\/candles(?:\?.*)?$/, (r) => {
    const q = new URL(r.request().url()).searchParams,
      offset = q.has('from') ? Math.max(0, count - 200) : Number(q.get('cursor') ?? 0),
      limit = Number(q.get('limit') ?? 2000)
    return r.fulfill({
      json: envelope({
        timeframe: '1h',
        items: raw.slice(offset, offset + limit),
        has_more: offset + limit < count,
        next_cursor: offset + limit < count ? String(offset + limit) : null,
      }),
    })
  })
  await page.route(/\/api\/replays\/[^/?]+\/trades(?:\?.*)?$/, (r) => {
    const p = Number(new URL(r.request().url()).searchParams.get('page') ?? 1)
    return r.fulfill({
      json: envelope({
        items: Array.from({ length: 100 }, (_, i) => ({
          ...replayTrades[0],
          id: `trade-${(p - 1) * 100 + i}`,
          sequence: (p - 1) * 100 + i + 1,
          fills: [],
        })),
        page: p,
        size: 100,
        total: 10000,
        total_pages: 100,
      }),
    })
  })
  await page.goto(`/conversations/${conversationId}`)
  await page.evaluate(() => {
    const durations: number[] = []
    new PerformanceObserver((l) =>
      l.getEntries().forEach((e) => durations.push(e.duration)),
    ).observe({ type: 'longtask', buffered: false })
    Object.assign(window, { replayLongTasks: durations })
  })
  const start = Date.now()
  await page.locator('.message-list-shell .message-card').click()
  await expect(page.locator('.replay-chart canvas').first()).toBeVisible()
  const firstChartMs = Date.now() - start
  await expect(page.getByRole('button', { name: '从头播放', exact: true })).toBeEnabled({
    timeout: 60_000,
  })
  if (info.project.name !== 'desktop') await page.getByRole('tab', { name: /洞察/ }).click()
  await expect(
    page.getByRole('button', {
      name: info.project.name === 'desktop' ? '结果定位' : '最大盈利交易',
      exact: true,
    }),
  ).toBeVisible({
    timeout: 60_000,
  })
  await page.locator('.replay-timeline input').press('End')
  await expect(page.getByRole('button', { name: '从头播放', exact: true })).toBeEnabled()
  if (info.project.name !== 'desktop') await page.getByRole('tab', { name: /交易/ }).click()
  await expect(
    page.locator(info.project.name === 'desktop' ? '.replay-trade-card' : '.replay-trade-row'),
  ).toHaveCount(20)
  const canvas = page.locator('.replay-chart')
  await canvas.hover()
  const measured = await page.evaluate(async () => {
    const frames: number[] = []
    await new Promise<void>((r) => {
      const end = performance.now() + 1000
      let last = performance.now()
      function frame(now: number) {
        frames.push(now - last)
        last = now
        if (now < end) requestAnimationFrame(frame)
        else r()
      }
      requestAnimationFrame(frame)
    })
    const w = window as unknown as {
      replayLongTasks: number[]
      performance: { memory?: { usedJSHeapSize: number } }
    }
    return {
      frameCount: frames.length,
      maxLongTaskMs: Math.max(0, ...w.replayLongTasks),
      longTaskCount: w.replayLongTasks.length,
      heapMB: w.performance.memory?.usedJSHeapSize
        ? Math.round(w.performance.memory.usedJSHeapSize / 1024 / 1024)
        : null,
    }
  })
  await writeFile(
    info.outputPath('performance.json'),
    JSON.stringify(
      { candles: count, trades: 10000, firstChartMs, totalMs: Date.now() - start, ...measured },
      null,
      2,
    ),
  )
  await info.attach('replay-performance', {
    body: JSON.stringify(
      { candles: count, trades: 10000, firstChartMs, totalMs: Date.now() - start, ...measured },
      null,
      2,
    ),
    contentType: 'application/json',
  })
  // Pan through more than the 500-bar SDK buffer, then select a visible candle.
  // Desktop chart navigation must not move the historical cutoff.
  await canvas.scrollIntoViewIfNeeded()
  const bounds = (await canvas.boundingBox())!
  const plotWidth = bounds.width - 70
  for (let i = 0; i < 28; i++) {
    await page.mouse.move(bounds.x + plotWidth * 0.15, bounds.y + 90)
    await page.mouse.down()
    await page.mouse.move(bounds.x + plotWidth * 0.85, bounds.y + 90, { steps: 12 })
    await page.mouse.up()
  }
  await page.mouse.click(bounds.x + plotWidth * 0.5, bounds.y + 100)
  if (info.project.name === 'desktop') {
    await expect(page.locator('.replay-timeline input')).toHaveValue(
      String(Date.parse(iso(count - 1)) / 1000),
    )
    await expect
      .poll(
        async () =>
          Date.parse((await page.locator('.replay-quote time').getAttribute('datetime')) ?? '') /
          1000,
      )
      .toBeLessThan(Date.parse(iso(count - 600)) / 1000)
  } else {
    await expect
      .poll(async () => Number(await page.locator('.replay-timeline input').inputValue()))
      .toBeLessThan(Date.parse(iso(count - 600)) / 1000)
  }
  await page.locator('.replay-timeline input').press('Home')
  await expect(page.locator('.replay-timeline input')).toHaveValue(
    String(Date.parse(iso(0)) / 1000),
  )
  await page
    .locator('.asset-detail-panel')
    .getByRole('button', { name: '关闭', exact: true })
    .click()
  await expect(page.locator('.replay-chart canvas')).toHaveCount(0)
})

test('one historical cutoff controls candles, timeline, trades and insights while paused', async ({
  page,
  isMobile,
}) => {
  const { iso } = await import('./replay-fixtures')
  const time = (n: number) => String(Date.parse(iso(n)) / 1000)
  await stubReplay(page)
  await open(page)
  const panel = page.locator('.asset-detail-panel'),
    slider = panel.locator('.replay-timeline input'),
    chart = panel.locator('.replay-chart')
  await expect(slider).toHaveValue(time(199))
  await expect(chart).toHaveAttribute('data-visible-end', time(199))
  await expect(panel.getByText('最终结果', { exact: true })).toBeVisible()
  await expect(panel.locator('.replay-time-track')).toHaveCount(1)
  await expect(panel.locator('.replay-track-marker')).toHaveCount(isMobile ? 3 : 5)
  await expect(panel.locator('.replay-track-marker .is-buy')).toHaveCount(2)
  await expect(panel.locator('.replay-track-marker .is-sell')).toHaveCount(2)
  await expect(panel.locator('.replay-track-marker .is-insight')).toHaveCount(1)
  await expect(panel.locator('.replay-ohlc')).toContainText('成交量')
  await expect(panel.getByRole('button', { name: '成交量', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(panel.locator('.replay-ohlc dt')).toHaveText([
    ...(isMobile ? ['开盘', '最高', '最低', '收盘'] : ['开', '高', '低', '收']),
    '涨跌额',
    '涨跌幅',
    '成交量',
  ])
  await expect(panel.locator('.replay-quote-date time')).not.toContainText('UTC')
  await expect(panel.locator('.replay-ohlc dd').last()).toHaveText(isMobile ? '219.00' : '219')
  await expect(panel.locator('.replay-ohlc dd').first()).not.toHaveText('—')
  await panel.locator('.replay-timeline').scrollIntoViewIfNeeded()
  await page.screenshot({ path: test.info().outputPath('backtest-timeline.png') })
  await slider.press('Home')
  await expect(chart).toHaveAttribute('data-visible-end', time(0))
  await expect(panel.locator('.replay-track-marker')).toHaveCount(0)
  if (isMobile) await expect(panel.getByRole('tab', { name: /洞察/ })).toContainText('0')
  if (isMobile) {
    await expect(panel.locator('.replay-current-state')).toContainText('该 K 线收盘后')
    await expect(panel.locator('.replay-current-state')).toContainText('截至此时收益')
  } else {
    await expect(panel.locator('.replay-current-state')).toHaveCount(0)
    await expect(panel.locator('.replay-result-label')).toHaveText('截至此时')
    await expect(panel.locator('.replay-summary-metrics dd').nth(2)).toHaveText('0')
  }
  if (isMobile) await panel.getByRole('tab', { name: /交易记录/ }).click()
  await expect(panel.getByText('截至此时暂无交易', { exact: true })).toBeVisible()
  // Native range keyboard seeks actual bars; all surfaces share the same cutoff.
  for (let i = 0; i < 20; i++) await slider.press('ArrowRight')
  await expect(chart).toHaveAttribute('data-visible-end', time(20))
  await expect(panel.locator(isMobile ? '.replay-trade-row' : '.replay-trade-card')).toHaveCount(1)
  await expect(panel.locator(isMobile ? '.replay-trade-row' : '.replay-trade-card')).toContainText(
    '未平仓',
  )
  await expect(
    panel.locator(isMobile ? '.replay-trade-row' : '.replay-trade-card'),
  ).not.toContainText('+87')
  await panel.locator(isMobile ? '.replay-trade-row' : '.replay-trade-card').click()
  await expect(slider).toHaveValue(time(20))
  const tradeDetail = isMobile ? panel : await openTradeDetails(page, 't-1')
  if (isMobile) await panel.getByRole('button', { name: '成交明细 · 1 次', exact: true }).click()
  await expect(tradeDetail.locator('.replay-fill-row')).toHaveCount(1)
  await expect(tradeDetail).not.toContainText('96,100')
  if (!isMobile) await closeTradeDetails(page)
  await chart.scrollIntoViewIfNeeded()
  const box = (await chart.boundingBox())!
  // Moving the viewport into the future never adds hidden candles.
  await page.mouse.move(box.x + box.width * 0.7, box.y + 100)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.25, box.y + 100, { steps: 10 })
  await page.mouse.up()
  await expect(chart).toHaveAttribute('data-visible-end', time(20))
  await panel.getByRole('button', { name: '播放', exact: true }).click()
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(Number(time(20)))
  await panel.getByRole('button', { name: '暂停', exact: true }).click()
  const pausedAt = await slider.inputValue()
  await expect(chart).toHaveAttribute('data-visible-end', pausedAt)
  await expect(panel.getByRole('tab')).toHaveCount(isMobile ? 2 : 0)
  if (isMobile) await expect(panel.getByRole('tab', { name: /洞察/ })).toContainText('0')
  await expect(
    panel.locator(isMobile ? '.replay-speed option:checked' : '.replay-speed'),
  ).toContainText(isMobile ? '根/秒' : '1x')
  await slider.press('End')
  await expect(chart).toHaveAttribute('data-visible-end', time(199))
  await expect(panel.locator(isMobile ? '.replay-trade-row' : '.replay-trade-card')).toHaveCount(2)
  await expect(
    isMobile
      ? panel.locator('.replay-trade-row').filter({ hasText: '#1' })
      : panel.locator('[data-trade-id="t-1"]'),
  ).toContainText('+87')
  if (isMobile) await expect(panel.getByRole('tab', { name: /洞察/ })).toContainText('3')
  await expect(panel.locator('.replay-track-marker .is-insight')).toHaveCount(1)
  if (isMobile) await panel.getByRole('button', { name: '最大盈利交易', exact: true }).click()
  else {
    if (isMobile) await panel.getByRole('tab', { name: /交易记录/ }).click()
    await panel.locator('[data-trade-id="t-1"]').click()
  }
  await expect(slider).toHaveValue(time(isMobile ? 50 : 199))
  if (isMobile) await expect(panel.locator('.replay-trade-detail')).toBeVisible()
  else await expect(panel.locator('[data-trade-id="t-1"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(panel.locator('.replay-evidence-shade')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('backtest-tags-and-trade.png') })
  await slider.press('Home')
  await expect(panel.locator('.replay-trade-detail')).toBeHidden()
  await expect(panel.locator('.replay-evidence-shade')).toBeHidden()
})

test('mobile timeline event choices navigate without selecting evidence', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Grouped touch timeline')
  const { iso } = await import('./replay-fixtures')
  await stubReplay(page)
  await open(page)
  const panel = page.locator('.asset-detail-panel')
  const slider = panel.locator('.replay-timeline input')
  await panel.getByRole('button', { name: '最大盈利交易', exact: true }).click()
  await expect(panel.locator('.replay-evidence-shade')).toBeVisible()
  await panel.locator('.replay-track-marker').first().click()
  await expect(slider).toHaveValue(String(Date.parse(iso(20)) / 1000))
  await expect(panel.locator('.replay-evidence-shade')).toBeHidden()
  await slider.press('End')
  await panel.locator('.replay-track-marker').last().click()
  const picker = panel.locator('.replay-event-picker')
  await expect(picker).toBeVisible()
  await picker.getByRole('button', { name: /反向信号触发止损/ }).click()
  await expect(slider).toHaveValue(String(Date.parse(iso(100)) / 1000))
  await expect(panel.locator('.replay-evidence-shade')).toBeHidden()
  await expect(picker).toBeHidden()
})

test('timeline controls cutoff while desktop buy tags stay local', async ({ page, isMobile }) => {
  const { iso } = await import('./replay-fixtures')
  await stubReplay(page)
  await open(page)
  const panel = page.locator('.asset-detail-panel'),
    slider = panel.locator('.replay-timeline input')
  if (isMobile) await panel.getByRole('button', { name: '最大盈利交易', exact: true }).click()
  else {
    await panel.locator('[data-event-id="fill:f-2"]').click()
  }
  await expect(slider).toHaveValue(String(Date.parse(iso(50)) / 1000))
  const chart = panel.locator('.replay-chart')
  await chart.scrollIntoViewIfNeeded()
  // Read the actual primitive's solid buy-color pixels, so the click exercises
  // Canvas rendering, hit testing and the chart-to-controller event bridge.
  const buyTag = async () =>
    chart.evaluate((host) => {
      const color = getComputedStyle(host).getPropertyValue('--color-chart-buy').trim()
      const swatch = document.createElement('canvas').getContext('2d')!
      swatch.fillStyle = color
      swatch.fillRect(0, 0, 1, 1)
      const rgb = [...swatch.getImageData(0, 0, 1, 1).data].slice(0, 3)
      for (const canvas of host.querySelectorAll('canvas')) {
        if (!canvas.width || !canvas.height) continue
        const ctx = canvas.getContext('2d')!,
          data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        const box = canvas.getBoundingClientRect(),
          ratio = canvas.width / box.width
        for (let y = 0; y < canvas.height; y++) {
          let start = -1
          for (let x = 0; x < canvas.width; x++) {
            const at = (y * canvas.width + x) * 4
            const match =
              rgb.every((value, index) => data[at + index] === value) && data[at + 3]! > 240
            if (match && start < 0) start = x
            if ((!match || x === canvas.width - 1) && start >= 0) {
              if (x - start > 14 * ratio)
                return { x: box.x + (start + x) / 2 / ratio, y: box.y + y / ratio + 4 }
              start = -1
            }
          }
        }
      }
      return null
    })
  await expect.poll(buyTag).not.toBeNull()
  if (!isMobile) {
    // Place this fixture's buy tag on the left to exercise right-hand hover placement.
    const bounds = (await chart.boundingBox())!
    const tag = (await buyTag())!
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await page.mouse.down()
    await page.mouse.move(bounds.x + bounds.width / 2 - 8, bounds.y + bounds.height / 2)
    await page.mouse.move(
      bounds.x + bounds.width / 2 + bounds.x + bounds.width * 0.3 - tag.x,
      bounds.y + bounds.height / 2,
      { steps: 12 },
    )
    await page.mouse.up()
    await expect.poll(async () => (await buyTag())!.x).toBeLessThan(bounds.x + bounds.width * 0.4)
  }
  const tag = (await buyTag())!
  if (isMobile) await page.mouse.click(tag.x, tag.y)
  else await page.mouse.move(tag.x, tag.y)
  if (!isMobile) {
    await expect(slider).toHaveValue(String(Date.parse(iso(50)) / 1000))
    const tooltip = panel.getByRole('tooltip')
    await expect(tooltip).toContainText('订单明细')
    await expect(tooltip).toContainText('买入')
    await expect(tooltip).toContainText('@')
    await expect(tooltip.getByRole('button')).toHaveCount(0)
    const initialTooltip = (await tooltip.boundingBox())!
    if ((await tooltip.getAttribute('data-placement')) === 'right-bottom') {
      expect(initialTooltip.x).toBeGreaterThan(tag.x)
      // Pixel hit is 4px inside the tag: its top aligns with the popup top.
      expect(Math.abs(initialTooltip.y - (tag.y - 4))).toBeLessThan(3)
    } else {
      expect(initialTooltip.x).toBeLessThan(tag.x)
      expect(initialTooltip.x + initialTooltip.width).toBeGreaterThan(tag.x)
    }
    await expect(tooltip).toHaveAttribute('data-placement', /right-(top|bottom)/)
    await page.mouse.move(initialTooltip.x + 12, initialTooltip.y + 12, { steps: 8 })
    await expect(tooltip).toBeVisible()
    // The card must remain open beyond the tag-to-card grace period.
    await page.waitForTimeout(350)
    await expect(tooltip).toBeVisible()
    await tooltip.click()
    await expect(slider).toHaveValue(String(Date.parse(iso(50)) / 1000))
    const bounds = (await chart.boundingBox())!
    await page.mouse.move(bounds.x + 40, bounds.y + bounds.height / 2)
    await expect(tooltip).toHaveCount(0)
    await page.mouse.down()
    await page.mouse.move(bounds.x + 48, bounds.y + bounds.height / 2)
    await page.mouse.move(
      bounds.x + 48 + (bounds.x + bounds.width - 120 - tag.x),
      bounds.y + bounds.height / 2,
      { steps: 12 },
    )
    await page.mouse.up()
    await expect.poll(buyTag).not.toBeNull()
    const rightTag = (await buyTag())!
    await page.mouse.move(rightTag.x, rightTag.y)
    await expect(tooltip).toBeVisible()
    await expect(tooltip).toHaveAttribute('data-placement', /left-(top|bottom)/)
    expect((await tooltip.boundingBox())!.x).toBeLessThan(rightTag.x)
    await page.screenshot({ path: test.info().outputPath('trade-tag-hover.png') })
    await page.mouse.move(bounds.x - 10, bounds.y)
    await expect(tooltip).toHaveCount(0)
    await expect(chart).toHaveAttribute('data-visible-end', String(Date.parse(iso(50)) / 1000))
    await slider.press('Home')
    for (let i = 0; i < 20; i++) await slider.press('ArrowRight')
    await panel.locator('.replay-trade-card').click()
    const dialog = await openTradeDetails(page, 't-1')
    await dialog.locator('.replay-fill-row').click()
    await expect(dialog).toBeHidden()
  }
  await expect(slider).toHaveValue(String(Date.parse(iso(20)) / 1000))
  await expect(panel.locator('.replay-fill-row')).toHaveCount(isMobile ? 1 : 0)
  await expect(panel.locator(isMobile ? '.replay-trade-row' : '.replay-trade-card')).toContainText(
    '未平仓',
  )
  if (isMobile)
    await expect(panel.locator('.replay-fill-row')).toHaveAttribute('aria-expanded', 'true')
  if (isMobile) await panel.locator('.replay-speed').selectOption('4')
  else {
    await panel.locator('.replay-speed').click()
    await page.getByRole('menuitemcheckbox', { name: '0.5x', exact: true }).click()
  }
  await panel.getByRole('button', { name: '查看策略', exact: true }).click()
  await expect(panel.getByText('历史设计', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '返回回测', exact: true }).click()
  await expect(slider).toHaveValue(String(Date.parse(iso(20)) / 1000))
  if (isMobile) await expect(panel.locator('.replay-speed')).toHaveValue('4')
  else await expect(panel.locator('.replay-speed')).toContainText('0.5x')
  await expect(panel.getByRole('button', { name: '播放', exact: true })).toBeVisible()
  await expect(panel.locator('.replay-chart')).toHaveAttribute(
    'data-visible-end',
    String(Date.parse(iso(20)) / 1000),
  )
  await panel.getByRole('button', { name: '定位到结束', exact: true }).click()
  const marker = panel.locator('.replay-track-marker').filter({ has: page.locator('.is-insight') })
  await marker.click()
  if (isMobile) {
    await expect(panel.locator('.replay-event-picker')).toContainText('反向信号触发止损')
    await panel
      .locator('.replay-event-picker')
      .getByRole('button', { name: /反向信号触发止损/ })
      .click()
  } else await expect(panel.locator('.replay-event-picker')).toHaveCount(0)
  await expect(slider).toHaveValue(String(Date.parse(iso(100)) / 1000))
  if (isMobile) {
    await expect(panel.locator('.replay-insight-content')).toBeHidden()
    await expect(panel.getByRole('tab', { name: /洞察/ })).toContainText('1')
  } else {
    await marker.hover()
    await expect(page.locator('.replay-insight-hover-surface')).toContainText(
      '这次空头交易出现亏损',
    )
  }
  await page.mouse.move(10, 10)
  if (!isMobile) await expect(page.locator('.replay-insight-hover-surface')).toBeHidden()
  await slider.scrollIntoViewIfNeeded()
  const track = (await slider.boundingBox())!
  await page.mouse.click(track.x + 10 + (track.width - 20) * 0.15, track.y + 22)
  await expect
    .poll(async () => Number(await slider.inputValue()))
    .toBeLessThan(Date.parse(iso(35)) / 1000)
  await expect(panel.locator('.replay-chart')).toHaveAttribute(
    'data-visible-end',
    await slider.inputValue(),
  )
  await expect(panel.locator('.replay-track-marker .is-insight')).toHaveCount(0)
  await expect(panel.locator('.replay-insight-content')).toBeHidden()
})

test('desktop quote overlays the full canvas with price headroom', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop presentation only')
  await stubReplay(page)
  await open(page)
  const panel = page.locator('.asset-detail-panel')
  for (const size of ['panel', 'fullscreen']) {
    if (size === 'fullscreen')
      await panel.getByRole('button', { name: '全屏', exact: true }).click()
    const plot = panel.locator('.replay-chart')
    await plot.scrollIntoViewIfNeeded()
    const chart = (await plot.boundingBox())!
    const quote = (await panel.locator('.replay-quote').boundingBox())!
    const block = (await panel.locator('.replay-chart-block').boundingBox())!
    const toolbar = (await panel.locator('.replay-chart-toolbar').boundingBox())!
    expect(quote.y).toBeGreaterThanOrEqual(block.y)
    expect(quote.y + quote.height).toBeLessThan(chart.y + chart.height)
    expect(quote.height).toBeLessThan(25)
    const time = (await panel.locator('.replay-progress-time').boundingBox())!
    const actions = (await panel.locator('.replay-playback-actions').boundingBox())!
    expect(time.x + time.width).toBeLessThanOrEqual(actions.x)
    await panel.locator('.replay-speed').click()
    await expect(page.getByRole('menuitemcheckbox')).toHaveText(['0.5x', '1x', '2x', '5x', '10x'])
    await page.keyboard.press('Escape')
    await expect(panel.locator('.replay-speed')).toContainText('1x')
    const markers = await panel.locator('.replay-track-marker').evaluateAll((elements) =>
      elements.map((el) => ({
        top: (el as HTMLElement).style.top || getComputedStyle(el).top,
        type: el.querySelector('span')!.className,
        dots: el.querySelectorAll('span').length,
      })),
    )
    expect(markers.every((m) => m.dots === 1)).toBe(true)
    for (const kind of ['buy', 'sell', 'insight']) {
      expect(
        new Set(markers.filter((m) => m.type.includes(`is-${kind}`)).map((m) => m.top)).size,
      ).toBe(1)
    }
    expect(Math.abs(block.height - chart.height)).toBeLessThan(2)
    expect(block.height).toBe(size === 'panel' ? 340 : 520)
    const canvas = (await plot.locator('canvas').first().boundingBox())!
    expect(canvas.y).toBe(block.y)
    expect(Math.abs(toolbar.y + toolbar.height - block.y)).toBeLessThan(2)
    await page.screenshot({ path: test.info().outputPath(`chart-overlay-${size}.png`) })
  }
})

test('replay title options keep matching metadata and newest-first order after selection', async ({
  page,
}) => {
  const { replay } = await import('./strategy-fixtures')
  const { replayDetail } = await import('./replay-fixtures')
  const { envelope } = await import('./auth-fixtures')
  await stubReplay(page)
  const rows = [
    { ...replay('older', 'node-old', '第一次验证'), created_at: '2026-09-01T00:00:00Z' },
    { ...replay('replay-1', 'node-old', '第二次验证'), created_at: '2026-09-02T00:00:00Z' },
    { ...replay('newest', 'node-old', '第三次验证'), created_at: '2026-09-03T00:00:00Z' },
  ]
  await page.route(/\/api\/conversations\/[^/?]+\/replays(?:\?.*)?$/, (route) =>
    route.fulfill({ json: envelope({ items: rows, page: 1, total_pages: 1, total: 3, size: 20 }) }),
  )
  await page.route(/\/api\/replays\/[^/?]+$/, (route) => {
    const row = rows.find((row) =>
      route
        .request()
        .url()
        .endsWith('/' + row.id),
    )!
    return route.fulfill({ json: envelope({ ...replayDetail, id: row.id, name: row.name }) })
  })
  await open(page)
  const trigger = page.getByRole('combobox', { name: '切换回测' })
  for (const selected of ['第二次验证', '第一次验证', '第三次验证']) {
    await expect(trigger).toContainText(selected)
    await trigger.click()
    const options = page.getByRole('option')
    await expect(options).toHaveCount(3)
    await expect(options.locator('.strategy-version-option-label')).toHaveText([
      '第三次验证',
      '第二次验证',
      '第一次验证',
    ])
    await expect(options.locator('.strategy-version-option-description')).toHaveText(
      Array(3).fill('BTC/USDT · 1h · 2025-01-01'),
    )
    await expect(page.getByRole('option', { name: selected })).toHaveAttribute(
      'data-state',
      'checked',
    )
    const heights = await options.evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().height),
    )
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1)
    if (selected === '第三次验证') {
      await page.screenshot({ path: test.info().outputPath('replay-title-consistent-options.png') })
      await page.keyboard.press('Escape')
    } else {
      await page
        .getByRole('option', { name: selected === '第二次验证' ? '第一次验证' : '第三次验证' })
        .click()
    }
  }
})

test('desktop result menu respects cutoff and compact speed menu has no pointer focus ring', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop only')
  await stubReplay(page)
  await open(page)
  const panel = page.locator('.asset-detail-panel'),
    slider = panel.locator('.replay-timeline input'),
    chart = panel.locator('.replay-chart')
  const cutoff = await slider.inputValue()
  const before = (await chart.boundingBox())!
  await panel.getByRole('button', { name: '结果定位' }).click()
  await page.getByRole('menuitem', { name: '最大盈利交易', exact: true }).click()
  await expect(slider).toHaveValue(cutoff)
  await expect(chart).toHaveAttribute('data-visible-end', cutoff)
  expect((await chart.boundingBox())!.y).toBe(before.y)
  await panel.locator('.replay-speed').click()
  await expect(page.getByRole('menuitemcheckbox', { name: '1x', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect
    .poll(() =>
      page
        .locator('.replay-compact-menu[data-state="open"]')
        .evaluate((el) => getComputedStyle(el).opacity),
    )
    .toBe('1')
  await expect
    .poll(() => panel.locator('.replay-speed').evaluate((el) => getComputedStyle(el).outlineStyle))
    .toBe('none')
  await page.screenshot({ path: test.info().outputPath('compact-speed-menu.png') })
  await page.getByRole('menuitemcheckbox', { name: '5x', exact: true }).click()
  await expect(panel.locator('.replay-speed')).toContainText('5x')
  await slider.press('Home')
  expect((await chart.boundingBox())!.y).toBe(before.y)
  await panel.getByRole('button', { name: '结果定位' }).click()
  await expect(page.getByRole('menuitem', { name: '最大盈利交易', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
})

test('all desktop result shortcuts inspect evidence like trade cards without pausing or zooming', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop result menu')
  const { candles, replayDetail, replayInsights, iso } = await import('./replay-fixtures')
  const { envelope } = await import('./auth-fixtures')
  await stubReplay(page)
  // A known equity peak/trough makes maximum drawdown a genuine third result.
  const bars = candles().map((bar, i) => ({
    ...bar,
    state: { ...bar.state!, equity: String(i === 30 ? 12000 : i === 70 ? 9600 : 11000) },
  }))
  await page.route(/\/api\/replays\/[^/?]+$/, (route) =>
    route.fulfill({
      json: envelope({
        ...replayDetail,
        result: { ...replayDetail.result, max_drawdown_rate: '0.2' },
      }),
    }),
  )
  await page.route(/\/api\/replays\/[^/?]+\/candles(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({ timeframe: '1h', items: bars, has_more: false, next_cursor: null }),
    }),
  )
  await page.route(/\/api\/replays\/[^/?]+\/insights(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({
        items: Array.from({ length: 10 }, (_, i) => ({
          ...replayInsights[1],
          id: `scale-${i}`,
          candle_id: `c-${i * 20}`,
          evidence: null,
        })),
      }),
    }),
  )
  await open(page)
  const panel = page.locator('.asset-detail-panel')
  const chart = panel.locator('.replay-chart')
  const slider = panel.locator('.replay-timeline input')
  const shade = panel.locator('.replay-evidence-shade')
  await slider.evaluate(
    (input, value) => {
      ;(input as HTMLInputElement).value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    },
    String(Date.parse(iso(170)) / 1000),
  )
  await expect(chart).toHaveAttribute('data-visible-end', String(Date.parse(iso(170)) / 1000))
  const spacing = async () => {
    const dots = await insightDots(chart)
    expect(dots.length).toBeGreaterThan(1)
    const gaps = dots
      .slice(1)
      .map((dot, i) => dot.x - dots[i]!.x)
      .sort((a, b) => a - b)
    return gaps[Math.floor(gaps.length / 2)]!
  }
  await chart.scrollIntoViewIfNeeded()
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 3; i++) {
    const before = await spacing()
    await page.mouse.wheel(0, -100)
    await expect.poll(spacing).toBeGreaterThan(before + 2)
  }
  const customSpacing = await spacing()
  const clockStart = Date.now()
  await page.clock.install({ time: clockStart })
  await page.clock.pauseAt(clockStart + 60_000)
  await panel.getByRole('button', { name: '播放', exact: true }).click()
  for (const [label, tradeId] of [
    ['最大盈利交易', 't-1'],
    ['最大亏损交易', 't-2'],
    ['最大回撤区间', null],
  ] as const) {
    await page.mouse.move(10, 10)
    const previousAxis = await timeAxisImage(chart)
    const cutoff = await slider.inputValue()
    await panel.getByRole('button', { name: '结果定位', exact: true }).click()
    await page.getByRole('menuitem', { name: label, exact: true }).click()
    await expect(slider).toHaveValue(cutoff)
    await expect(panel.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
    await page.mouse.move(10, 10)
    await page.clock.runFor(50)
    await expect(shade).toBeVisible()
    expect(Math.abs((await spacing()) - customSpacing)).toBeLessThan(1.5)
    const inspectedAxis = await timeAxisImage(chart)
    if (tradeId) {
      await expect(panel.locator(`[data-trade-id="${tradeId}"]`)).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      const plot = (await chart.locator('canvas').first().boundingBox())!
      const region = (await shade.boundingBox())!
      expect(Math.abs((region.x + region.width - plot.x) / plot.width - 0.7)).toBeLessThan(0.01)
      // The corresponding card must keep exactly the shortcut's selection and view.
      await panel.locator(`[data-trade-id="${tradeId}"]`).click()
      await page.clock.runFor(50)
      expect(await timeAxisImage(chart)).toBe(inspectedAxis)
    } else {
      // The drawdown endpoint is already visible: select its range without moving.
      expect(inspectedAxis).toBe(previousAxis)
      await expect(panel.locator('[data-trade-id][aria-pressed="true"]')).toHaveCount(0)
      const selection = panel.locator('.replay-track-evidence')
      const track = (await panel.locator('.replay-timeline input').boundingBox())!
      const region = (await selection.boundingBox())!
      expect(region.width / track.width).toBeCloseTo(40 / 199, 1)
      await chart.screenshot({ path: test.info().outputPath('drawdown-preserves-user-view.png') })
    }
    // Inspection stays in place while the replay clock continues advancing.
    const beforePlayback = Number(await slider.inputValue())
    await page.clock.runFor(250)
    expect(Number(await slider.inputValue())).toBeGreaterThan(beforePlayback)
    expect(await timeAxisImage(chart)).toBe(inspectedAxis)
    await expect(panel.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  }
})

test('desktop headline metrics follow cutoff while metadata and details stay compact', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop only')
  await stubReplay(page)
  await open(page)
  const panel = page.locator('.asset-detail-panel'),
    slider = panel.locator('.replay-timeline input'),
    values = panel.locator('.replay-summary-metrics dd')
  await expect(panel.locator('.replay-result-label')).toHaveText('最终结果')
  await expect(values).toHaveCount(6)
  await expect(values.last()).toHaveText('空仓')
  await expect(values.last()).toHaveCSS('font-weight', '400')
  await expect(panel.locator('.replay-primary-action')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  )
  await expect(panel.locator('.replay-metrics-link')).toHaveCSS('padding-right', '0px')
  // Measure all edges in one frame; the panel may still be finishing its entrance.
  await expect
    .poll(() =>
      panel.evaluate((root) => {
        const right = (selector: string) =>
          root.querySelector(selector)!.getBoundingClientRect().right
        return Math.max(
          Math.abs(
            right('.replay-summary-metrics > div:last-child') - right('.replay-chart-region'),
          ),
          Math.abs(right('.replay-metrics-link') - right('.replay-chart-region')),
        )
      }),
    )
    .toBeLessThan(2)
  await expect(panel.locator('.replay-result-label .iconify')).toHaveCount(0)
  await expect(panel.locator('.replay-result-label')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  )
  const finalValues = await values.allTextContents()
  const meta = (await panel.locator('.replay-meta').boundingBox())!,
    date = (await panel.locator('.replay-date-row').boundingBox())!
  expect(Math.abs(meta.y - date.y)).toBeLessThan(12)
  await expect(panel.locator('.replay-summary-metrics button')).toHaveCount(0)
  await slider.press('Home')
  for (let i = 0; i < 20; i++) await slider.press('ArrowRight')
  await expect(values.last()).toHaveText('持有多仓')
  for (let i = 20; i < 50; i++) await slider.press('ArrowRight')
  await expect(values.last()).toHaveText('空仓')
  await expect(panel.locator('.replay-result-label')).toHaveClass(/is-historical/)
  await expect(values.nth(2)).toHaveText('1')
  await expect(values.nth(3)).toHaveText('100.00%')
  await expect(values.nth(4)).toHaveText('—')
  await expect(panel.locator('.replay-current-state')).toHaveCount(0)
  await panel.getByRole('button', { name: '查看详情', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('空仓', { exact: true })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('historical-metrics-detail.png') })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.locator('[data-slot=overlay]')).toHaveCount(0)
  await slider.press('End')
  await expect(panel.locator('.replay-result-label')).toHaveText('最终结果')
  await expect(values).toHaveText(finalValues)
  await page.screenshot({ path: test.info().outputPath('compact-summary.png') })
})

test('desktop playback and timeline pointer interaction never leaves a gold focus frame', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop only')
  await stubReplay(page)
  await open(page)
  const panel = page.locator('.asset-detail-panel'),
    slider = panel.locator('.replay-timeline input'),
    play = panel.locator('.replay-primary-action')
  await slider.click({ position: { x: 80, y: 20 } })
  await expect(slider).toHaveCSS('outline-style', 'none')
  await slider.hover()
  await expect(slider).toHaveCSS('outline-style', 'none')
  await play.click()
  await expect(play).toHaveCSS('outline-style', 'none')
  await play.click()
  await expect(play).toHaveCSS('outline-style', 'none')
  await slider.focus()
  await slider.press('ArrowRight')
  await expect(slider).toHaveCSS('outline-style', 'none')
  await slider.click({ position: { x: 100, y: 20 } })
  await expect(slider).toHaveCSS('outline-style', 'none')
})

test('desktop Space toggles playback after timeline seek without moving focus or double toggling', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop only')
  await stubReplay(page)
  await open(page)
  const panel = page.locator('.asset-detail-panel'),
    slider = panel.locator('.replay-timeline input'),
    play = panel.locator('.replay-primary-action')
  await slider.click({ position: { x: 80, y: 20 } })
  const before = Number(await slider.inputValue())
  await page.keyboard.press('Space')
  await expect(play).toHaveAttribute('aria-label', '暂停')
  await expect(slider).toBeFocused()
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(before)
  await page.keyboard.press('Space')
  await expect(play).toHaveAttribute('aria-label', '播放')
  await expect(slider).toHaveCSS('outline-style', 'none')
  await page.keyboard.down('Space')
  await expect(play).toHaveAttribute('aria-label', '暂停')
  await page.keyboard.down('Space')
  await expect(play).toHaveAttribute('aria-label', '暂停')
  await page.keyboard.up('Space')
  await play.click()
  await expect(play).toHaveAttribute('aria-label', '播放')
  await page.keyboard.press('Space')
  await expect(play).toHaveAttribute('aria-label', '暂停')
  await page.keyboard.press('Space')
  await expect(play).toHaveAttribute('aria-label', '播放')
  await expect(play).toHaveCSS('outline-style', 'none')
  await panel.locator('.replay-speed').click()
  await page.keyboard.press('Space')
  await expect(play).toHaveAttribute('aria-label', '播放')
})

test('desktop metric sizes and playback widths stay consistent', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop only')
  await stubReplay(page)
  await open(page)
  const panel = page.locator('.asset-detail-panel'),
    speed = panel.locator('.replay-speed'),
    values = panel.locator('.replay-summary-metrics dd')
  const play = panel.locator('.replay-primary-action')
  await expect(play).toHaveCSS('border-top-width', '0px')
  await expect(play).toHaveCSS('width', '32px')
  await expect(play).toHaveCSS('height', '32px')
  await expect(play).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(play.locator('.replay-play-label')).toBeHidden()
  for (const fullscreen of [false, true]) {
    if (fullscreen) await panel.getByRole('button', { name: '全屏', exact: true }).click()
    const firstSize = await values.first().evaluate((el) => getComputedStyle(el).fontSize)
    await expect(values.nth(1)).toHaveCSS('font-size', firstSize)
    await speed.click({ trial: true })
    const before = (await speed.boundingBox())!
    await speed.click()
    await page.getByRole('menuitemcheckbox', { name: '10x', exact: true }).click()
    const after = (await speed.boundingBox())!
    expect(after.width).toBe(before.width)
    expect(Math.abs(after.x - before.x)).toBeLessThan(1)
    await expect(page.locator('.replay-compact-menu')).toHaveCount(0)
    await page.screenshot({
      path: test.info().outputPath(`candle-colors-${fullscreen ? 'full' : 'panel'}.png`),
    })
    await speed.click()
    await page.getByRole('menuitemcheckbox', { name: '0.5x', exact: true }).click()
    await expect(speed.locator('.replay-speed-value')).toHaveCSS('text-align', 'right')
    const text = (await speed.locator('.replay-speed-value').boundingBox())!
    const arrow = (await speed.locator('.iconify').boundingBox())!
    expect(Math.abs(arrow.x - text.x - text.width - 4)).toBeLessThan(1)
    const icons = await panel
      .locator(
        '.replay-playback-actions > .detail-icon-button > .iconify, .replay-primary-action > .iconify',
      )
      .evaluateAll((elements) =>
        elements.map((el) => {
          const box = el.getBoundingClientRect()
          return { width: box.width, height: box.height, centerY: box.y + box.height / 2 }
        }),
      )
    expect(icons).toHaveLength(3)
    expect(icons.every((icon) => icon.width === 18 && icon.height === 18)).toBe(true)
    expect(
      Math.max(...icons.map((icon) => icon.centerY)) -
        Math.min(...icons.map((icon) => icon.centerY)),
    ).toBeLessThan(1)
    await expect(page.locator('.replay-compact-menu')).toHaveCount(0)
    await panel.locator('.replay-playback-controls').screenshot({
      path: test.info().outputPath(`playback-alignment-${fullscreen ? 'full' : 'panel'}.png`),
    })
    await speed.click()
    await page.getByRole('menuitemcheckbox', { name: '1x', exact: true }).click()
  }
})

test('desktop evidence navigation moves the chart without rewinding history', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop only')
  const { iso } = await import('./replay-fixtures')
  await stubReplay(page, { multi: true })
  await open(page)
  const panel = page.locator('.asset-detail-panel'),
    slider = panel.locator('.replay-timeline input'),
    chart = panel.locator('.replay-chart')
  const checkCutoff = async (cutoff: string, metrics: string[]) => {
    await expect(slider).toHaveValue(cutoff)
    await expect(chart).toHaveAttribute('data-visible-end', cutoff)
    await expect(panel.locator('.replay-summary-metrics dd')).toHaveText(metrics)
    await expect(panel.locator('.replay-track-marker')).toHaveCount(5)
    await expect(panel.locator('.replay-trade-card')).toHaveCount(2)
    await expect(panel.locator('.replay-evidence-shade')).toBeVisible()
  }
  for (const index of [199, 150]) {
    const cutoff = String(Date.parse(iso(index)) / 1000)
    await slider.evaluate((input, value) => {
      ;(input as HTMLInputElement).value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }, cutoff)
    await expect(slider).toHaveValue(cutoff)
    await expect(panel.locator('.replay-summary-metrics dd').first()).not.toHaveText('—')
    const metrics = await panel.locator('.replay-summary-metrics dd').allTextContents()
    await panel.locator('[data-event-id="insight:i-2"]').hover()
    await expect(page.locator('.replay-insight-hover-surface')).toContainText(
      '这次空头交易出现亏损',
    )
    await expect(slider).toHaveValue(cutoff)
    await page.mouse.move(10, 10)
    await panel.locator('[data-trade-id="t-1"]').click()
    await checkCutoff(cutoff, metrics)
    for (let index = 0; index < 2; index++) {
      const dialog = await openTradeDetails(page, 't-1')
      await dialog.locator('.replay-fill-row').nth(index).click()
      await expect(dialog).toBeHidden()
      await checkCutoff(cutoff, metrics)
    }
    await panel.getByRole('button', { name: '4h', exact: true }).click()
    await panel.locator('[data-trade-id="t-2"]').click()
    await expect(chart).toHaveAttribute('aria-label', 'BTC/USDT 1h K 线图')
    await checkCutoff(cutoff, metrics)
  }
})

test('selected trade shade follows small chart pans without jumping or seeking', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop only')
  await stubReplay(page)
  await open(page)
  const panel = page.locator('.asset-detail-panel')
  await panel.locator('[data-trade-id="t-1"]').click()
  const chart = panel.locator('.replay-chart')
  const shade = panel.locator('.replay-evidence-shade')
  const slider = panel.locator('.replay-timeline input')
  const cutoff = await slider.inputValue()
  await expect(shade).toBeVisible()
  await chart.scrollIntoViewIfNeeded()
  const box = (await chart.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  // Pass the drag threshold, then move less than one candle at a time.
  await page.mouse.move(x + 8, y)
  await page.mouse.move(x + 12, y)
  await page.evaluate(() => new Promise(requestAnimationFrame))
  let previous = (await shade.boundingBox())!
  for (const offset of [16, 20, 24, 20, 16, 12]) {
    await page.mouse.move(x + offset, y)
    await page.evaluate(() => new Promise(requestAnimationFrame))
    const next = (await shade.boundingBox())!
    expect(Math.abs(next.x - previous.x)).toBeCloseTo(4, 0)
    expect(next.width).toBeCloseTo(previous.width, 0)
    previous = next
  }
  await page.mouse.up()
  await expect(slider).toHaveValue(cutoff)
  await expect(chart).toHaveAttribute('data-visible-end', cutoff)
})

test('desktop sell candle with an insight resumes after a brief pause', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop only')
  const { iso, replayInsights } = await import('./replay-fixtures')
  const { envelope } = await import('./auth-fixtures')
  await stubReplay(page)
  await page.route(/\/api\/replays\/[^/?]+\/insights(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({
        items: [
          {
            ...replayInsights[1],
            candle_id: 'c-50',
            evidence: { trade_ids: ['t-1'], fill_ids: ['f-2'] },
          },
        ],
        has_more: false,
        next_cursor: null,
      }),
    }),
  )
  await open(page)
  const panel = page.locator('.asset-detail-panel'),
    slider = panel.locator('.replay-timeline input')
  await slider.evaluate(
    (input, value) => {
      ;(input as HTMLInputElement).value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    },
    String(Date.parse(iso(49)) / 1000),
  )
  await expect(slider).toHaveValue(String(Date.parse(iso(49)) / 1000))
  await page.clock.install()
  await panel.getByRole('button', { name: '播放', exact: true }).click()
  await page.clock.runFor(700)
  expect(Number(await slider.inputValue())).toBeGreaterThan(Date.parse(iso(50)) / 1000)
  await panel.getByRole('button', { name: '暂停', exact: true }).click()
})

for (const language of ['zh-CN', 'en-US']) {
  test(`desktop quote colors and chart timestamps stay consistent in ${language}`, async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Desktop chart presentation only')
    const { candles, iso } = await import('./replay-fixtures')
    const { envelope } = await import('./auth-fixtures')
    await stubReplay(page)
    await page
      .context()
      .addCookies([{ name: 'trade-locale-manual', value: language, url: 'http://localhost:6002' }])
    const raw = candles()
    Object.assign(raw[197]!, { open: '90000', close: '90000', high: '90150', low: '89870' })
    Object.assign(raw[198]!, { open: '96000', close: '95000', high: '96150', low: '94870' })
    Object.assign(raw[199]!, { open: '93000', close: '94000', high: '94150', low: '92870' })
    await page.route(/\/api\/replays\/[^/?]+\/candles(?:\?.*)?$/, (route) =>
      route.fulfill({
        json: envelope({ timeframe: '1h', items: raw, has_more: false, next_cursor: null }),
      }),
    )
    await page.addInitScript(() => {
      const labels: string[] = []
      const positions: Array<{ text: string; y: number; topGap?: number; bottomGap?: number }> = []
      const rectangles = new WeakMap<CanvasRenderingContext2D, number[]>()
      const roundRect = CanvasRenderingContext2D.prototype.roundRect
      CanvasRenderingContext2D.prototype.roundRect = function (
        ...args: Parameters<typeof roundRect>
      ) {
        rectangles.set(this, [args[0], args[1], args[2], args[3]])
        return roundRect.apply(this, args)
      }
      const fillRect = CanvasRenderingContext2D.prototype.fillRect
      CanvasRenderingContext2D.prototype.fillRect = function (
        ...args: Parameters<typeof fillRect>
      ) {
        rectangles.set(this, args)
        return fillRect.apply(this, args)
      }
      ;(window as unknown as { chartTimePositions: typeof positions }).chartTimePositions =
        positions
      ;(window as unknown as { chartTimeLabels: string[] }).chartTimeLabels = labels
      const fillText = CanvasRenderingContext2D.prototype.fillText
      CanvasRenderingContext2D.prototype.fillText = function (
        ...args: Parameters<typeof fillText>
      ) {
        if (/^\d{4}\/\d{2}\/\d{2}/.test(args[0])) {
          labels.push(args[0])
          const box = (this.canvas as HTMLCanvasElement).getBoundingClientRect()
          const matrix = this.getTransform()
          const rectangle = rectangles.get(this)
          const metrics = this.measureText(args[0])
          positions.push({
            topGap: rectangle
              ? args[2] - metrics.actualBoundingBoxAscent - rectangle[1]!
              : undefined,
            bottomGap: rectangle
              ? rectangle[1]! + rectangle[3]! - args[2] - metrics.actualBoundingBoxDescent
              : undefined,
            text: args[0],
            y:
              box.top +
              (matrix.b * args[1] + matrix.d * args[2] + matrix.f) /
                (this.canvas.height / box.height),
          })
        }
        return fillText.apply(this, args)
      }
    })
    await open(page, false)
    const panel = page.locator('.asset-detail-panel'),
      slider = panel.locator('.replay-timeline input'),
      quote = panel.locator('.replay-quote'),
      chart = panel.locator('.replay-chart')
    await expect(panel.locator('.replay-primary-action')).toBeEnabled()
    await expect(quote.locator('.replay-quote-volume')).toHaveCSS('font-weight', '500')
    await expect(quote.locator('.replay-quote-volume')).toHaveCSS(
      'color',
      await quote.evaluate((el) => {
        const probe = document.createElement('span')
        probe.style.color = 'var(--color-text-primary)'
        el.append(probe)
        const color = getComputedStyle(probe).color
        probe.remove()
        return color
      }),
    )
    if (language === 'zh-CN')
      expect((await quote.locator('dt').allTextContents()).slice(0, 4)).toEqual([
        '开',
        '高',
        '低',
        '收',
      ])
    await expect(quote.locator('time')).toHaveText('2025/01/09 07:00')
    const typography = await quote.locator('time, dt, dd').evaluateAll((elements) =>
      elements.map((el) => ({
        size: getComputedStyle(el).fontSize,
        line: getComputedStyle(el).lineHeight,
        top: el.getBoundingClientRect().top,
      })),
    )
    expect(typography.every((item) => item.size === '12px' && item.line === '20px')).toBe(true)
    expect(
      Math.max(...typography.map((item) => item.top)) -
        Math.min(...typography.map((item) => item.top)),
    ).toBeLessThan(1)
    const unchanged = await quote
      .locator('dt, .replay-quote-date')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).color))
    for (const [index, color] of [
      [199, 'rgb(46, 189, 133)'],
      [198, 'rgb(246, 70, 93)'],
      [197, 'rgb(46, 189, 133)'],
    ] as const) {
      await slider.evaluate(
        (el, value) => {
          ;(el as HTMLInputElement).value = value
          el.dispatchEvent(new Event('input', { bubbles: true }))
        },
        String(Date.parse(iso(index)) / 1000),
      )
      await expect(quote.locator('time')).toHaveAttribute('datetime', iso(index))
      await expect(quote.locator('dd')).toHaveCount(7)
      for (const value of await quote.locator('dd:not(.replay-quote-volume)').all())
        await expect(value).toHaveCSS('color', color)
      expect(
        await quote
          .locator('dt, .replay-quote-date')
          .evaluateAll((els) => els.map((el) => getComputedStyle(el).color)),
      ).toEqual(unchanged)
      await expect(panel.locator('.replay-progress-time')).toHaveText(
        `2025/01/09 0${index - 192}:00`,
      )
      await expect(quote).not.toContainText('UTC')
    }
    await slider.press('End')
    await chart.scrollIntoViewIfNeeded()
    const bounds = (await chart.boundingBox())!
    await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.6)
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { chartTimeLabels: string[] }).chartTimeLabels.some((text) =>
            /^2025\/01\/\d{2} \d{2}:\d{2}$/.test(text),
          ),
        ),
      )
      .toBe(true)
    const positions = await page.evaluate(
      () =>
        (
          window as unknown as {
            chartTimePositions: Array<{
              text: string
              y: number
              topGap?: number
              bottomGap?: number
            }>
          }
        ).chartTimePositions,
    )
    const tooltip = positions.findLast((point) => point.text.includes(' '))!
    expect(Math.abs(tooltip.topGap! - tooltip.bottomGap!)).toBeLessThan(0.5)
    expect(tooltip.topGap).toBeGreaterThanOrEqual(3)
    const tooltipY = tooltip.y
    const tickY = positions.findLast((point) => !point.text.includes(' '))!.y
    expect(Math.abs(tooltipY - tickY)).toBeLessThan(0.5)
    await expect(quote.locator('.replay-quote-volume')).not.toHaveText(/\.00$/)
    await panel
      .locator('.replay-chart-block')
      .screenshot({ path: test.info().outputPath(`quote-time-${language}.png`) })
    await panel
      .getByRole('button', { name: language === 'zh-CN' ? '全屏' : 'Fullscreen', exact: true })
      .click()
    await chart.hover({ position: { x: 350, y: 130 } })
    await quote.screenshot({ path: test.info().outputPath(`quote-style-${language}.png`) })
    await panel
      .getByRole('button', { name: language === 'zh-CN' ? '条件' : 'Conditions', exact: true })
      .click()
    const conditions = page.getByRole('dialog', {
      name: language === 'zh-CN' ? '条件' : 'Conditions',
      exact: true,
    })
    await expect(conditions).toBeVisible()
    await expect(conditions).not.toContainText('UTC')
  })
}

test('follow latest pans smoothly at the user scale, respects cutoff and yields to gestures', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop viewport policy')
  const { iso, replayInsights } = await import('./replay-fixtures')
  const { envelope } = await import('./auth-fixtures')
  await stubReplay(page)
  await page.route(/\/api\/replays\/[^/?]+\/insights(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({
        items: Array.from({ length: 10 }, (_, i) => ({
          ...replayInsights[1],
          id: `anchor-${i}`,
          candle_id: `c-${i * 20}`,
          evidence: null,
        })),
      }),
    }),
  )
  await open(page)
  const panel = page.locator('.asset-detail-panel')
  const chart = panel.locator('.replay-chart')
  const slider = panel.locator('.replay-timeline input')
  const control = panel.getByRole('button', { name: '回到最新', exact: true })
  await expect(panel.getByRole('button', { name: '重置视野' })).toHaveCount(0)
  await expect(control).toBeHidden()
  const cutoff = String(Date.parse(iso(160)) / 1000)
  await slider.evaluate((input, value) => {
    ;(input as HTMLInputElement).value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, cutoff)
  await expect(panel.getByRole('button', { name: '播放', exact: true })).toBeEnabled()
  await chart.scrollIntoViewIfNeeded()
  const spacing = async () => {
    const dots = await insightDots(chart)
    expect(dots.length).toBeGreaterThan(1)
    const gaps = dots
      .slice(1)
      .map((dot, i) => dot.x - dots[i]!.x)
      .sort((a, b) => a - b)
    return gaps[Math.floor(gaps.length / 2)]!
  }
  const initial = await spacing()
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -200)
  await expect.poll(spacing).toBeGreaterThan(initial + 5)
  const custom = await spacing()
  await panel.locator('[data-trade-id="t-1"]').click()
  await chart.scrollIntoViewIfNeeded()
  await expect(control).toBeVisible()
  const button = (await control.boundingBox())!
  const plot = (await chart.locator('canvas').first().boundingBox())!
  expect(button.x).toBeGreaterThan(plot.x + plot.width * 0.8)
  expect(button.y + button.height / 2).toBeGreaterThan(plot.y + plot.height * 0.8)
  expect(button.x + button.width).toBeLessThan(plot.x + plot.width)
  await chart
    .locator('..')
    .screenshot({ path: test.info().outputPath('follow-latest-control.png') })
  const clockStart = Date.now()
  await page.clock.install({ time: clockStart })
  await page.clock.pauseAt(clockStart + 60_000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const before = await timeAxisImage(chart)
  await control.click()
  await page.mouse.move(10, 10)
  await page.clock.runFor(80)
  const midway = await timeAxisImage(chart)
  expect(midway).not.toBe(before)
  await page.clock.runFor(300)
  expect(await timeAxisImage(chart)).not.toBe(midway)
  const latestPosition = async () => ((await insightDots(chart)).at(-1)!.x - plot.x) / plot.width
  expect(await latestPosition()).toBeGreaterThan(0.91)
  expect(await latestPosition()).toBeLessThan(0.95)
  expect(Math.abs((await spacing()) - custom)).toBeLessThan(1.5)
  await expect(slider).toHaveValue(cutoff)
  await expect(chart).toHaveAttribute('data-visible-end', cutoff)
  await expect(panel.getByRole('button', { name: '播放', exact: true })).toBeVisible()
  await expect(control).toBeHidden()
  // A gesture interrupts the return animation with no delayed snap-back.
  await panel.locator('[data-trade-id="t-1"]').click()
  await page.clock.runFor(50)
  await control.click()
  await page.clock.runFor(70)
  await chart.click({ position: { x: 200, y: 140 } })
  await page.mouse.move(10, 10)
  await page.clock.runFor(50)
  const interrupted = await timeAxisImage(chart)
  await page.clock.runFor(500)
  expect(await timeAxisImage(chart)).toBe(interrupted)
  await expect(control).toBeVisible()
  // Reduced motion reaches the same anchor and scale without the transition.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await control.click()
  await page.clock.runFor(50)
  expect(await latestPosition()).toBeGreaterThan(0.91)
  expect(await latestPosition()).toBeLessThan(0.95)
  expect(Math.abs((await spacing()) - custom)).toBeLessThan(1.5)
  await expect(slider).toHaveValue(cutoff)
})

test('mid-history seeks and return keep short history growing from the left at the user scale', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop viewport policy')
  const { iso, replayInsights } = await import('./replay-fixtures')
  const { envelope } = await import('./auth-fixtures')
  await stubReplay(page)
  await page.route(/\/api\/replays\/[^/?]+\/insights(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({
        items: Array.from({ length: 20 }, (_, i) => ({
          ...replayInsights[1],
          id: `anchor-${i}`,
          candle_id: `c-${i * 10}`,
          evidence: null,
        })),
      }),
    }),
  )
  await open(page)
  const panel = page.locator('.asset-detail-panel'),
    chart = panel.locator('.replay-chart'),
    slider = panel.locator('.replay-timeline input'),
    control = panel.getByRole('button', { name: '回到最新', exact: true })
  const spacing = async () => {
    const dots = await insightDots(chart)
    return (dots.at(-1)!.x - dots[0]!.x) / (dots.length - 1) / 10
  }
  const seek = async (n: number) => {
    const cutoff = String(Date.parse(iso(n)) / 1000)
    await slider.evaluate((input, value) => {
      ;(input as HTMLInputElement).value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }, cutoff)
    await expect(chart).toHaveAttribute('data-visible-end', cutoff)
    await chart.scrollIntoViewIfNeeded()
    await page.mouse.move(10, 10)
    await expect.poll(async () => (await candleGeometry(chart)).first!).toBeLessThan(15)
    await expect(control).toBeHidden()
  }
  await seek(40)
  const halfScreenSpacing = await spacing()
  const halfScreen = await candleGeometry(chart)
  expect(halfScreen.last! / halfScreen.width).toBeLessThan(0.5)

  // Widening the panel and zooming out make a longer historical prefix fit too.
  await panel.getByRole('button', { name: '全屏', exact: true }).click()
  await chart.scrollIntoViewIfNeeded()
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 100)
  await expect.poll(spacing).toBeLessThan(halfScreenSpacing - 0.05)
  const scale = await spacing()
  await seek(100)
  const middle = await candleGeometry(chart)
  expect(middle.last! / middle.width).toBeLessThan(0.8)
  expect(Math.abs((await spacing()) - scale)).toBeLessThan(0.1)
  await chart.screenshot({ path: test.info().outputPath('mid-history-fills-from-left.png') })

  const clockStart = Date.now()
  await page.clock.install({ time: clockStart })
  await page.clock.pauseAt(clockStart + 60_000)
  const pan = async (dx: number) => {
    const b = (await chart.boundingBox())!,
      x = b.x + b.width / 2,
      y = b.y + b.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + Math.sign(dx) * 3, y)
    await page.mouse.move(x + dx, y, { steps: 10 })
    await page.mouse.up()
    await page.mouse.move(10, 10)
    await page.clock.runFor(50)
  }
  // Return removes accidental left whitespace, without pushing short history right.
  await pan(70)
  const displaced = (await candleGeometry(chart)).first!
  expect(displaced).toBeGreaterThan(60)
  await expect(control).toBeVisible()
  const cutoff = await slider.inputValue()
  await control.click()
  await page.clock.runFor(70)
  const moving = (await candleGeometry(chart)).first!
  expect(moving).toBeGreaterThan(10)
  expect(moving).toBeLessThan(displaced)
  await page.clock.runFor(300)
  await expect(control).toBeHidden()
  expect((await candleGeometry(chart)).first!).toBeLessThan(15)
  await expect(slider).toHaveValue(cutoff)
  expect(Math.abs((await spacing()) - scale)).toBeLessThan(0.1)

  await panel.getByRole('button', { name: '播放', exact: true }).click()
  await page.clock.runFor(800)
  const growing = await candleGeometry(chart)
  expect(growing.first!).toBeLessThan(15)
  expect(growing.last!).toBeGreaterThan(middle.last! + 10)
  await expect(control).toBeHidden()
  await panel.getByRole('button', { name: '暂停', exact: true }).click()
  await panel.getByRole('button', { name: '播放', exact: true }).click()
  await page.clock.runFor(400)
  expect((await candleGeometry(chart)).first!).toBeLessThan(15)
  expect(Math.abs((await spacing()) - scale)).toBeLessThan(0.1)

  // The same return rule applies while playing with reduced motion.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await pan(70)
  await control.click()
  await page.clock.runFor(100)
  expect((await candleGeometry(chart)).first!).toBeLessThan(15)
  await expect(control).toBeHidden()
  await expect(panel.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
})

test('manual margins control tracking, return visibility and fill-to-follow across pause/resume', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop viewport policy')
  const { iso, replayInsights } = await import('./replay-fixtures')
  const { envelope } = await import('./auth-fixtures')
  await stubReplay(page)
  await page.route(/\/api\/replays\/[^/?]+\/insights(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({
        items: Array.from({ length: 10 }, (_, i) => ({
          ...replayInsights[1],
          id: `anchor-${i}`,
          candle_id: `c-${i * 20}`,
          evidence: null,
        })),
      }),
    }),
  )
  await open(page)
  const panel = page.locator('.asset-detail-panel'),
    chart = panel.locator('.replay-chart')
  const slider = panel.locator('.replay-timeline input')
  const control = panel.getByRole('button', { name: '回到最新', exact: true })
  // These manual-margin cases need enough history to fill the user's viewport.
  await chart.scrollIntoViewIfNeeded()
  const box = (await chart.boundingBox())!
  const spacing = async () => {
    const dots = await insightDots(chart)
    return (dots.at(-1)!.x - dots[0]!.x) / (dots.length - 1) / 20
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 3; i++) {
    const before = await spacing()
    await page.mouse.wheel(0, -100)
    await expect.poll(spacing).toBeGreaterThan(before + 0.05)
  }
  await slider.evaluate(
    (input, value) => {
      ;(input as HTMLInputElement).value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    },
    String(Date.parse(iso(80)) / 1000),
  )
  await expect(panel.getByRole('button', { name: '播放', exact: true })).toBeEnabled()
  await chart.scrollIntoViewIfNeeded()
  const clockStart = Date.now()
  await page.clock.install({ time: clockStart })
  await page.clock.pauseAt(clockStart + 60_000)
  const pan = async (dx: number) => {
    const b = (await chart.boundingBox())!,
      x = b.x + b.width / 2,
      y = b.y + b.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + Math.sign(dx) * 3, y)
    await page.mouse.move(x + dx, y, { steps: 10 })
    await page.mouse.up()
    await page.mouse.move(10, 10)
    await page.clock.runFor(50)
  }
  // A click is not displacement, and a small right pan tracks its smaller margin.
  await chart.click({ position: { x: 100, y: 100 } })
  await page.clock.runFor(50)
  await expect(control).toBeHidden()
  const baseline = await candleGeometry(chart)
  await pan(14)
  await expect(control).toBeHidden()
  const narrow = await candleGeometry(chart)
  expect(narrow.last!).toBeGreaterThan(baseline.last! + 5)
  await panel.getByRole('button', { name: '播放', exact: true }).click()
  await page.clock.runFor(1000)
  expect(Math.abs((await candleGeometry(chart)).last! - narrow.last!)).toBeLessThan(2)
  await expect(control).toBeHidden()
  // Resume must keep that custom margin too.
  await panel.getByRole('button', { name: '暂停', exact: true }).click()
  await panel.getByRole('button', { name: '播放', exact: true }).click()
  await page.clock.runFor(800)
  expect(Math.abs((await candleGeometry(chart)).last! - narrow.last!)).toBeLessThan(2)
  // Once the newest candle is entirely outside, the viewport stops following.
  await pan(65)
  await expect(control).toBeVisible()
  const detached = await timeAxisImage(chart)
  await page.clock.runFor(700)
  expect(await timeAxisImage(chart)).toBe(detached)
  await panel.getByRole('button', { name: '暂停', exact: true }).click()
  await control.click()
  await page.clock.runFor(350)
  await expect(control).toBeHidden()
  // Left pan adds whitespace. Candles fill it without a snap on pause/resume.
  await pan(-70)
  await expect(control).toBeVisible()
  const wide = await candleGeometry(chart)
  await panel.getByRole('button', { name: '播放', exact: true }).click()
  await page.clock.runFor(600)
  const growing = await candleGeometry(chart)
  expect(growing.last!).toBeGreaterThan(wide.last!)
  expect(growing.last! / growing.width).toBeLessThan(0.91)
  await panel.getByRole('button', { name: '暂停', exact: true }).click()
  await panel.getByRole('button', { name: '播放', exact: true }).click()
  await page.clock.runFor(100)
  const resumed = await candleGeometry(chart)
  expect(resumed.last! / resumed.width).toBeLessThan(0.91)
  await page.clock.runFor(3500)
  await expect(control).toBeHidden()
  await expect(panel.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  const caughtUp = await candleGeometry(chart)
  expect(caughtUp.last! / caughtUp.width).toBeGreaterThan(0.91)
  expect(caughtUp.last! / caughtUp.width).toBeLessThan(0.94)
  expect(Math.abs(caughtUp.spacing! - baseline.spacing!)).toBeLessThan(1)
  await page.clock.runFor(500)
  const later = await candleGeometry(chart)
  // The price axis may widen at a new digit; compare the anchor within its plot.
  expect(Math.abs(later.last! - (caughtUp.last! / caughtUp.width) * later.width)).toBeLessThan(2.5)
  await chart.screenshot({ path: test.info().outputPath('whitespace-filled-following.png') })
})

test('replay starts growing from the left at the user scale and then follows the default margin', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop viewport policy')
  const { replayInsights } = await import('./replay-fixtures')
  const { envelope } = await import('./auth-fixtures')
  await stubReplay(page)
  await page.route(/\/api\/replays\/[^/?]+\/insights(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({
        items: Array.from({ length: 10 }, (_, i) => ({
          ...replayInsights[1],
          id: `anchor-${i}`,
          candle_id: `c-${i * 20}`,
          evidence: null,
        })),
      }),
    }),
  )
  await open(page)
  const panel = page.locator('.asset-detail-panel'),
    chart = panel.locator('.replay-chart')
  const slider = panel.locator('.replay-timeline input')
  await chart.scrollIntoViewIfNeeded()
  const b = (await chart.boundingBox())!
  const spacing = async () => {
    const dots = await insightDots(chart)
    return dots.length > 1 ? (dots.at(-1)!.x - dots[0]!.x) / (dots.length - 1) / 20 : 0
  }
  await expect.poll(spacing).toBeGreaterThan(0)
  const initial = await spacing()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  for (let i = 0; i < 3; i++) {
    const before = await spacing()
    await page.mouse.wheel(0, -100)
    await expect.poll(spacing).toBeGreaterThan(before + 0.05)
  }
  expect(await spacing()).toBeGreaterThan(initial + 0.3)
  const scale = await spacing()
  const clockStart = Date.now()
  await page.clock.install({ time: clockStart })
  await page.clock.pauseAt(clockStart + 60_000)
  await panel.getByRole('button', { name: '从头播放', exact: true }).click()
  await page.clock.runFor(80)
  await page.mouse.move(10, 10)
  const beginning = await candleGeometry(chart)
  expect(beginning.first!).toBeLessThan(20)
  expect(beginning.last! / beginning.width).toBeLessThan(0.1)
  await chart.screenshot({ path: test.info().outputPath('replay-grows-from-left.png') })
  await page.clock.runFor(1200)
  const growing = await candleGeometry(chart)
  expect(growing.last!).toBeGreaterThan(beginning.last! + 10)
  expect(growing.last! / growing.width).toBeLessThan(0.5)
  expect(Math.abs(growing.spacing! - scale)).toBeLessThan(1)
  await panel.getByRole('button', { name: '暂停', exact: true }).click()
  const paused = await slider.inputValue()
  await page.clock.runFor(800)
  await expect(slider).toHaveValue(paused)
  await panel.getByRole('button', { name: '播放', exact: true }).click()
  await page.clock.runFor(100)
  expect((await candleGeometry(chart)).last! / growing.width).toBeLessThan(0.5)
  for (let i = 0; i < 15; i++) {
    const geometry = await candleGeometry(chart)
    if (geometry.last! / geometry.width > 0.91) break
    await page.clock.runFor(600)
  }
  await expect(panel.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  const following = await candleGeometry(chart)
  expect(following.last! / following.width).toBeGreaterThan(0.91)
  expect(following.last! / following.width).toBeLessThan(0.94)
  expect(Math.abs(following.spacing! - scale)).toBeLessThan(1)
  await page.clock.runFor(700)
  expect(Math.abs((await candleGeometry(chart)).last! - following.last!)).toBeLessThan(2)
  await expect(panel.getByRole('button', { name: '回到最新', exact: true })).toBeHidden()
})

test('replay scrollbar appearance preserves chart and timeline geometry', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop scrollbar layout')
  await stubReplay(page)
  await open(page)
  const panel = page.locator('.asset-detail-panel')
  await expect(panel.locator('.replay-detail-content')).toHaveCSS('scrollbar-gutter', 'stable')
  for (const fullscreen of [false, true]) {
    if (fullscreen) await panel.getByRole('button', { name: '全屏', exact: true }).click()
    const result = await panel.locator('.replay-detail-content').evaluate((element) => {
      const scroller = element as HTMLElement
      const previous = scroller.style.cssText
      // Force a real no-overflow -> overflow transition without relying on fixture content length.
      scroller.style.flex = 'none'
      scroller.style.maxHeight = 'none'
      scroller.style.height = `${scroller.scrollHeight + 100}px`
      const geometry = () =>
        ['.replay-chart', '.replay-timeline input'].map((selector) => {
          const rect = scroller.querySelector(selector)!.getBoundingClientRect()
          return { x: rect.x, width: rect.width }
        })
      const before = geometry()
      const initiallyOverflowing = scroller.scrollHeight > scroller.clientHeight
      const spacer = document.createElement('div')
      spacer.style.height = '3000px'
      scroller.append(spacer)
      const after = geometry()
      const overflowing = scroller.scrollHeight > scroller.clientHeight
      spacer.remove()
      const restored = geometry()
      scroller.style.cssText = previous
      return { before, after, restored, initiallyOverflowing, overflowing }
    })
    expect(result.initiallyOverflowing).toBe(false)
    expect(result.overflowing).toBe(true)
    expect(result.after).toEqual(result.before)
    expect(result.restored).toEqual(result.before)
  }
})

test('desktop trade cards and chart gestures keep playback running and return restores following', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop interaction')
  const { iso } = await import('./replay-fixtures')
  await stubReplay(page)
  await open(page)
  const panel = page.locator('.asset-detail-panel')
  const slider = panel.locator('.replay-timeline input')
  const chart = panel.locator('.replay-chart')
  await slider.evaluate(
    (input, value) => {
      ;(input as HTMLInputElement).value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    },
    String(Date.parse(iso(110)) / 1000),
  )
  await expect(panel.getByRole('button', { name: '播放', exact: true })).toBeEnabled()
  const clockStart = Date.now()
  await page.clock.install({ time: clockStart })
  await page.clock.pauseAt(clockStart + 60_000)
  await panel.getByRole('button', { name: '播放', exact: true }).click()
  await chart.scrollIntoViewIfNeeded()
  const box = (await chart.boundingBox())!
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 10, y)
  await page.mouse.move(x + 100, y, { steps: 10 })
  await page.mouse.up()
  await page.mouse.wheel(0, -120)
  await page.clock.runFor(300)
  await page.mouse.move(10, 10)
  await page.clock.runFor(100)
  const readAxis = () =>
    chart.evaluate((host) => {
      const bottom = host.getBoundingClientRect().bottom
      const axis = [...host.querySelectorAll('canvas')].find((c) => {
        const r = c.getBoundingClientRect()
        return r.height > 0 && r.height < 40 && Math.abs(r.bottom - bottom) < 2
      })!
      return axis.toDataURL()
    })
  // Off-screen trade inspection reveals its endpoint, but leaves the clock running.
  const inspectionTime = await slider.inputValue()
  await panel.locator('[data-trade-id="t-1"]').click()
  await expect(slider).toHaveValue(inspectionTime)
  await page.clock.runFor(100)
  await expect(panel.locator('[data-trade-id="t-1"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(panel.locator('.replay-evidence-shade')).toBeVisible()
  await expect(panel.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  const before = await slider.inputValue()
  const axis = await readAxis()
  await page.clock.runFor(1000)
  await expect(panel.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  expect(Number(await slider.inputValue())).toBeGreaterThan(Number(before))
  expect(await readAxis()).toBe(axis)
  const card = panel.locator('[data-trade-id="t-1"]')
  const deselectedAt = await slider.inputValue()
  await card.click()
  await expect(card).toHaveAttribute('aria-pressed', 'false')
  await expect(panel.locator('.replay-evidence-shade')).toBeHidden()
  await expect(panel.locator('.replay-track-evidence')).toBeHidden()
  await expect(slider).toHaveValue(deselectedAt)
  // Keyboard activation uses the same toggle, without changing playback or framing.
  await card.press('Enter')
  await expect(card).toHaveAttribute('aria-pressed', 'true')
  await card.press('Enter')
  await expect(card).toHaveAttribute('aria-pressed', 'false')
  await page.clock.runFor(1000)
  await expect(panel.locator('.replay-evidence-shade')).toBeHidden()
  await expect(panel.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  expect(Number(await slider.inputValue())).toBeGreaterThan(Number(deselectedAt))
  expect(await readAxis()).toBe(axis)
  await panel.getByRole('button', { name: '回到最新', exact: true }).click()
  await page.mouse.move(10, 10)
  await page.clock.runFor(100)
  await page.clock.runFor(300)
  const resetAxis = await readAxis()
  expect(resetAxis).not.toBe(axis)
  await page.clock.runFor(1000)
  expect(await readAxis()).not.toBe(resetAxis)
  await expect(panel.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  await slider.press('ArrowLeft')
  await expect(panel.getByRole('button', { name: '播放', exact: true })).toBeVisible()
})

test('an inspected open trade extends its shade during playback and stops at its exit', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop evidence inspection')
  const { iso } = await import('./replay-fixtures')
  await stubReplay(page)
  await open(page)
  const panel = page.locator('.asset-detail-panel')
  const chart = panel.locator('.replay-chart')
  const slider = panel.locator('.replay-timeline input')
  await slider.evaluate(
    (input, value) => {
      ;(input as HTMLInputElement).value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    },
    String(Date.parse(iso(35)) / 1000),
  )
  await expect(panel.getByRole('button', { name: '播放', exact: true })).toBeEnabled()
  const clockStart = Date.now()
  await page.clock.install({ time: clockStart })
  await page.clock.pauseAt(clockStart + 60_000)
  await panel.getByRole('button', { name: '播放', exact: true }).click()
  await page.clock.runFor(100)
  await panel.locator('[data-trade-id="t-1"]').click()
  await page.clock.runFor(50)
  await expect(panel.locator('[data-trade-id="t-1"]')).toContainText('未平仓')
  const trackShade = panel.locator('.replay-track-evidence')
  const initialWidth = (await trackShade.boundingBox())!.width
  await page.mouse.move(10, 10)
  const axis = await timeAxisImage(chart)
  await page.clock.runFor(500)
  expect((await trackShade.boundingBox())!.width).toBeGreaterThan(initialWidth)
  expect(await timeAxisImage(chart)).toBe(axis)
  await page.clock.runFor(2400)
  expect(Number(await slider.inputValue())).toBeGreaterThan(Date.parse(iso(50)) / 1000)
  await expect(panel.locator('[data-trade-id="t-1"]')).not.toContainText('未平仓')
  const closedWidth = (await trackShade.boundingBox())!.width
  await page.clock.runFor(1000)
  expect((await trackShade.boundingBox())!.width).toBe(closedWidth)
  await expect(panel.locator('[data-trade-id="t-1"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(panel.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
})

test('timeline seeks preserve zoom and share framing without selecting evidence', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop viewport policy')
  const { iso, replayInsights } = await import('./replay-fixtures')
  const { envelope } = await import('./auth-fixtures')
  await stubReplay(page)
  await page.route(/\/api\/replays\/[^/?]+\/insights(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({
        items: [
          ...Array.from({ length: 20 }, (_, i) => ({
            ...replayInsights[1],
            id: `anchor-${i}`,
            candle_id: `c-${i * 10}`,
            evidence: null,
          })),
          { ...replayInsights[1], evidence: { entry_candle_id: 'c-20', exit_candle_id: 'c-100' } },
        ],
      }),
    }),
  )
  await open(page)
  const panel = page.locator('.asset-detail-panel')
  const slider = panel.locator('.replay-timeline input')
  const chart = panel.locator('.replay-chart')
  const cutoff = (n: number) => String(Date.parse(iso(n)) / 1000)
  const seek = async (n: number) => {
    await slider.evaluate((input, value) => {
      ;(input as HTMLInputElement).value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }, cutoff(n))
    await expect(chart).toHaveAttribute('data-visible-end', cutoff(n))
  }
  const spacing = async () => {
    const dots = await insightDots(chart)
    expect(dots.length).toBeGreaterThan(1)
    const gaps = dots
      .slice(1)
      .map((dot, i) => dot.x - dots[i]!.x)
      .sort((a, b) => a - b)
    return gaps[Math.floor(gaps.length / 2)]!
  }
  await chart.scrollIntoViewIfNeeded()
  const box = (await chart.boundingBox())!
  const initialSpacing = await spacing()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 3; i++) {
    const before = await spacing()
    await page.mouse.wheel(0, -100)
    await expect.poll(spacing).toBeGreaterThan(before + 1)
  }
  const customSpacing = await spacing()
  for (const [event, n] of [
    ['fill:f-1', 20],
    ['fill:f-2', 50],
    ['insight:anchor-5', 50],
    ['insight:i-2', 100],
  ] as const) {
    await seek(199)
    // Every timeline action must clear a previous explicit trade selection.
    await panel.locator('[data-trade-id="t-2"]').click()
    await expect(panel.locator('.replay-evidence-shade')).toBeVisible()
    await panel.locator(`[data-event-id="${event}"]`).click()
    await expect(slider).toHaveValue(cutoff(n))
    await expect(chart).toHaveAttribute('data-visible-end', cutoff(n))
    await expect(panel.locator('.replay-evidence-shade')).toBeHidden()
    await expect(panel.locator('.replay-track-evidence')).toHaveCount(0)
    await expect(panel.locator('.replay-trade-card[aria-pressed="true"]')).toHaveCount(0)
    await expect(panel.locator('.replay-track-marker[aria-pressed]')).toHaveCount(0)
    await expect(panel.locator('[data-event-id="insight:anchor-19"]')).toHaveCount(0)
    await chart.scrollIntoViewIfNeeded()
    await page.mouse.move(10, 10)
    await expect.poll(async () => Math.abs((await spacing()) - customSpacing)).toBeLessThan(1)
    await expect.poll(async () => (await insightDots(chart)).every((dot) => !dot.active)).toBe(true)
    const plot = (await chart.locator('canvas').first().boundingBox())!
    const dots = await insightDots(chart)
    const last = dots.at(-1)!
    const expectedX = Math.min((plot.width * 100) / 108, 8 + (n * customSpacing) / 10)
    expect(Math.abs(last.x - plot.x - expectedX)).toBeLessThan(3)
    // Insight circles have their own 12px edge inset; inspect the candle itself.
    if (expectedX < plot.width * 0.91) expect((await candleGeometry(chart)).first!).toBeLessThan(10)
    await expect(panel.getByRole('button', { name: '回到最新', exact: true })).toBeHidden()
    const eventAxis = await timeAxisImage(chart)
    // Normal slider input and repeated event clicks have identical positioning.
    await seek(n)
    await expect.poll(() => timeAxisImage(chart)).toBe(eventAxis)
    await panel.locator(`[data-event-id="${event}"]`).click()
    await expect(panel.locator('.replay-evidence-shade')).toBeHidden()
    await page.mouse.move(10, 10)
    await expect.poll(() => timeAxisImage(chart)).toBe(eventAxis)
  }
  // The beginning of history may have just one candle; returning must retain zoom.
  await slider.press('Home')
  await expect(chart).toHaveAttribute('data-visible-end', cutoff(0))
  await slider.press('End')
  await expect(chart).toHaveAttribute('data-visible-end', cutoff(199))
  await expect.poll(async () => Math.abs((await spacing()) - customSpacing)).toBeLessThan(1)
  await seek(130)
  await panel.getByRole('button', { name: '播放', exact: true }).click()
  await expect.poll(() => slider.inputValue()).not.toBe(cutoff(130))
  await panel.getByRole('button', { name: '暂停', exact: true }).click()
  await expect.poll(async () => Math.abs((await spacing()) - customSpacing)).toBeLessThan(1)
  await chart.screenshot({ path: test.info().outputPath('timeline-preserves-user-scale.png') })
  expect(customSpacing).toBeGreaterThan(initialSpacing + 2)
})

test('desktop insights hover in the chart and timeline while trades stay chronological', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop evidence presentation')
  const { replayInsights, iso } = await import('./replay-fixtures')
  const { envelope } = await import('./auth-fixtures')
  await stubReplay(page)
  const { replayTrades } = await import('./replay-fixtures')
  await page.route(/\/api\/replays\/[^/?]+\/trades(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({
        items: replayTrades.map((trade) => ({
          ...trade,
          fills: trade.fills.map((fill, index) => ({
            ...fill,
            reason:
              index === 0
                ? 'Close broke above prior 10-bar high (Livermore key-point breakout), with volume confirming the entry signal and risk controls satisfied.'
                : fill.reason,
          })),
        })),
        page: 1,
        size: 100,
        total: 2,
        total_pages: 1,
      }),
    }),
  )
  await page.route(/\/api\/replays\/[^/?]+\/insights(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({
        items: [
          ...replayInsights,
          ...[130, 160].map((index) => ({
            ...replayInsights[1],
            id: `i-${index}`,
            candle_id: `c-${index}`,
            evidence: {},
            title: `洞察 ${index}`,
            content: `纯文本洞察 ${index}\n第二行内容`,
          })),
        ],
        has_more: false,
        next_cursor: null,
      }),
    }),
  )
  await open(page)
  const panel = page.locator('.asset-detail-panel')
  const slider = panel.locator('.replay-timeline input')
  const chart = panel.locator('.replay-chart')
  const cards = panel.locator('.replay-trade-card')
  await expect(cards).toHaveCount(2)
  await expect(panel.locator('.replay-evidence').getByRole('combobox')).toHaveCount(0)
  await expect(cards.first()).not.toContainText('#')
  const compactCard = (await cards.first().boundingBox())!
  expect(compactCard.width).toBeLessThan(190)
  expect(compactCard.height).toBeLessThan(110)
  await expect(panel.getByRole('button', { name: '交易排序', exact: true })).toHaveCount(0)
  await expect(cards.first()).toHaveAttribute('data-trade-id', 't-1')
  await cards.first().click()
  await expect(panel.locator('.replay-trade-detail')).toHaveCount(0)
  await expect(page.locator('.replay-trade-dialog')).toHaveCount(0)
  const dialog = await openTradeDetails(page, 't-1')
  await expect(dialog.locator('tbody tr')).toHaveCount(2)
  await expect(dialog.locator('.replay-trade-dialog-metrics')).toContainText('1 天 6 小时')
  await expect(dialog.locator('.replay-fill-reason').first()).toContainText(
    'Close broke above prior 10-bar high',
  )
  await closeTradeDetails(page)
  await page.screenshot({ path: test.info().outputPath('compact-trade-cards.png') })
  await expect(slider).toHaveValue(String(Date.parse(iso(199)) / 1000))
  await panel.getByRole('button', { name: '回到最新', exact: true }).click()
  await page.waitForTimeout(320)
  await expect(panel.locator('[role="tab"]')).toHaveCount(0)
  const marker = panel.locator('[data-event-id="insight:i-130"]')
  await marker.hover()
  await expect(page.locator('.replay-insight-hover-surface')).toContainText('纯文本洞察 130')
  await expect(slider).toHaveValue(String(Date.parse(iso(199)) / 1000))
  await page.mouse.move(10, 10)
  await expect(page.locator('.replay-insight-hover-surface')).toBeHidden()
  await chart.scrollIntoViewIfNeeded()
  const dots = () => insightDots(chart)
  await expect.poll(async () => (await dots()).length).toBeGreaterThanOrEqual(2)
  const positions = await dots()
  expect(new Set(positions.map((p) => p.y)).size).toBe(1)
  const bounds = (await chart.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width / 2 + 8, bounds.y + bounds.height / 2)
  await page.mouse.move(bounds.x + bounds.width / 2 + 24, bounds.y + bounds.height / 2)
  await page.mouse.up()
  await page.mouse.wheel(0, -30)
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  const moved = await dots()
  expect(moved.length).toBeGreaterThanOrEqual(2)
  expect(moved.at(-1)!.y).toBeCloseTo(positions.at(-1)!.y, 0)
  const dot = moved.at(-1)!
  await page.mouse.move(dot.x, dot.y)
  await expect(panel.locator('.replay-chart-local-fill.is-insight')).toContainText('纯文本洞察 160')
  const tooltip = (await panel.locator('.replay-chart-local-fill.is-insight').boundingBox())!
  await page.mouse.move(tooltip.x + 20, tooltip.y + 20, { steps: 6 })
  await page.waitForTimeout(300)
  await expect(panel.locator('.replay-chart-local-fill.is-insight')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('insight-markers-and-trade-cards.png') })
  await page.mouse.move(10, 10)
  await expect(panel.locator('.replay-chart-local-fill')).toHaveCount(0)
  await slider.evaluate(
    (input, value) => {
      ;(input as HTMLInputElement).value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    },
    String(Date.parse(iso(90)) / 1000),
  )
  await expect(panel.locator('.replay-marker-insight')).toHaveCount(0)
  await expect(panel.locator('.replay-overall-insight')).toHaveCount(0)
  await expect(panel.getByRole('button', { name: '播放', exact: true })).toBeEnabled()
  await page.clock.install()
  await panel.getByRole('button', { name: '播放', exact: true }).click()
  await page.clock.runFor(1000)
  await expect(panel.locator('.replay-marker-insight')).toHaveCount(1)
  await expect(panel.locator('.replay-chart-local-fill')).toHaveCount(0)
  await expect(page.locator('.replay-insight-hover-surface')).toBeHidden()
})

test('chronological trade strip follows new trades, lets history stay put and resumes at the right edge', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'PC horizontal review')
  const { replayTrades, iso } = await import('./replay-fixtures')
  const { envelope } = await import('./auth-fixtures')
  await stubReplay(page)
  const trades = Array.from({ length: 40 }, (_, i) => ({
    ...replayTrades[0],
    id: `cycle-${i}`,
    sequence: i + 1,
    entry_candle_id: `c-${i * 4}`,
    exit_candle_id: `c-${i * 4 + 2}`,
    entry_at: iso(i * 4),
    exit_at: iso(i * 4 + 2),
    fills: [],
  }))
  await page.route(/\/api\/replays\/[^/?]+\/trades(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({ items: trades, page: 1, total_pages: 1, total: 40, size: 100 }),
    }),
  )
  await open(page)
  const panel = page.locator('.asset-detail-panel')
  const strip = panel.locator('.replay-trade-cards')
  const slider = panel.locator('.replay-timeline input')
  const button = panel.getByRole('button', { name: '回到最新交易', exact: true })
  const cards = strip.locator('.replay-trade-card')
  const geometry = () =>
    strip.evaluate((el) => ({
      left: el.scrollLeft,
      right: el.scrollWidth - el.clientWidth - el.scrollLeft,
    }))
  const left = () => strip.evaluate((el) => el.scrollLeft)
  const atRight = async () => Math.abs((await geometry()).right) < 2
  const scroll = async (value: number) => {
    await strip.evaluate((el, value) => el.scrollTo({ left: value, behavior: 'instant' }), value)
  }
  await expect.poll(atRight).toBe(true)
  await expect(cards).toHaveCount(20)
  await expect(cards.last()).toHaveAttribute('data-trade-id', 'cycle-39')
  const ids = await cards.evaluateAll((items) =>
    items.map((item) => Number((item as HTMLElement).dataset.tradeId!.split('-')[1])),
  )
  expect(ids).toEqual(Array.from({ length: 20 }, (_, i) => 20 + i))
  await expect(button).toHaveCount(0)
  await strip.scrollIntoViewIfNeeded()
  const stripTop = (await strip.boundingBox())!.y
  await scroll(0)
  await expect(button).toBeVisible()
  expect(Math.abs((await strip.boundingBox())!.y - stripTop)).toBeLessThan(1)
  await expect(cards.first()).toHaveAttribute('data-trade-id', 'cycle-0')
  // Explicit return has an actual intermediate position, then rejoins the edge.
  const distance = (await geometry()).right
  await button.click()
  await expect.poll(left).toBeGreaterThan(0)
  expect(await left()).toBeLessThan(distance - 2)
  await expect.poll(atRight).toBe(true)
  await expect(button).toHaveCount(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await slider.evaluate(
    (input, value) => {
      ;(input as HTMLInputElement).value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    },
    String(Date.parse(iso(40)) / 1000),
  )
  await expect(panel.locator('.replay-cards-heading h3')).toHaveText('交易 11')
  await expect.poll(atRight).toBe(true)
  const clockStart = Date.now()
  await page.clock.install({ time: clockStart })
  await page.clock.pauseAt(clockStart + 60_000)
  await panel.getByRole('button', { name: '播放', exact: true }).click()
  await page.clock.runFor(600)
  await expect.poll(atRight).toBe(true)
  const latestAtFollow = await cards.last().getAttribute('data-trade-id')
  expect(latestAtFollow).not.toBe('cycle-10')
  await scroll(0)
  await page.clock.runFor(50)
  await expect(button).toBeVisible()
  const historyLeft = await left()
  const cutoff = Number(await slider.inputValue())
  await page.clock.runFor(1000)
  expect(Number(await slider.inputValue())).toBeGreaterThan(cutoff)
  expect(await left()).toBe(historyLeft)
  await panel.getByRole('button', { name: '暂停', exact: true }).click()
  await panel.getByRole('button', { name: '播放', exact: true }).click()
  await page.clock.runFor(700)
  expect(await left()).toBe(historyLeft)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await button.click()
  await page.clock.runFor(350)
  await expect.poll(atRight).toBe(true)
  await page.clock.runFor(1500)
  await expect.poll(atRight).toBe(true)
  await expect(cards).toHaveCount(20)
  await expect(panel.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  // Reaching the edge by hand restores the same policy, with no button needed.
  await scroll(0)
  await page.clock.runFor(50)
  await expect(button).toBeVisible()
  await scroll(100000)
  await page.clock.runFor(50)
  await expect(button).toHaveCount(0)
  const before = await left()
  await page.clock.runFor(800)
  expect(await left()).toBeGreaterThan(before)
  await expect.poll(atRight).toBe(true)
  await strip.scrollIntoViewIfNeeded()
  await panel
    .locator('.replay-evidence')
    .screenshot({ path: test.info().outputPath('chronological-trades-following.png') })
})

test('desktop trade cards only locate the chart and independent dialogs show complete details', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'PC trade review')
  const { replayTrades, iso } = await import('./replay-fixtures')
  const { envelope } = await import('./auth-fixtures')
  const { calls } = await stubReplay(page)
  const returns = ['-0.0696', '-0.0520', '-0.1168', '-0.0564', '0.0365', '-0.1111', '0.1851']
  const profits = ['-69.60', '-51.62', '-115.38', '-55.10', '35.39', '-108.26', '178.32']
  const reason =
    'Close broke above prior 10-bar high (Livermore key-point breakout), with volume confirming the entry signal and risk controls satisfied.'
  const trades = returns.map((value, index) => {
    const entry = 20 + index * 20,
      exit = entry + 10
    return {
      ...replayTrades[0],
      id: `review-${index}`,
      sequence: index + 1,
      entry_candle_id: `c-${entry}`,
      exit_candle_id: `c-${exit}`,
      entry_at: iso(entry),
      exit_at: iso(exit),
      return_rate: value,
      net_pnl: profits[index],
      holding_seconds: 6220799,
      exit_reason: index === 6 ? 'end_of_test' : 'rule',
      quantity: '0.01513059',
      fills: replayTrades[0]!.fills.map((fill, i) => ({
        ...fill,
        id: `review-fill-${index}-${i}`,
        sequence: index * 2 + i,
        candle_id: `c-${i ? exit : entry}`,
        occurred_at: iso(i ? exit : entry),
        price: i ? '75606.66' : '63681.84',
        quantity: '0.01513059',
        fee: i ? '1.14397334' : '0.96354374',
        position_before: i ? '0.01513059' : '0',
        position_after: i ? '0' : '0.01513059',
        reason: i ? 'end_of_test' : reason,
      })),
    }
  })
  await page.route(/\/api\/replays\/[^/?]+\/trades(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({ items: trades, page: 1, size: 100, total: 7, total_pages: 1 }),
    }),
  )
  await page.setViewportSize({ width: 1600, height: 1000 })
  await open(page)
  const panel = page.locator('.asset-detail-panel')
  await panel.getByRole('button', { name: '全屏', exact: true }).click()
  await expect(panel.locator('.replay-trade-card')).toHaveCount(7)
  await panel.locator('[data-trade-id="review-6"]').click()
  await expect(panel.locator('.replay-trade-detail')).toHaveCount(0)
  await expect(page.locator('.replay-trade-dialog')).toHaveCount(0)
  await expect(panel.locator('.replay-cards-heading h3')).toHaveText('交易 7')
  const cutoff = await panel.locator('.replay-timeline input').inputValue()
  const chart = panel.locator('.replay-chart')
  const selected = panel.locator('[data-trade-id="review-6"]')
  const rangeBefore = await panel.locator('.replay-evidence-shade').boundingBox()
  const detailsEntry = panel.locator('[data-trade-details="review-5"]')
  const textColor = await detailsEntry.evaluate((el) => getComputedStyle(el).color)
  await detailsEntry.hover()
  await expect(detailsEntry).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(detailsEntry).not.toHaveCSS('color', textColor)
  const dialog = await openTradeDetails(page, 'review-5')
  await expect(page.locator('.app-modal-overlay').last()).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0.32)',
  )
  await expect(selected).toHaveAttribute('aria-pressed', 'true')
  await expect(panel.locator('.replay-timeline input')).toHaveValue(cutoff)
  expect(await panel.locator('.replay-evidence-shade').boundingBox()).toEqual(rangeBefore)
  await expect(dialog.locator('tbody tr')).toHaveCount(2)
  await expect(dialog.locator('thead th')).toHaveCount(8)
  await expect(dialog.locator('.replay-trade-dialog-metrics')).toContainText('-11.11%')
  await expect(dialog.locator('.replay-trade-dialog-metrics')).toContainText('71 天 23 小时')
  for (const label of ['毛利润', '手续费', '资金费用', '滑点成本'])
    await expect(dialog.locator('.replay-trade-dialog-metrics')).toContainText(label)
  await expect(dialog.locator('tbody tr').first()).toContainText('0.01513059')
  await expect(dialog.locator('tbody tr').first()).toContainText('0.96354374')
  await expect(dialog.locator('.replay-fill-reason').first()).toContainText(reason)
  await expect(dialog.locator('.replay-trade-facts')).toHaveCSS('border-top-width', '0px')
  const reasonCell = dialog.locator('.replay-fill-reason').first()
  await expect(reasonCell).toHaveCSS('text-overflow', 'ellipsis')
  expect(await reasonCell.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  for (const row of await dialog.locator('tbody tr').all())
    expect((await row.boundingBox())!.height).toBeLessThan(52)
  await reasonCell.hover()
  const reasonTooltip = page.locator('.replay-fill-reason-tooltip')
  await expect(reasonTooltip).toBeVisible()
  await expect(reasonTooltip.locator('[data-slot="text"]')).toHaveText(reason)
  await expect(reasonTooltip).toHaveCSS('z-index', '62')
  await page.screenshot({
    path: test.info().outputPath('trade-reason-hover.png'),
    animations: 'disabled',
  })
  await dialog.getByRole('heading', { name: '交易明细', exact: true }).hover()
  await expect(reasonTooltip).toBeHidden()
  await reasonCell.focus()
  await expect(reasonTooltip).toBeVisible()
  await expect(reasonCell).toHaveAttribute('aria-describedby', /tooltip/)
  await dialog.getByRole('button', { name: '关闭', exact: true }).focus()
  await expect(reasonTooltip).toBeHidden()
  await expect(dialog.getByRole('button', { name: /展开|费用/ })).toHaveCount(0)
  const dialogBox = (await dialog.boundingBox())!
  const closeBox = (await dialog.getByRole('button', { name: '关闭', exact: true }).boundingBox())!
  expect(dialogBox.x + dialogBox.width - closeBox.x - closeBox.width).toBeLessThan(32)
  await page.screenshot({
    path: test.info().outputPath('trade-detail-dialog.png'),
    animations: 'disabled',
  })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(panel).toBeVisible()
  await expect(panel).toHaveClass(/is-fullscreen/)
  await expect(panel.locator('[data-trade-details="review-5"]')).toBeFocused()
  await expect(selected).toHaveAttribute('aria-pressed', 'true')
  await expect(chart).toHaveAttribute('data-visible-end', cutoff)
  expect(await panel.locator('.replay-evidence-shade').boundingBox()).toEqual(rangeBefore)
  await panel
    .locator('.replay-evidence')
    .screenshot({ path: test.info().outputPath('trade-cards-only.png') })
  await openTradeDetails(page, 'review-5')
  await dialog.getByRole('button', { name: '询问 Agent', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(selected).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.replay-reference')).toContainText('#6')
  await panel
    .locator('.asset-detail-header')
    .getByRole('button', { name: '关闭', exact: true })
    .click()
  await page.getByRole('textbox', { name: '交易想法' }).fill('解释这笔交易')
  await page.getByRole('button', { name: '发送研究想法', exact: true }).click()
  await expect.poll(() => calls.filter((call) => call.method === 'send').length).toBe(1)
  expect(calls.find((call) => call.method === 'send')!.body.context).toMatchObject({
    trade_id: 'review-5',
  })
})

test('desktop trade cards keep visible endpoints fixed and bring off-screen ones into context without zoom', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'PC evidence inspection')
  const { replayInsights, replayTrades, iso } = await import('./replay-fixtures')
  const { envelope } = await import('./auth-fixtures')
  await stubReplay(page)
  // Equally spaced insight anchors measure rendered candle spacing across different dates.
  await page.route(/\/api\/replays\/[^/?]+\/insights(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({
        items: Array.from({ length: 9 }, (_, i) => ({
          ...replayInsights[1],
          id: `scale-${i}`,
          candle_id: `c-${(i + 1) * 20}`,
          evidence: null,
        })),
      }),
    }),
  )
  await page.route(/\/api\/replays\/[^/?]+\/trades(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({
        items: [
          ...replayTrades,
          {
            ...replayTrades[0],
            id: 'long-interval',
            sequence: 3,
            entry_candle_id: 'c-0',
            exit_candle_id: 'c-190',
            entry_at: iso(0),
            exit_at: iso(190),
            fills: replayTrades[0]!.fills.map((fill, i) => ({
              ...fill,
              id: `long-fill-${i}`,
              candle_id: `c-${i ? 190 : 0}`,
              occurred_at: iso(i ? 190 : 0),
            })),
          },
        ],
        page: 1,
        total_pages: 1,
      }),
    }),
  )
  await open(page)
  const panel = page.locator('.asset-detail-panel')
  const chart = panel.locator('.replay-chart')
  const slider = panel.locator('.replay-timeline input')
  await chart.scrollIntoViewIfNeeded()
  const spacing = async () => {
    const dots = await insightDots(chart)
    expect(dots.length).toBeGreaterThan(1)
    // A partially clipped circle can shift its detected center at either edge.
    const gaps = dots
      .slice(1)
      .map((dot, i) => dot.x - dots[i]!.x)
      .sort((a, b) => a - b)
    return gaps[Math.floor(gaps.length / 2)]!
  }
  const initialSpacing = await spacing()
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 3; i++) {
    const before = await spacing()
    await page.mouse.wheel(0, -100)
    await expect.poll(spacing).toBeGreaterThan(before + 2)
  }
  await expect.poll(spacing).toBeGreaterThan(initialSpacing + 5)
  const customSpacing = await spacing()
  for (const id of ['t-1', 't-2', 'long-interval', 't-1']) {
    await panel.locator(`[data-trade-id="${id}"]`).click()
    await expect(panel.locator(`[data-trade-id="${id}"]`)).toHaveAttribute('aria-pressed', 'true')
    await expect(slider).toHaveValue(String(Date.parse(iso(199)) / 1000))
    await expect(panel.locator('.replay-evidence-shade')).toBeVisible()
    await chart.scrollIntoViewIfNeeded()
    await expect.poll(async () => Math.abs((await spacing()) - customSpacing)).toBeLessThan(1.5)
    const plot = (await chart.locator('canvas').first().boundingBox())!
    const shade = (await panel.locator('.replay-evidence-shade').boundingBox())!
    // Each new target starts off-screen; reveal it with history on the left
    // and context on the right, without changing the user's candle spacing.
    expect(Math.abs((shade.x + shade.width - plot.x) / plot.width - 0.7)).toBeLessThan(0.01)
    if (id === 't-1') {
      await chart.screenshot({ path: test.info().outputPath('trade-revealed-from-left.png') })
    }
    if (id === 'long-interval') {
      expect(Math.abs(shade.x - plot.x)).toBeLessThan(2)
      await chart.screenshot({
        path: test.info().outputPath('trade-interval-keeps-user-scale.png'),
      })
    }
    await page.mouse.move(10, 10)
    const revealedAxis = await timeAxisImage(chart)
    await panel.locator(`[data-trade-id="${id}"]`).click()
    await expect(panel.locator(`[data-trade-id="${id}"]`)).toHaveAttribute('aria-pressed', 'false')
    await expect(panel.locator('.replay-evidence-shade')).toBeHidden()
    await expect(panel.locator('.replay-track-evidence')).toBeHidden()
    await expect(slider).toHaveValue(String(Date.parse(iso(199)) / 1000))
    await expect.poll(() => timeAxisImage(chart)).toBe(revealedAxis)
  }
  await panel.getByRole('button', { name: '回到最新', exact: true }).click()
  await page.waitForTimeout(320)
  await expect.poll(async () => Math.abs((await spacing()) - customSpacing)).toBeLessThan(1.5)
  // A broad overview stays fixed while comparing different trades.
  await chart.scrollIntoViewIfNeeded()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 16 && (await insightDots(chart)).length < 9; i++) {
    const before = await spacing()
    await page.mouse.wheel(0, 100)
    await expect.poll(spacing).toBeLessThan(before - 0.5)
  }
  await expect.poll(async () => (await insightDots(chart)).length).toBe(9)
  await page.mouse.move(10, 10)
  const overview = await timeAxisImage(chart)
  for (const id of ['t-1', 't-2', 'long-interval', 't-2']) {
    await panel.locator(`[data-trade-id="${id}"]`).click()
    await expect(panel.locator(`[data-trade-id="${id}"]`)).toHaveAttribute('aria-pressed', 'true')
    await expect(panel.locator('.replay-evidence-shade')).toBeVisible()
    await expect.poll(() => timeAxisImage(chart)).toBe(overview)
    await expect(slider).toHaveValue(String(Date.parse(iso(199)) / 1000))
  }
  await chart.screenshot({ path: test.info().outputPath('trade-overview-keeps-position.png') })
  // An open trade ends at the cutoff, not at its still-hidden future exit.
  await slider.evaluate(
    (input, value) => {
      ;(input as HTMLInputElement).value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    },
    String(Date.parse(iso(150)) / 1000),
  )
  await expect(chart).toHaveAttribute('data-visible-end', String(Date.parse(iso(150)) / 1000))
  // The cutoff updates before the canvas paints and corrects its price-axis width.
  // Compare the card click with the settled seek, not an intermediate frame.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      ),
  )
  const openTradeAxis = await timeAxisImage(chart)
  await panel.locator('[data-trade-id="long-interval"]').click()
  await expect(panel.locator('.replay-evidence-shade')).toBeVisible()
  await expect.poll(() => timeAxisImage(chart)).toBe(openTradeAxis)
  await expect(slider).toHaveValue(String(Date.parse(iso(150)) / 1000))
})

test('desktop insight inspection preserves the custom viewport and cutoff while the timeline seeks', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'PC insight selection')
  const { replayInsights, iso } = await import('./replay-fixtures')
  const { envelope } = await import('./auth-fixtures')
  await stubReplay(page)
  await page.route(/\/api\/replays\/[^/?]+\/insights(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({
        items: [
          {
            ...replayInsights[1],
            id: 'interval',
            candle_id: 'c-160',
            evidence: {
              entry_candle_id: 'c-130',
              exit_candle_id: 'c-160',
              trade_ids: ['t-2'],
              fill_ids: ['f-4'],
            },
          },
        ],
      }),
    }),
  )
  await open(page)
  const panel = page.locator('.asset-detail-panel'),
    chart = panel.locator('.replay-chart')
  const timeline = panel.locator('[data-event-id="insight:interval"]')
  const slider = panel.locator('.replay-timeline input')
  await panel.locator('[data-trade-id="t-2"]').click()
  await expect(panel.locator('[data-trade-id="t-2"]')).toHaveAttribute('aria-pressed', 'true')
  // Selecting an already-visible endpoint does not warrant a return control.
  await expect(panel.getByRole('button', { name: '回到最新', exact: true })).toBeHidden()
  await chart.scrollIntoViewIfNeeded()
  const box = (await chart.boundingBox())!
  const defaultAxis = await timeAxisImage(chart)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -50)
  await page.mouse.move(10, 10)
  await expect.poll(() => timeAxisImage(chart)).not.toBe(defaultAxis)
  const customAxis = await timeAxisImage(chart)
  await expect.poll(async () => (await insightDots(chart)).length).toBe(1)
  expect((await insightDots(chart))[0]!.active).toBe(false)
  const dot = (await insightDots(chart))[0]!
  expect(dot.width).toBeLessThanOrEqual(18)
  await page.mouse.move(dot.x, dot.y)
  await expect(panel.locator('.replay-chart-local-fill.is-insight')).toBeVisible()
  await expect(slider).toHaveValue(String(Date.parse(iso(199)) / 1000))
  await page.mouse.click(dot.x, dot.y)
  await expect(slider).toHaveValue(String(Date.parse(iso(199)) / 1000))
  await expect(panel.locator('.replay-trade-card[aria-pressed="true"]')).toHaveCount(0)
  await expect(panel.locator('.replay-evidence-shade')).toBeVisible()
  await expect.poll(async () => (await insightDots(chart))[0]?.active).toBe(true)
  await page.mouse.move(10, 10)
  await expect.poll(() => timeAxisImage(chart)).toBe(customAxis)
  await expect.poll(async () => Math.abs((await insightDots(chart))[0]!.x - dot.x)).toBeLessThan(2)
  await chart.screenshot({ path: test.info().outputPath('insight-anchored-interval.png') })
  // Lightweight Charts suppresses a second mouse click within its 500ms double-click window.
  await page.waitForTimeout(550)
  const activeDot = (await insightDots(chart))[0]!
  await page.mouse.move(activeDot.x, activeDot.y)
  await page.mouse.click(activeDot.x, activeDot.y)
  await expect(panel.locator('.replay-evidence-shade')).toBeHidden()
  await expect(slider).toHaveValue(String(Date.parse(iso(199)) / 1000))
  await expect.poll(async () => (await insightDots(chart))[0]?.active).toBe(false)
  await expect.poll(async () => Math.abs((await insightDots(chart))[0]!.x - dot.x)).toBeLessThan(2)
  await page.mouse.move(10, 10)
  await expect.poll(() => timeAxisImage(chart)).toBe(customAxis)
  // Seeking a selected insight clears selection and uses the common history anchor.
  await page.waitForTimeout(550)
  await page.mouse.click(dot.x, dot.y)
  await expect.poll(async () => (await insightDots(chart))[0]?.active).toBe(true)
  await timeline.click()
  await expect(slider).toHaveValue(String(Date.parse(iso(160)) / 1000))
  await expect(panel.locator('.replay-trade-card[aria-pressed="true"]')).toHaveCount(0)
  await expect(panel.locator('.replay-evidence-shade')).toBeHidden()
  await expect.poll(async () => (await insightDots(chart))[0]?.active).toBe(false)
  await page.mouse.move(10, 10)
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  const seekAxis = await timeAxisImage(chart)
  await timeline.click()
  await expect(panel.locator('.replay-evidence-shade')).toBeHidden()
  await page.mouse.move(10, 10)
  await expect.poll(() => timeAxisImage(chart)).toBe(seekAxis)
  await slider.evaluate(
    (input, value) => {
      ;(input as HTMLInputElement).value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    },
    String(Date.parse(iso(140)) / 1000),
  )
  await expect(timeline).toHaveCount(0)
  await expect.poll(async () => (await insightDots(chart)).length).toBe(0)
  await slider.evaluate(
    (input, value) => {
      ;(input as HTMLInputElement).value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    },
    String(Date.parse(iso(199)) / 1000),
  )
  await chart.scrollIntoViewIfNeeded()
  await expect.poll(async () => (await insightDots(chart))[0]?.active).toBe(false)
  await chart.screenshot({ path: test.info().outputPath('insight-hollow.png') })
})

test('fragmentary price and volume insights work without trades and single candles do not zoom', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'PC independent insight markers')
  const { replayInsights, iso } = await import('./replay-fixtures')
  const { envelope } = await import('./auth-fixtures')
  await stubReplay(page, { empty: true })
  await page.route(/\/api\/replays\/[^/?]+\/insights(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({
        items: [
          {
            ...replayInsights[1],
            id: 'price',
            candle_id: 'c-150',
            title: '单根 K 线观察',
            content: '这一根 K 线出现长下影线。',
            evidence: null,
          },
          {
            ...replayInsights[1],
            id: 'volume',
            candle_id: 'c-160',
            title: '成交量观察',
            content: '成交量高于近期均值。',
            evidence: { summary: '当前成交量为近期均值的 2.3 倍', volume_ratio: 2.3 },
          },
        ],
      }),
    }),
  )
  await open(page)
  const panel = page.locator('.asset-detail-panel'),
    chart = panel.locator('.replay-chart')
  const slider = panel.locator('.replay-timeline input')
  await chart.scrollIntoViewIfNeeded()
  await expect(panel.locator('.replay-trade-card')).toHaveCount(0)
  await expect.poll(async () => (await insightDots(chart)).length).toBe(2)
  const dots = await insightDots(chart)
  for (const [n, content] of [
    [0, '这一根 K 线出现长下影线。'],
    [1, '当前成交量为近期均值的 2.3 倍'],
  ] as const) {
    const dot = dots[n]!
    await page.mouse.move(dot.x, dot.y)
    const tooltip = panel.locator('.replay-chart-local-fill.is-insight')
    await expect(tooltip).toContainText(content)
    await expect
      .poll(async () => {
        const box = (await tooltip.boundingBox())!
        return box.y + box.height
      })
      .toBeLessThan(dot.y - 10)
    await page.mouse.click(dot.x, dot.y)
    await expect.poll(async () => (await insightDots(chart))[n]?.active).toBe(true)
    await expect(slider).toHaveValue(String(Date.parse(iso(199)) / 1000))
    const selectedRange = (await panel.locator('.replay-evidence-shade').boundingBox())!
    expect(selectedRange.width).toBeLessThan(20)
    for (const [i, position] of (await insightDots(chart)).entries())
      expect(Math.abs(position.x - dots[i]!.x)).toBeLessThan(2)
    await page.waitForTimeout(550)
  }
  await chart.screenshot({ path: test.info().outputPath('independent-volume-insight.png') })
  await panel.locator('[data-event-id="insight:volume"]').click()
  await expect(slider).toHaveValue(String(Date.parse(iso(160)) / 1000))
  await expect(panel.locator('.replay-evidence-shade')).toBeHidden()
  await expect.poll(async () => (await insightDots(chart)).every((dot) => !dot.active)).toBe(true)
  await expect(panel.locator('.replay-trade-card')).toHaveCount(0)
})

test('desktop insight inspection and deselection keep playback running without moving its anchor', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'PC chart inspection')
  const { replayInsights, iso } = await import('./replay-fixtures')
  const { envelope } = await import('./auth-fixtures')
  await stubReplay(page)
  await page.route(/\/api\/replays\/[^/?]+\/insights(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: envelope({
        items: [
          {
            ...replayInsights[1],
            id: 'interval',
            candle_id: 'c-100',
            evidence: {
              entry_candle_id: 'c-70',
              exit_candle_id: 'c-100',
            },
          },
        ],
      }),
    }),
  )
  await open(page)
  const panel = page.locator('.asset-detail-panel'),
    chart = panel.locator('.replay-chart')
  const slider = panel.locator('.replay-timeline input')
  await slider.evaluate(
    (input, value) => {
      ;(input as HTMLInputElement).value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    },
    String(Date.parse(iso(120)) / 1000),
  )
  await expect(panel.getByRole('button', { name: '播放', exact: true })).toBeEnabled()
  const clockStart = Date.now()
  await page.clock.install({ time: clockStart })
  await page.clock.pauseAt(clockStart + 60_000)
  await panel.getByRole('button', { name: '播放', exact: true }).click()
  await chart.scrollIntoViewIfNeeded()
  await page.clock.runFor(100)
  const before = Number(await slider.inputValue())
  const dot = (await insightDots(chart))[0]!
  await page.mouse.click(dot.x, dot.y)
  await page.clock.runFor(100)
  await expect(panel.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  await expect.poll(async () => (await insightDots(chart))[0]?.active).toBe(true)
  expect(Number(await slider.inputValue())).toBeGreaterThanOrEqual(before)
  await expect.poll(async () => Math.abs((await insightDots(chart))[0]!.x - dot.x)).toBeLessThan(2)
  await page.clock.runFor(1200)
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(before)
  await expect.poll(async () => Math.abs((await insightDots(chart))[0]!.x - dot.x)).toBeLessThan(2)
  const later = Number(await slider.inputValue())
  await page.mouse.click(dot.x, dot.y)
  await page.clock.runFor(100)
  await expect.poll(async () => (await insightDots(chart))[0]?.active).toBe(false)
  await expect(panel.locator('.replay-evidence-shade')).toBeHidden()
  await page.clock.runFor(1200)
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(later)
  await expect(panel.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  await panel.locator('[data-event-id="insight:interval"]').click()
  await page.clock.runFor(100)
  await expect(slider).toHaveValue(String(Date.parse(iso(100)) / 1000))
  await expect(panel.getByRole('button', { name: '播放', exact: true })).toBeVisible()
})
