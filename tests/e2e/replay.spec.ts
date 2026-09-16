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
test('full-width chart, frozen strategy return, evidence, context retry and report/download', async ({
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
  await expect(panel.getByText('整体预览', { exact: true })).toBeVisible()
  await panel.getByRole('tab', { name: /洞察/ }).click()
  await panel.getByRole('button', { name: /趋势区间表现更好/ }).click()
  await expect(panel.getByText('第一次交易验证趋势信号')).toBeVisible()
  await expect(panel.locator('.replay-evidence-shade')).toBeVisible()
  await panel.getByRole('button', { name: '关联交易', exact: true }).click()
  await expect(panel.locator('.replay-trade-detail')).toBeVisible()
  await panel.getByRole('button', { name: '成交明细', exact: true }).click()
  await expect(panel.locator('.replay-fill-row')).toHaveCount(2)
  await panel.getByRole('button', { name: '询问 Agent', exact: true }).click()
  await expect(page.locator('.replay-reference')).toContainText('BTC 均线验证')
  if (!isMobile) await panel.getByRole('button', { name: '关闭', exact: true }).click()
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
  await panel.getByRole('button', { name: '更多回测操作' }).click()
  await page.getByRole('menuitem', { name: '研究报告' }).click()
  await expect(page.getByRole('dialog').getByText('净收益为 199 USDT。')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: '更多回测操作' }).click()
  await page.getByRole('menuitem', { name: '下载运行包' }).click()
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
  expect(request).toMatchObject({ strategy_node_id: 'node-old', source_replay_id: 'replay-1' })
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
  await expect(panel.getByText('已暂停', { exact: true })).toBeVisible()
  await expect(panel.getByText('反向信号触发止损', { exact: true })).toBeHidden()
  await panel.getByRole('button', { name: '下个事件', exact: true }).click()
  await expect(panel.locator('.replay-current-state')).toContainText('做多')
  await panel.getByRole('button', { name: '查看完整结果', exact: true }).click()
  await expect(panel.getByRole('img', { name: 'BTC/USDT 4h K 线图' })).toBeVisible()
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
}) => {
  await stubReplay(page, { empty: true, failCandles: true })
  await open(page, false)
  await expect(page.getByRole('button', { name: '4h', exact: true })).toBeHidden()
  await page
    .locator('.replay-inline-error')
    .getByRole('button', { name: '重试', exact: true })
    .click()
  await expect(page.locator('.replay-inline-error')).toHaveCount(0)
  await page.getByRole('tab', { name: /交易/ }).click()
  await expect(page.getByText('没有触发交易', { exact: true })).toBeVisible()
  await page.goto('/open-source')
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
  await page.getByRole('tab', { name: /洞察/ }).click()
  await expect(page.getByRole('button', { name: '最大盈利', exact: true })).toBeVisible({
    timeout: 60_000,
  })
  await page.locator('.replay-timeline input').press('End')
  await expect(page.locator('.replay-current-state')).toBeVisible()
  await page.getByRole('tab', { name: /交易/ }).click()
  await expect(page.locator('.replay-trade-row')).toHaveCount(20)
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
  // The timeline must resolve the earlier real bar, not a clamped window edge.
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
  await expect
    .poll(async () => Number(await page.locator('.replay-timeline input').inputValue()))
    .toBeLessThan(Date.parse(iso(count - 600)) / 1000)
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
