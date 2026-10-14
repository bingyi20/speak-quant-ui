import { expect, test, type Page } from '@playwright/test'
import { authResponse, envelope, settingsTrigger, stubHistory } from './auth-fixtures'
import { billingAccount } from './billing-fixtures'
import { creditLedgerRow, stubCreditHistory } from './credit-history-fixtures'

test.beforeEach(async ({ page }) => {
  await stubHistory(page)
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ json: envelope(authResponse) }),
  )
})

async function openSettings(page: Page) {
  await page.goto('/conversations/preview')
  await (await settingsTrigger(page)).click()
  const dialog = page.getByRole('dialog', { name: /账户设置|Account settings/ })
  await expect(dialog.getByRole('heading', { name: '常规', exact: true })).toBeVisible()
  return dialog
}

test('credit history loads lazily and pages each public action with its historical source', async ({
  page,
}) => {
  const state = await stubCreditHistory(page)
  await page.route('**/api/billing/account', (route) =>
    route.fulfill({ json: envelope(billingAccount('max')) }),
  )
  const dialog = await openSettings(page)
  expect(state.requests).toEqual([])
  await dialog.getByRole('tab', { name: '消耗记录', exact: true }).click()
  const rows = dialog.locator('.credit-history-row')
  await expect(rows).toHaveCount(20)
  expect(state.requests).toEqual([
    {
      method: 'GET',
      path: '/api/credits/ledger',
      query: [
        ['page', '1'],
        ['size', '20'],
      ],
    },
  ])
  await expect(rows.nth(0)).toContainText('积分消耗')
  await expect(rows.nth(0).getByText('-37.25', { exact: true })).toBeVisible()
  await expect(rows.nth(0)).not.toContainText('2,362.75')
  await expect(rows.nth(0).locator('.credit-history-date')).toHaveText(/^2026\.10\.13 \d{2}:01:20$/)
  await expect(dialog.locator('.credit-history-summary')).toContainText('Max')
  for (const [index, label] of [
    [1, '新用户注册奖励'],
    [2, '积分加购'],
    [3, '订阅 Basic 套餐'],
    [4, '订阅 Pro 套餐'],
    [5, '订阅 Max 套餐'],
    [6, '积分补偿'],
    [7, '积分发放'],
    [8, '过期预占回收'],
    [9, '积分到期'],
    [10, '套餐升级回收'],
    [11, '权益撤销'],
    [12, '权益恢复'],
  ] as const) {
    await expect(rows.nth(index).locator('.credit-history-activity')).toHaveText(label)
  }
  await expect(rows.nth(1).locator('.credit-history-number')).toHaveText('+3,000')
  await expect(rows.nth(1).locator('.credit-history-number')).toHaveClass(/is-increase/)
  await expect(rows.nth(2).locator('.credit-history-number')).toHaveText('+6,666')
  await expect(rows.nth(3).locator('.credit-history-number')).toHaveText('+8,000')
  await expect(rows.nth(4).locator('.credit-history-number')).toHaveText('+30,000')
  await expect(rows.nth(5).locator('.credit-history-number')).toHaveText('+130,000')
  await expect(rows.nth(0).locator('.credit-history-number')).not.toHaveClass(/is-increase/)
  await expect(rows.filter({ hasText: '积分预占' })).toHaveCount(0)
  await expect(rows.filter({ hasText: '解除预占' })).toHaveCount(0)
  const colors = await rows.evaluateAll((elements) => ({
    decrease: getComputedStyle(elements[0]!.querySelector('.credit-history-number')!).color,
    increase: getComputedStyle(elements[1]!.querySelector('.credit-history-number')!).color,
  }))
  expect(colors.increase).not.toBe(colors.decrease)
  const [red, green, blue] = colors.increase.match(/[\d.]+/g)!.map(Number)
  expect(red!).toBeGreaterThan(green!)
  expect(green!).toBeGreaterThan(blue!)
  const activityLayout = await rows.first().evaluate((element) => {
    const activity = element.querySelector('.credit-history-activity')!.getBoundingClientRect()
    const date = element.querySelector('.credit-history-date')!.getBoundingClientRect()
    const amount = element.querySelector('.credit-history-number')!.getBoundingClientRect()
    return { activity, date, amount }
  })
  expect(activityLayout.date.top).toBeGreaterThanOrEqual(activityLayout.activity.bottom)
  expect(activityLayout.amount.left).toBeGreaterThan(activityLayout.activity.right)
  await expect(rows.getByRole('button')).toHaveCount(0)
  await expect(dialog.locator('table, .credit-history-description')).toHaveCount(0)
  await expect(dialog.getByText('消耗记录即将开放')).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('credit-history-simple-list.png') })
  await dialog.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(rows).toHaveCount(2)
  await expect(dialog.getByRole('button', { name: '下一页', exact: true })).toBeDisabled()
  expect(state.requests.at(-1)?.query).toEqual([
    ['page', '2'],
    ['size', '20'],
  ])
  await dialog.getByRole('button', { name: '上一页', exact: true }).click()
  await expect(rows).toHaveCount(20)
  await expect(dialog.getByRole('button', { name: '上一页', exact: true })).toBeDisabled()
  expect(state.requests.every((request) => request.method === 'GET')).toBe(true)
  expect(state.requests.every((request) => request.path === '/api/credits/ledger')).toBe(true)
  await expect(page).toHaveURL(/\/conversations\/preview$/)
})

test('English action names preserve historical subscription tiers and unknown action fallback', async ({
  page,
}) => {
  const state = await stubCreditHistory(page)
  state.pages = [
    [
      ...state.pages[0]!.slice(0, 13),
      creditLedgerRow('future_credit_adjustment', {
        id: 'ledger-unknown',
        credits_delta: '25',
        reserved_delta: '0',
        charge_id: null,
        attempt_key: null,
      }),
    ],
  ]
  await page.route('**/api/billing/account', (route) =>
    route.fulfill({ json: envelope(billingAccount('max')) }),
  )
  const dialog = await openSettings(page)
  await dialog.getByRole('button', { name: '语言', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'English', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'General', exact: true })).toBeVisible()
  await dialog.getByRole('tab', { name: 'Usage history', exact: true }).click()
  const rows = dialog.locator('.credit-history-row')
  await expect(rows).toHaveCount(14)
  await expect(dialog.locator('.credit-history-summary')).toContainText('Max')
  await expect(rows.locator('.credit-history-activity')).toHaveText([
    'Credits used',
    'New user registration bonus',
    'Credit top-up',
    'Basic subscription',
    'Pro subscription',
    'Max subscription',
    'Credit compensation',
    'Credits granted',
    'Expired reservation removed',
    'Credits expired',
    'Credits replaced on upgrade',
    'Credits revoked',
    'Credits restored',
    'Other activity',
  ])
  await expect(rows.last().locator('.credit-history-number')).toHaveText('+25')
  await expect(rows.getByRole('button')).toHaveCount(0)
  expect(state.requests).toHaveLength(1)
  expect(state.requests[0]?.path).toBe('/api/credits/ledger')
  expect(state.requests[0]?.method).toBe('GET')
})

test('empty credit history is a real empty state with no pagination or placeholder', async ({
  page,
}) => {
  const state = await stubCreditHistory(page)
  state.pages = []
  const dialog = await openSettings(page)
  await dialog.getByRole('tab', { name: '消耗记录', exact: true }).click()
  await expect(dialog.getByText('暂无积分记录', { exact: true })).toBeVisible()
  await expect(dialog.locator('.credit-history-row')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '下一页', exact: true })).toHaveCount(0)
  await expect(dialog.getByText('消耗记录即将开放')).toHaveCount(0)
  expect(state.requests).toHaveLength(1)
})

test('ledger read failures show a retry and recover without losing the surrounding conversation', async ({
  page,
}) => {
  const state = await stubCreditHistory(page)
  state.ledgerFailures = 1
  const dialog = await openSettings(page)
  await dialog.getByRole('tab', { name: '消耗记录', exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(dialog.locator('.credit-history-row')).toHaveCount(0)
  await dialog.getByRole('button', { name: '重试', exact: true }).click()
  await expect(dialog.locator('.credit-history-row')).toHaveCount(20)
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  expect(state.requests).toHaveLength(2)
  await expect(page).toHaveURL(/\/conversations\/preview$/)
})

test('closing the usage panel discards its delayed private ledger response', async ({ page }) => {
  const state = await stubCreditHistory(page)
  let release!: () => void
  state.ledgerDelays.set(
    1,
    new Promise<void>((resolve) => {
      release = resolve
    }),
  )
  try {
    const dialog = await openSettings(page)
    await dialog.getByRole('tab', { name: '消耗记录', exact: true }).click()
    await expect.poll(() => state.requests.length).toBe(1)
    await expect(dialog.locator('.credit-history-row')).toHaveCount(0)
    await dialog.getByRole('tab', { name: '常规', exact: true }).click()
    await expect(dialog.getByRole('heading', { name: '常规', exact: true })).toBeVisible()
    state.ledgerDelays.delete(1)
    state.pages[0] = [creditLedgerRow('restore', { id: 'new-panel', credits_delta: '42' })]
    await dialog.getByRole('tab', { name: '消耗记录', exact: true }).click()
    await expect(dialog.locator('.credit-history-row')).toHaveCount(1)
    await expect(dialog.locator('.credit-history-number')).toHaveText('+42')
    release()
    await expect(dialog.locator('.credit-history-number')).toHaveText('+42')
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await expect(dialog).toBeHidden()
    await (await settingsTrigger(page)).click()
    await expect(dialog.getByRole('heading', { name: '常规', exact: true })).toBeVisible()
    await dialog.getByRole('tab', { name: '消耗记录', exact: true }).click()
    await expect(dialog.locator('.credit-history-row')).toHaveCount(1)
    await expect(dialog.locator('.credit-history-number')).toHaveText('+42')
    expect(state.requests.every((request) => request.path === '/api/credits/ledger')).toBe(true)
  } finally {
    release()
  }
})

test('English history preserves large fractional values and fits the settings panel on desktop and mobile', async ({
  page,
}) => {
  const state = await stubCreditHistory(page)
  state.pages = [
    [
      creditLedgerRow('consume', {
        credits_delta: '-12345678901234567890.125',
        balance_after: '90071992547409931234567890.125',
        reserved_after: '0.025',
      }),
    ],
  ]
  const dialog = await openSettings(page)
  await dialog.getByRole('button', { name: '语言', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'English', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'General', exact: true })).toBeVisible()
  await dialog.getByRole('tab', { name: 'Usage history', exact: true }).click()
  const row = dialog.locator('.credit-history-row')
  await expect(row.getByText('-12,345,678,901,234,567,890.125', { exact: true })).toBeVisible()
  await expect(row).not.toContainText('90,071,992,547,409,931,234,567,890.1')
  await expect(row).toContainText('Credits used')
  await expect(row.getByRole('button')).toHaveCount(0)
  await expect(row.locator('.credit-history-date')).toHaveText(/^2026\.10\.13 \d{2}:01:00$/)
  await test.info().attach('history-layout.json', {
    body: JSON.stringify(
      await dialog.evaluate((element) => {
        const history = element.querySelector('.credit-history')!
        const list = element.querySelector('.credit-history-list')!
        const panel = element.querySelector('.settings-panel')!
        return {
          dialog: [element.clientWidth, element.scrollWidth],
          panel: [panel.clientWidth, panel.scrollWidth],
          containerType: getComputedStyle(history).containerType,
          list: [list.clientWidth, list.scrollWidth],
        }
      }),
      null,
      2,
    ),
    contentType: 'application/json',
  })
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect(
    await dialog
      .locator('.settings-panel')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true)
  const overflowingNumbers = await row.locator('.credit-history-number').evaluateAll((cells) =>
    cells.flatMap((cell) => {
      const bounds = cell.getBoundingClientRect()
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
      const overflow: { text: string; left: number; right: number; width: number }[] = []
      while (walker.nextNode()) {
        const node = walker.currentNode
        if (!node.textContent?.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const line of range.getClientRects()) {
          if (line.width && (line.left < bounds.left - 1 || line.right > bounds.right + 1)) {
            overflow.push({
              text: node.textContent.trim(),
              left: line.left - bounds.left,
              right: line.right - bounds.left,
              width: bounds.width,
            })
          }
        }
      }
      return overflow
    }),
  )
  expect(overflowingNumbers).toEqual([])
  await page.screenshot({ path: test.info().outputPath('credit-history-long-values.png') })
  expect(state.requests.every((request) => request.path === '/api/credits/ledger')).toBe(true)
})
