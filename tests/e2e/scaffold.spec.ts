import { expect, test } from '@playwright/test'
import {
  stubHistory,
  anonymous,
  authResponse,
  envelope,
  settingsTrigger,
  stubGoogle,
} from './auth-fixtures'
test.beforeEach(async ({ page }) => {
  await page
    .context()
    .addCookies([{ name: 'trade-locale-manual', value: 'zh-CN', url: 'http://localhost:6002' }])
  await stubHistory(page)
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
  isMobile,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'warning' && /hydration/i.test(message.text()))
      errors.push(message.text())
  })
  const response = await request.get('/zh-CN')
  expect(response.ok()).toBeTruthy()
  expect(await response.text()).toContain('3 分钟')
  await page.goto('/zh-CN')
  await expect(page.getByRole('heading', { name: /3 分钟，\s*验证你的交易想法。/ })).toBeVisible()
  await expect(page.locator('.process-steps > li')).toHaveCount(3)
  const landingInput = (await page.locator('.research-composer').boundingBox())!
  const process = (await page.locator('.landing-process').boundingBox())!
  expect(process.x + process.width / 2).toBeCloseTo(landingInput.x + landingInput.width / 2, 0)
  if (!isMobile) {
    expect(landingInput.width).toBe(736)
    expect(process.width).toBe(960)
  }
  const hypothesis = page.locator('.process-hypothesis')
  await hypothesis.scrollIntoViewIfNeeded()
  await expect(hypothesis).toHaveClass(/is-visible/)
  const seed = (await hypothesis.boundingBox())!
  const build = (await page.locator('.process-steps > li').first().boundingBox())!
  const learn = (await page.locator('.process-steps > li').last().boundingBox())!
  const returnLine = (await page.locator('.process-return-line').boundingBox())!
  expect(seed.y + seed.height).toBeLessThan(build.y)
  if (isMobile) {
    expect(returnLine.y).toBeGreaterThan(build.y)
    expect(returnLine.y).toBeLessThan(build.y + build.height)
  } else {
    expect(returnLine.y).toBeGreaterThan(build.y + build.height)
    expect(returnLine.x).toBeCloseTo(build.x + build.width / 2, 0)
    expect(returnLine.x + returnLine.width).toBeCloseTo(learn.x + learn.width / 2, 0)
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.process-idea-spark svg')).toHaveCSS('animation-name', 'none')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  if (isMobile) await page.getByRole('button', { name: '菜单', exact: true }).click()
  await page.getByRole('link', { name: '工作台', exact: true }).first().click()
  await expect(page).toHaveURL(/\/new-task$/)
  await expect(page.getByRole('heading', { name: '今天，想验证什么？' })).toBeVisible()
  if (!isMobile) expect((await page.locator('.research-composer').boundingBox())!.width).toBe(736)
  await page.screenshot({
    path: `/tmp/trade-entry-new-task-${isMobile ? 'mobile' : 'desktop'}.png`,
    fullPage: true,
  })
  await page.goto('/conversations/01K4ABCDE00000000000000001')
  await expect(page.locator('.chat-input .research-composer')).toBeVisible()
  if (!isMobile)
    expect((await page.locator('.chat-input .research-composer').boundingBox())!.width).toBe(736)
  expect(errors).toEqual([])
})

test('typing and examples preserve drafts without creating research', async ({ page }) => {
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
  await page.reload()
  await expect(input).toHaveValue('测试我的研究假设')
  expect(writes).toEqual([])
})

test('workspace assets show a real empty state and preserve the conversation draft', async ({
  page,
}) => {
  await page.goto('/conversations/01K4ABCDE00000000000000001')
  await page.getByRole('textbox', { name: '交易想法' }).fill('保持草稿')
  await page.getByRole('button', { name: '查看资产' }).click()
  await expect(page.getByText('暂无资产。')).toBeVisible()
  await expect(page.getByRole('button', { name: '全屏', exact: true })).toBeHidden()
  await page.getByRole('button', { name: '查看资产' }).click()
  await expect(page.getByRole('textbox', { name: '交易想法' })).toHaveValue('保持草稿')
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
  await page.getByRole('button', { name: '界面语言', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'English', exact: true }).click()
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
    ['/zh-CN', /3 分钟，\s*验证你的交易想法。/],
    ['/new-task', '今天，想验证什么？'],
    ['/login', '登录或注册'],
    ['/conversations/01K4ABCDE00000000000000001', null],
  ] as const
  for (const [path, title] of routes) {
    const response = await page.goto(path)
    expect(response?.status()).toBe(200)
    if (title) await expect(page.getByRole('heading', { name: title })).toBeVisible()
    else await expect(page.getByRole('textbox', { name: '交易想法' })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy()
  }
  expect(errors).toEqual([])
})
