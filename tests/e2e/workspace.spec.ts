import { expect, test } from '@playwright/test'
import { authResponse, envelope, settingsTrigger } from './auth-fixtures'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ json: envelope(authResponse) }),
  )
})

test('research examples are cards and fill the focused composer without sending a request', async ({
  page,
}) => {
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && !request.url().endsWith('/auth/refresh'))
      writes.push(request.url())
  })
  await page.goto('/new-task')
  await expect(page.locator('.new-task-inner .brand')).toHaveCount(0)
  await expect(page.getByText('一个假设，就是研究的起点。')).toHaveCount(0)
  await expect(page.getByText('Enter 发送 · Shift + Enter 换行')).toHaveCount(0)
  await page.getByRole('button', { name: '趋势跟随' }).click()
  await expect(page.getByRole('textbox', { name: '交易想法' })).toBeFocused()
  await expect(page.getByRole('textbox', { name: '交易想法' })).toHaveValue(/BTC/)
  expect(writes).toEqual([])
})

test('collapsed sidebar previews without shifting content, pins on click and preserves preference', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Hover preview is for desktop pointer devices')
  await page.goto('/new-task')
  const main = page.locator('.workspace-main')
  const sidebar = page.locator('.workspace-sidebar')
  await expect.poll(async () => (await main.boundingBox())?.x).toBe(300)
  const expandedNavigation = await sidebar.locator('.new-research').boundingBox()
  const expandedProfile = await sidebar.locator('.account-trigger').boundingBox()
  await page.getByRole('button', { name: '收起侧栏' }).click()
  const expand = page.locator('.workspace-expand')
  // The preview immediately replaces this button under the pointer.
  const hoverExpand = async () => {
    const bounds = await expand.boundingBox()
    expect(bounds).not.toBeNull()
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
  }
  await expect(expand).toBeVisible()
  await expect(page.locator('.workspace-sidebar')).toBeHidden()
  const collapsed = await main.boundingBox()
  expect(collapsed!.x).toBe(0)
  await hoverExpand()
  await expect.poll(async () => (await sidebar.boundingBox())?.x).toBe(0)
  const previewBounds = await sidebar.boundingBox()
  expect(previewBounds).toMatchObject({
    x: 0,
    y: 0,
    width: 300,
    height: page.viewportSize()!.height,
  })
  await expect(sidebar.getByRole('link', { name: 'Trade Lab' })).toHaveCount(0)
  expect(await sidebar.locator('.new-research').boundingBox()).toEqual(expandedNavigation)
  expect(await sidebar.locator('.account-trigger').boundingBox()).toEqual(expandedProfile)
  expect(await main.boundingBox()).toEqual(collapsed)
  await page.locator('.sidebar-history').hover()
  await expect(page.locator('.workspace-sidebar')).toBeVisible()
  await page.getByRole('heading', { name: '今天，想验证什么？' }).hover()
  await expect(page.locator('.workspace-sidebar')).toBeHidden()
  await hoverExpand()
  await sidebar.getByRole('button', { name: '展开侧栏' }).click()
  await expect(page.locator('.workspace-shell')).not.toHaveClass(/sidebar-collapsed/)
  await expect.poll(async () => (await main.boundingBox())?.x).toBe(300)
  await expect(sidebar.getByRole('link', { name: 'Trade Lab' })).toBeVisible()
  await page.getByRole('button', { name: '收起侧栏' }).click()
  await page.reload()
  await expect(page.locator('.workspace-shell')).toHaveClass(/sidebar-collapsed/)
  await expand.press('ArrowDown')
  await expect(page.locator('.workspace-sidebar')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.workspace-sidebar')).toBeHidden()
  await expect(expand).toBeFocused()
})

test('conversation toolbar provides title and new research while collapsed', async ({
  page,
  isMobile,
}) => {
  await page.goto('/conversations/example')
  const shortcut = page.locator('.new-task-shortcut')
  if (!isMobile) {
    await expect(shortcut).toHaveCount(0)
    await page.getByRole('button', { name: '收起侧栏' }).click()
    await expect(shortcut).toBeVisible()
    await page.locator('.workspace-expand').press('Enter')
    await expect(shortcut).toHaveCount(0)
    await page.getByRole('button', { name: '收起侧栏' }).click()
  } else {
    await expect(shortcut).toBeVisible()
    await page.locator('.workspace-expand').click()
    await expect(shortcut).toHaveCount(0)
    await page.keyboard.press('Escape')
  }
  await expect(shortcut).toBeVisible()
  await expect(page.locator('.workspace-conversation-title')).toHaveText('研究工作台')
  await page.locator('.new-task-shortcut').click()
  await expect(page).toHaveURL((url) => url.pathname === '/new-task')
  await expect(page.locator('.workspace-conversation-title')).toHaveCount(0)
  await expect(page.locator('.new-task-shortcut')).toHaveCount(0)
  await expect(page.locator('.workspace-expand')).toBeVisible()
})

test('profile uses account details and falls back to a default image on load failure', async ({
  page,
}) => {
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      json: envelope({
        ...authResponse,
        user: {
          ...authResponse.user,
          display_name: '',
          avatar_url: 'http://localhost:6002/missing-avatar.png',
        },
      }),
    }),
  )
  await page.route('**/missing-avatar.png', (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto('/new-task')
  const profile = await settingsTrigger(page)
  await expect(profile).toContainText('tester@example.com')
  await expect(profile.locator('img')).toHaveAttribute('src', '/avatar-default.svg')
  await profile.click()
  await expect(page.getByRole('heading', { name: '个人信息与偏好' })).toBeVisible()
})

test('mobile navigation has one brand header and a working close button', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile drawer header')
  await page.goto('/new-task')
  const expand = page.locator('.workspace-expand')
  await expand.click()
  const nav = page.locator('.mobile-navigation')
  await expect(
    nav.locator('.sidebar-top').getByRole('link', { name: 'Trade Lab', exact: true }),
  ).toBeVisible()
  await expect(nav.locator('.brand')).toHaveCount(1)
  await expect(page.getByRole('dialog').locator('[data-slot="header"]')).toHaveCount(0)
  await expect(page.getByText('你的研究，将从这里开始。', { exact: true })).not.toBeVisible()
  await nav.locator('.sidebar-top').getByRole('button', { name: '关闭', exact: true }).click()
  await expect(nav).toBeHidden()
  await expect(expand).toBeFocused()
})
