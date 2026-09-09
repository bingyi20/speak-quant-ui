import { expect, test, type Page } from '@playwright/test'
import { stubHistory, authResponse, envelope, settingsTrigger } from './auth-fixtures'

test.beforeEach(async ({ page }) => {
  await stubHistory(page)
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ json: envelope(authResponse) }),
  )
})

async function openPricing(page: Page) {
  if ((page.viewportSize()?.width ?? 1440) <= 760) await page.locator('.workspace-expand').click()
  await page.locator('.account-topup').filter({ visible: true }).click()
  const dialog = page.getByRole('dialog', { name: '选择适合你的套餐', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('tab', { name: '会员套餐', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  return dialog
}

test('full-screen pricing preserves research, shows payment notices for both plans, and restores focus', async ({
  page,
  isMobile,
}) => {
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && !request.url().endsWith('/auth/refresh'))
      writes.push(request.url())
  })
  await page.goto('/new-task')
  const composer = page.getByRole('textbox', { name: '交易想法' })
  await composer.fill('保留当前研究草稿')
  const dialog = await openPricing(page)
  await expect(dialog.getByRole('article')).toHaveCount(3)
  await expect(dialog.getByRole('button', { name: '当前套餐' })).toBeDisabled()
  await expect
    .poll(async () => (await dialog.boundingBox())?.width)
    .toBe(page.viewportSize()!.width)
  await expect
    .poll(async () => (await dialog.boundingBox())?.height)
    .toBe(page.viewportSize()!.height)
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('pricing-plans.png'),
  })
  for (const name of ['Pro', 'Max']) {
    const choose = dialog.getByRole('button', { name: `选择 ${name}`, exact: true })
    await choose.click()
    await expect(page.getByText('支付功能待上线', { exact: true })).toHaveCount(1)
    await expect(page.getByText('支付功能待上线', { exact: true })).toBeVisible()
    await expect(dialog.locator('.subscription-notice')).toHaveAttribute('role', 'status')
    await expect(dialog.locator('.subscription-notice button')).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await expect(choose).toBeFocused()
  }
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(
    isMobile
      ? page.locator('.workspace-expand')
      : page.locator('.workspace-sidebar .account-topup'),
  ).toBeFocused()
  await expect(composer).toHaveValue('保留当前研究草稿')
  expect(writes).toEqual([])
})

test('top-ups validate input, keep edits across tabs, and notify without changing membership', async ({
  page,
}) => {
  await page.goto('/new-task')
  const dialog = await openPricing(page)
  const plans = dialog.getByRole('tab', { name: '会员套餐', exact: true })
  await plans.focus()
  await plans.press('ArrowRight')
  const credits = dialog.getByRole('tab', { name: '积分加购', exact: true })
  await expect(credits).toBeFocused()
  await expect(credits).toHaveAttribute('aria-selected', 'true')
  const input = dialog.getByRole('textbox', { name: '加购金额' })
  await expect(input).toHaveValue('5')
  await input.focus()
  await input.hover()
  await expect(input).toHaveCSS('outline-style', 'none')
  await expect(dialog.locator('.pricing-amount-field')).toHaveCSS('outline-style', 'none')
  await expect(dialog.locator('.pricing-amount-field')).toHaveCSS('border-top-width', '1px')
  await dialog
    .locator('.pricing-amount-field')
    .screenshot({ path: test.info().outputPath('amount-focus.png'), animations: 'disabled' })
  await expect(dialog.locator('.pricing-topup-result strong')).toHaveText('333积分')
  await dialog.getByRole('button', { name: '$10', exact: true }).click()
  await expect(input).toHaveValue('10')
  await expect(dialog.locator('.pricing-topup-result strong')).toHaveText('666积分')
  for (const invalid of ['', '4', '20.5', '10001', '1e3']) {
    await input.fill(invalid)
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByRole('button', { name: '请输入有效金额' })).toBeDisabled()
    await expect(dialog.getByRole('alert')).toBeVisible()
  }
  await input.fill('75')
  await expect(dialog.locator('.pricing-topup-result strong')).toHaveText('5,000积分')
  await plans.click()
  await expect(plans).toBeFocused()
  await credits.click()
  await expect(input).toHaveValue('75')
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('pricing-topup.png'),
  })
  await input.press('Enter')
  await expect(page.getByText('支付功能待上线', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('75')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await openPricing(page)
  await expect(plans).toHaveAttribute('aria-selected', 'true')
  await credits.click()
  await expect(input).toHaveValue('5')
})

test('settings entries open the intended tab and return to the subscription section', async ({
  page,
}) => {
  await page.goto('/conversations/preview')
  await (await settingsTrigger(page)).click()
  const settings = page.getByRole('dialog', { name: '账户设置', exact: true })
  await settings.getByRole('tab', { name: '订阅与积分' }).click()
  const pricing = page.getByRole('dialog', { name: '选择适合你的套餐', exact: true })
  for (const name of ['升级套餐']) {
    const entry = settings.getByRole('button', { name, exact: true })
    await entry.click()
    await expect(
      pricing.getByRole('tab', {
        name: name === '升级套餐' ? '会员套餐' : '积分加购',
        exact: true,
      }),
    ).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Escape')
    await expect(pricing).toBeHidden()
    await expect(entry).toBeFocused()
    await expect(settings.getByRole('tab', { name: '订阅与积分' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  }
  await expect(page).toHaveURL(/\/conversations\/preview$/)
})

test('English and engineering dark theme render without overflow or focus escaping the modal', async ({
  page,
}) => {
  await page
    .context()
    .addCookies([{ name: 'trade-locale', value: 'en-US', domain: 'localhost', path: '/' }])
  await page.goto('/new-task')
  if ((page.viewportSize()?.width ?? 1440) <= 760) await page.locator('.workspace-expand').click()
  await page.locator('.account-topup').filter({ visible: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Choose the right plan for you', exact: true })
  await dialog.getByRole('tab', { name: 'Membership plans', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Choose Pro' })).toBeVisible()
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark'
    document.documentElement.classList.add('dark')
  })
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('pricing-english-dark.png'),
  })
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  const close = dialog.getByRole('button', { name: 'Close', exact: true })
  await close.focus()
  await close.press('Shift+Tab')
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  await dialog.getByRole('tab', { name: 'Credit top-ups', exact: true }).click()
  await expect(dialog.getByRole('textbox', { name: 'Top-up amount' })).toHaveValue('5')
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('pricing-english-topup-dark.png'),
  })
})

test('credit estimates keep their height and position while amounts are cleared or edited', async ({
  page,
}) => {
  await page
    .context()
    .addCookies([{ name: 'trade-locale', value: 'en-US', domain: 'localhost', path: '/' }])
  await page.goto('/new-task')
  if ((page.viewportSize()?.width ?? 1440) <= 760) await page.locator('.workspace-expand').click()
  await page.locator('.account-topup').filter({ visible: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Choose the right plan for you', exact: true })
  await dialog.getByRole('tab', { name: 'Credit top-ups', exact: true }).click()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const input = dialog.getByRole('textbox', { name: 'Top-up amount' })
  const geometry = () =>
    dialog.locator('.pricing-topup').evaluate((form) => {
      const box = (selector: string) => {
        const bounds = form.querySelector(selector)!.getBoundingClientRect()
        return { height: bounds.height, offset: bounds.y - form.getBoundingClientRect().y }
      }
      return {
        result: box('.pricing-topup-result'),
        button: box('button[type="submit"]'),
        height: form.getBoundingClientRect().height,
      }
    })
  const initial = await geometry()
  for (const amount of ['', '4', '10', '10000', '', '5']) {
    await input.fill(amount)
    await expect.poll(geometry).toEqual(initial)
  }
})
