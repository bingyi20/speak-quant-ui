import { expect, test } from '@playwright/test'
import { stubHistory, authResponse, envelope, settingsTrigger } from './auth-fixtures'

test.beforeEach(async ({ page }) => {
  await stubHistory(page)
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ json: envelope(authResponse) }),
  )
})

test('account tabs keep the conversation and present unavailable billing honestly', async ({
  page,
  isMobile,
}) => {
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && !request.url().endsWith('/auth/refresh'))
      writes.push(request.url())
  })
  await page.goto('/conversations/preview')
  await (await settingsTrigger(page)).click()
  const dialog = page.getByRole('dialog', { name: /账户设置|Account settings/ })
  await expect(dialog.getByRole('heading', { name: '个人信息与偏好' })).toBeVisible()
  await expect(dialog.getByText('tester@example.com', { exact: true })).toBeVisible()
  const accountTab = dialog.getByRole('tab', { name: '账户与偏好' })
  const planTab = dialog.getByRole('tab', { name: '订阅与积分' })
  // Sample both tabs in the same frame while the dialog entrance animates.
  const [accountBounds, planBounds] = await dialog.getByRole('tab').evaluateAll((tabs) =>
    tabs.slice(0, 2).map((tab) => {
      const { x, y } = tab.getBoundingClientRect()
      return { x, y }
    }),
  )
  if (isMobile) expect(accountBounds!.y).toBeCloseTo(planBounds!.y, 0)
  else expect(accountBounds!.x).toBeCloseTo(planBounds!.x, 0)
  await dialog.getByRole('button', { name: '升级套餐', exact: true }).click()
  await expect(planTab).toHaveAttribute('aria-selected', 'true')
  await expect(dialog.getByRole('button', { name: '升级套餐 · 即将开放' })).toBeDisabled()
  await expect(dialog.getByText('订阅功能即将开放，当前展示为套餐预览。')).toBeVisible()
  await dialog.getByRole('button', { name: '查看消耗记录' }).click()
  await expect(dialog.getByRole('heading', { name: '消耗记录即将开放' })).toBeVisible()
  await expect(page).toHaveURL(/\/conversations\/preview$/)
  const usageTab = dialog.getByRole('tab', { name: '消耗记录' })
  await usageTab.focus()
  await usageTab.press('Home')
  await expect(accountTab).toBeFocused()
  await expect(accountTab).toHaveAttribute('aria-selected', 'true')
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(writes).toEqual([])
})

test('preference menus show selected values and Escape closes only the menu', async ({ page }) => {
  await page.goto('/new-task')
  await (await settingsTrigger(page)).click()
  const dialog = page.getByRole('dialog', { name: /账户设置|Account settings/ })
  const language = dialog.getByRole('button', { name: '界面语言', exact: true })
  await language.click()
  await expect(page.getByRole('menuitemcheckbox', { name: '简体中文', exact: true })).toBeChecked()
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'English', exact: true }),
  ).not.toBeChecked()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()
  await expect(dialog).toBeVisible()
  await expect(language).toBeFocused()
  await language.click()
  await page.getByRole('menuitemcheckbox', { name: 'English', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'Profile & preferences' })).toBeVisible()
  await page.getByRole('button', { name: 'Interface language', exact: true }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'English', exact: true })).toBeChecked()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Light', exact: true })).toBeChecked()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Dark', exact: true })).toHaveCount(0)
})
