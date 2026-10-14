import { expect, test } from '@playwright/test'
import { stubHistory, authResponse, envelope, settingsTrigger } from './auth-fixtures'

test.beforeEach(async ({ page }) => {
  await stubHistory(page)
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ json: envelope(authResponse) }),
  )
})

test('account tabs keep the conversation and show the loaded credit balance', async ({
  page,
  isMobile,
}) => {
  const writes: string[] = []
  const historyReads: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && !request.url().endsWith('/auth/refresh'))
      writes.push(request.url())
    if (request.url().includes('/api/credits/ledger')) historyReads.push(request.url())
  })
  await page.goto('/conversations/preview')
  await (await settingsTrigger(page)).click()
  const dialog = page.getByRole('dialog', { name: /账户设置|Account settings/ })
  await expect(dialog.getByRole('heading', { name: '常规', exact: true })).toBeVisible()
  await expect(page.locator('.app-modal-overlay').last()).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0.32)',
  )
  await expect(dialog.getByText('tester@example.com', { exact: true })).toBeVisible()
  const accountTab = dialog.getByRole('tab', { name: '常规', exact: true })
  const usageTab = dialog.getByRole('tab', { name: '消耗记录' })
  await expect(dialog.getByRole('tab')).toHaveCount(2)
  await expect(dialog.getByRole('tab', { name: '订阅与积分' })).toHaveCount(0)
  const summary = dialog.locator('.settings-plan-summary')
  await expect(summary.getByText('Free', { exact: true })).toBeVisible()
  await expect(summary.getByText('积分', { exact: true })).toBeVisible()
  await expect(summary.getByText('2,750', { exact: true })).toBeVisible()
  await expect(summary.getByText('暂未开放', { exact: true })).toHaveCount(0)
  await expect(summary).not.toContainText(/套餐预览|每日|重置时间/)
  // Sample both tabs in the same frame while the dialog entrance animates.
  const [accountBounds, usageBounds] = await dialog.getByRole('tab').evaluateAll((tabs) =>
    tabs.slice(0, 2).map((tab) => {
      const { x, y } = tab.getBoundingClientRect()
      return { x, y }
    }),
  )
  if (isMobile) expect(accountBounds!.y).toBeCloseTo(usageBounds!.y, 0)
  else expect(accountBounds!.x).toBeCloseTo(usageBounds!.x, 0)
  const upgrade = summary.getByRole('button', { name: '升级', exact: true })
  await expect(upgrade).toHaveClass(/settings-upgrade-button/)
  expect((await upgrade.boundingBox())!.height).toBeLessThanOrEqual(36)
  const profile = dialog.locator('.settings-profile')
  const signout = profile.getByRole('button', { name: '退出登录', exact: true })
  await expect(signout).toBeVisible()
  await expect(signout).toHaveAttribute('aria-label', '退出登录')
  expect((await signout.textContent())?.trim()).toBe('')
  await expect(signout.locator('.iconify')).toBeVisible()
  if (!isMobile) {
    const tooltip = page.locator('.settings-signout-tooltip').filter({ hasText: '退出登录' })
    await signout.hover()
    await expect(tooltip).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(tooltip).toBeHidden()
    await upgrade.focus()
    await upgrade.press('Shift+Tab')
    await expect(signout).toBeFocused()
    await expect(tooltip).toBeVisible()
    await signout.press('Escape')
    await expect(tooltip).toBeHidden()
    await expect(dialog).toBeVisible()
  }
  const profileLayout = await profile.evaluate((el) => {
    const identity = el.querySelector('.settings-profile-identity')!.getBoundingClientRect()
    const button = el.querySelector('button')!.getBoundingClientRect()
    return {
      identityRight: identity.right,
      identityTop: identity.top,
      identityBottom: identity.bottom,
      buttonLeft: button.left,
      buttonCenter: button.y + button.height / 2,
    }
  })
  expect(profileLayout.buttonLeft).toBeGreaterThan(profileLayout.identityRight)
  expect(profileLayout.buttonCenter).toBeGreaterThanOrEqual(profileLayout.identityTop)
  expect(profileLayout.buttonCenter).toBeLessThanOrEqual(profileLayout.identityBottom)
  await upgrade.click()
  const pricing = page.getByRole('dialog', { name: '选择适合你的套餐', exact: true })
  await expect(pricing).toBeVisible()
  await expect(pricing.getByRole('tab')).toHaveCount(0)
  await expect(pricing.locator('.pricing-account-summary')).toHaveCount(0)
  await expect(pricing.getByRole('button', { name: '刷新权益', exact: true })).toHaveCount(0)
  await pricing.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '升级', exact: true })).toBeFocused()
  await expect(dialog.getByRole('button', { name: '查看消耗记录' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '积分加购' })).toHaveCount(0)
  expect(historyReads).toEqual([])
  await accountTab.focus()
  await accountTab.press('ArrowRight')
  await expect(usageTab).toBeFocused()
  await expect(usageTab).toHaveAttribute('aria-selected', 'true')
  await expect(dialog.getByText('暂无积分记录', { exact: true })).toBeVisible()
  expect(historyReads).toHaveLength(1)
  await expect(page).toHaveURL(/\/conversations\/preview$/)
  await usageTab.press('ArrowRight')
  await expect(accountTab).toBeFocused()
  await expect(accountTab).toHaveAttribute('aria-selected', 'true')
  await accountTab.press('End')
  await expect(usageTab).toBeFocused()
  await usageTab.press('Home')
  await expect(accountTab).toBeFocused()
  await expect(accountTab).toHaveAttribute('aria-selected', 'true')
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(writes).toEqual([])
})

test('stacked language control and theme cards preserve selection and keyboard operation', async ({
  page,
}) => {
  await page.goto('/new-task')
  await (await settingsTrigger(page)).click()
  const dialog = page.getByRole('dialog', { name: /账户设置|Account settings/ })
  const language = dialog.getByRole('button', { name: '语言', exact: true })
  const languageLabel = dialog.getByText('语言', { exact: true })
  const themeCards = dialog.getByRole('radiogroup', { name: '主题', exact: true })
  await expect(themeCards.getByRole('radio')).toHaveCount(3)
  const languageLabelBounds = (await languageLabel.boundingBox())!
  const languageBounds = (await language.boundingBox())!
  const themeLabelBounds = (await dialog.getByText('主题', { exact: true }).boundingBox())!
  const themeBounds = (await themeCards.boundingBox())!
  expect(languageBounds.y).toBeGreaterThanOrEqual(
    languageLabelBounds.y + languageLabelBounds.height,
  )
  expect(themeLabelBounds.y).toBeGreaterThan(languageBounds.y + languageBounds.height)
  expect(themeBounds.y).toBeGreaterThanOrEqual(themeLabelBounds.y + themeLabelBounds.height)
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
  await expect(dialog.getByRole('heading', { name: 'General', exact: true })).toBeVisible()
  await expect(dialog.getByRole('tab', { name: 'General', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(
    dialog.locator('.settings-plan-summary').getByText('Credits', { exact: true }),
  ).toBeVisible()
  const signout = dialog.getByRole('button', { name: 'Sign out', exact: true })
  await expect(signout).toHaveAttribute('aria-label', 'Sign out')
  expect((await signout.textContent())?.trim()).toBe('')
  await expect(signout.locator('.iconify')).toBeVisible()
  await page.getByRole('button', { name: 'Language', exact: true }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'English', exact: true })).toBeChecked()
  await page.keyboard.press('Escape')
  const theme = dialog.getByRole('radiogroup', { name: 'Theme', exact: true })
  const light = theme.getByRole('radio', { name: 'Light', exact: true })
  const dark = theme.getByRole('radio', { name: 'Dark', exact: true })
  const auto = theme.getByRole('radio', { name: 'Auto', exact: true })
  await expect(light).toBeChecked()
  await expect(light).toBeEnabled()
  await expect(dark).not.toBeChecked()
  await expect(auto).not.toBeChecked()
  await light.focus()
  await light.press('ArrowRight')
  if (await dark.isEnabled()) {
    await expect(dark).toBeChecked()
    await expect(dark).toBeFocused()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await dark.press('ArrowRight')
    await expect(auto).toBeChecked()
    await expect(auto).toBeFocused()
    await auto.press('ArrowRight')
  } else {
    await expect(dark).toBeDisabled()
    await expect(auto).toBeDisabled()
  }
  await expect(light).toBeChecked()
  await expect(light).toBeFocused()
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('menu')).toBeHidden()
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
})
