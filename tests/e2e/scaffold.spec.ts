import { expect, test } from '@playwright/test'
import { anonymous, authResponse, envelope, settingsTrigger, stubGoogle } from './auth-fixtures'
test.beforeEach(async ({ page }) => {
  await stubGoogle(page)
  await page.route('**/api/auth/google/config', (route) =>
    route.fulfill({ json: envelope({ client_id: 'test', nonce: 'test' }) }),
  )
  await page.route('**/api/auth/refresh', (route) => {
    const login = route.request().headers().referer?.includes('/login')
    return route.fulfill({
      status: login ? 401 : 200,
      json: login ? anonymous : envelope(authResponse),
    })
  })
})

test('public landing renders on the server and links into the workspace', async ({
  page,
  request,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'warning' && /hydration/i.test(message.text()))
      errors.push(message.text())
  })
  const response = await request.get('/')
  expect(response.ok()).toBeTruthy()
  expect(await response.text()).toContain('让每一个想法')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /让每一个想法，\s*经得起验证。/ })).toBeVisible()
  await page.getByRole('link', { name: '进入工作台' }).first().click()
  await expect(page).toHaveURL(/\/new-task$/)
  await expect(page.getByRole('heading', { name: '今天，想验证什么？' })).toBeVisible()
  expect(errors).toEqual([])
})

test('draft survives navigation/reload without fake research creation', async ({ page }) => {
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && !request.url().endsWith('/auth/refresh'))
      writes.push(request.url())
  })
  await page.goto('/new-task')
  await page.getByRole('button', { name: '趋势跟随' }).click()
  const input = page.getByRole('textbox', { name: '交易想法' })
  await expect(input).toHaveValue(/BTC/)
  await input.fill('测试我的研究假设')
  await input.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: '想法已保存在本标签页' })).toBeVisible()
  await page.reload()
  await expect(input).toHaveValue('测试我的研究假设')
  expect(writes).toEqual([])
})

test('workspace panels switch and close while keeping the conversation', async ({ page }) => {
  await page.goto('/conversations/preview')
  await page.getByRole('button', { name: '查看资产' }).click()
  await page.getByRole('button', { name: '当前策略 查看策略设计与历史' }).click()
  await expect(page.getByText('策略形成后，设计文档将在这里展示。')).toBeVisible()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByRole('button', { name: 'Replay 回看历史交易与研究证据' }).click()
  await expect(page.getByText('回测完成后，在这里查看图表、交易与洞察。')).toBeVisible()
  await page.getByRole('button', { name: '全屏', exact: true }).click()
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.getByRole('heading', { name: '为你的研究，留一处空间。' })).toBeVisible()
  await page.getByRole('button', { name: '查看资产' }).click()
  await expect(page.getByText('回测完成后，在这里查看图表、交易与洞察。')).toBeVisible()
})

test('settings modal saves language, restores focus, and contains no tokens', async ({
  page,
  isMobile,
}) => {
  await page.goto('/new-task')
  const trigger = await settingsTrigger(page)
  await trigger.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await page.getByLabel('界面语言').selectOption('en-US')
  await expect(page.getByRole('heading', { name: 'Profile & preferences' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(
    isMobile
      ? page.locator('.workspace-expand')
      : page.getByRole('button', { name: 'Profile & preferences' }).filter({ visible: true }),
  ).toBeFocused()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'What will you explore today?' })).toBeVisible()
  const values = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }))
  expect(JSON.stringify(values)).not.toMatch(/access_token|refresh_token|Bearer/)
})

test('all routes return 200, show the correct page, and have no horizontal overflow', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const routes = [
    ['/', /让每一个想法，\s*经得起验证。/],
    ['/new-task', '今天，想验证什么？'],
    ['/login', '登录或注册'],
    ['/conversations/preview', '为你的研究，留一处空间。'],
  ] as const
  for (const [path, title] of routes) {
    const response = await page.goto(path)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy()
  }
  expect(errors).toEqual([])
})
