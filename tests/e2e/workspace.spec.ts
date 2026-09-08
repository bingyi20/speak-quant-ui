import { expect, test } from '@playwright/test'
import { stubHistory, authResponse, envelope, settingsTrigger } from './auth-fixtures'

test.beforeEach(async ({ page }) => {
  await stubHistory(page)
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
  await expect.poll(async () => (await main.boundingBox())?.x).toBe(260)
  const expandedNavigation = await sidebar.locator('.new-research').boundingBox()
  const expandedProfile = await sidebar.locator('.account-trigger').boundingBox()
  await page.getByRole('button', { name: '收起侧栏' }).click()
  const expand = page.locator('.workspace-expand')
  // Move onto the persistent toggle to open the hover preview.
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
    width: 260,
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
  await expand.click()
  await expect(page.locator('.workspace-shell')).not.toHaveClass(/sidebar-collapsed/)
  await expect.poll(async () => (await main.boundingBox())?.x).toBe(260)
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

test('collapse keeps one continuous toggle and cannot reopen from a stationary pointer', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop sidebar motion')
  await page.goto('/new-task')
  const toggle = page.locator('.workspace-expand')
  await expect(toggle).toHaveAccessibleName('收起侧栏')
  const originalButton = await toggle.elementHandle()
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion })
    // Record every animation frame, including the moment the click changes state.
    const frames = toggle.evaluate(
      (button) =>
        new Promise<Array<{ x: number; visible: boolean; preview: boolean }>>((resolve) => {
          button.addEventListener(
            'click',
            () => {
              const samples: Array<{ x: number; visible: boolean; preview: boolean }> = []
              const start = performance.now()
              const sample = () => {
                const rect = button.getBoundingClientRect()
                samples.push({
                  x: rect.x,
                  visible:
                    rect.width === 32 &&
                    getComputedStyle(button).visibility === 'visible' &&
                    document.elementFromPoint(rect.x + 16, rect.y + 16)?.closest('button') ===
                      button,
                  preview: !!button.closest('.sidebar-preview'),
                })
                if (performance.now() - start < 400) requestAnimationFrame(sample)
                else resolve(samples)
              }
              sample()
            },
            { once: true },
          )
        }),
    )
    await toggle.click()
    const samples = await frames
    expect(samples.every((sample) => sample.visible && !sample.preview)).toBe(true)
    expect(samples[0]!.x).toBe(212)
    expect(samples.at(-1)!.x).toBe(16)
    for (let index = 1; index < samples.length; index++) {
      expect(samples[index]!.x).toBeLessThanOrEqual(samples[index - 1]!.x)
    }
    if (reducedMotion === 'no-preference') {
      expect(samples.some((sample) => sample.x > 16 && sample.x < 212)).toBe(true)
    }
    await expect(page.locator('.workspace-sidebar')).toBeHidden()
    expect(await toggle.evaluate((button, original) => button === original, originalButton)).toBe(
      true,
    )
    await toggle.hover()
    await expect(page.locator('.workspace-sidebar')).toBeVisible()
    await toggle.click()
    await expect.poll(async () => (await toggle.boundingBox())?.x).toBe(212)
    await expect(toggle).toHaveAccessibleName('收起侧栏')
  }
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
