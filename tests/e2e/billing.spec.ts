import { expect, test, type Locator, type Page } from '@playwright/test'
import { stubHistory, authResponse, envelope, settingsTrigger, testUser } from './auth-fixtures'
import {
  billingAccount,
  billingBalance,
  billingOrder,
  billingPaymentAction,
  billingQuote,
  stubBilling,
} from './billing-fixtures'

const checkoutUrl = 'https://checkout.stripe.com/c/pay/cs_test_billing_e2e'
const origin = 'http://localhost:6002'

test.beforeEach(async ({ page }) => {
  await stubHistory(page)
  await page.addInitScript(() => {
    if (window.location.pathname === '/billing/payment-return')
      Object.defineProperty(window, '__billingReturnDocument', { value: true })
  })
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ json: envelope(authResponse) }),
  )
})

async function openPricing(page: Page, english = false) {
  if ((page.viewportSize()?.width ?? 1440) <= 760)
    await page.locator('.workspace-expand').filter({ visible: true }).click()
  await page.locator('.account-topup').filter({ visible: true }).click()
  const dialog = page.getByRole('dialog', {
    name: english ? 'Choose the right plan for you' : '选择适合你的套餐',
    exact: true,
    includeHidden: true,
  })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('article', { name: 'Basic', exact: true })).toBeVisible()
  return dialog
}

function upgradeDialog(page: Page, english = false) {
  return page.getByRole('dialog', {
    name: english ? 'Confirm plan change' : '确认套餐变更',
    exact: true,
  })
}

async function expectCheckoutInCurrentTab(page: Page, purchase: () => Promise<unknown>) {
  const pages = page.context().pages().length
  await purchase()
  await expect(page).toHaveURL(checkoutUrl)
  await expect(page.getByRole('heading', { name: 'Stripe checkout fixture' })).toBeVisible()
  expect(page.context().pages()).toHaveLength(pages)
}

async function expectCleanPricing(page: Page) {
  await expect(page.locator('.pricing-account-summary')).toHaveCount(0)
  await expect(page.locator('.pricing-order-status')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^(刷新权益|Refresh benefits)$/ })).toHaveCount(0)
}

async function delayBillingMutation(page: Page, path: string) {
  let release!: (fail: boolean) => void
  const response = new Promise<boolean>((resolve) => {
    release = resolve
  })
  const requests: Record<string, string>[] = []
  await page.route(`**${path}`, async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, string>)
    if (await response) {
      await route.fulfill({
        status: 400,
        json: { code: 40001, data: null, error: { key: 'BILLING_NOT_ELIGIBLE' } },
      })
    } else await route.fallback()
  })
  return { requests, release }
}

async function holdTopUpQuotes(page: Page) {
  const requests: {
    amount: string
    quote: ReturnType<typeof billingQuote>
    release: () => void
  }[] = []
  await page.route('**/api/billing/topup-quotes', async (route) => {
    const amount = (route.request().postDataJSON() as { amount_usd: string }).amount_usd
    const quote = {
      ...billingQuote('topup', 'basic', amount),
      quote_id: `topup-quote-${requests.length + 1}`,
      credits: String(Math.round(Number(amount) * 321)),
    }
    let release!: () => void
    const response = new Promise<void>((resolve) => {
      release = resolve
    })
    requests.push({ amount, quote, release })
    await response
    await route.fulfill({ json: envelope(quote) })
  })
  return requests
}

async function letTopUpQuotesOutliveCancellation(page: Page) {
  await page.addInitScript(() => {
    const fetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      // Exercise stale-response guards even when a transport cannot honor cancellation.
      if (new URL(url, window.location.href).pathname === '/api/billing/topup-quotes')
        return fetch(input, { ...init, signal: null })
      return fetch(input, init)
    }
  })
}

function readPlanGeometry(grid: Element) {
  const gridRect = grid.getBoundingClientRect()
  return [...grid.querySelectorAll('article')].map((card) => {
    const cardRect = card.getBoundingClientRect()
    const buttonRect = card.querySelector('button')!.getBoundingClientRect()
    return {
      card: [cardRect.x - gridRect.x, cardRect.y - gridRect.y, cardRect.width, cardRect.height],
      button: [
        buttonRect.x - cardRect.x,
        buttonRect.y - cardRect.y,
        buttonRect.width,
        buttonRect.height,
      ],
    }
  })
}

async function planGeometry(pricing: Locator) {
  return pricing.locator('.pricing-plan-grid').evaluate(readPlanGeometry)
}

test('pricing scrolls as one fullscreen modal with its close bar', async ({ page }) => {
  const size = page.viewportSize()!
  await page.setViewportSize({ width: size.width, height: Math.min(size.height, 600) })
  await stubBilling(page)
  await page.goto('/new-task')
  const dialog = await openPricing(page)
  await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished))
  })
  const close = dialog.locator('.subscription-close')
  const basic = dialog.getByRole('article', { name: 'Basic', exact: true })
  await expect
    .poll(() => dialog.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(200)
  const before = {
    close: (await close.boundingBox())!.y,
    card: (await basic.boundingBox())!.y,
    body: await page.evaluate(() => document.scrollingElement!.scrollTop),
  }
  const bounds = (await dialog.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.wheel(0, 320)
  await expect.poll(() => dialog.evaluate((element) => element.scrollTop)).toBeGreaterThan(100)
  // Wait until the native wheel animation has stopped before comparing both regions.
  await expect
    .poll(async () => {
      const top = await dialog.evaluate((element) => element.scrollTop)
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
      return Math.abs((await dialog.evaluate((element) => element.scrollTop)) - top)
    })
    .toBeLessThan(0.1)
  const scroll = await dialog.evaluate((element) => element.scrollTop)
  expect((await close.boundingBox())!.y).toBeCloseTo(before.close - scroll, 1)
  expect((await basic.boundingBox())!.y).toBeCloseTo(before.card - scroll, 1)
  expect((await close.boundingBox())!.y).toBeLessThan(bounds.y)
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(before.body)
  expect(
    await dialog.locator('.subscription-modal-body').evaluate((element) => {
      const style = getComputedStyle(element)
      return (
        ['auto', 'scroll'].includes(style.overflowY) && element.scrollHeight > element.clientHeight
      )
    }),
  ).toBe(false)
  await page.screenshot({ path: test.info().outputPath('pricing-whole-modal-scroll.png') })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('subscription loading stays inside the selected button without moving the plans or accepting another purchase', async ({
  page,
}) => {
  await stubBilling(page)
  const pending = await delayBillingMutation(page, '/api/billing/checkouts/subscription')
  try {
    await page.goto('/new-task')
    const dialog = await openPricing(page)
    const basic = dialog
      .getByRole('article', { name: 'Basic', exact: true })
      .getByRole('button', { name: '选择 Basic', exact: true })
    const pro = dialog.getByRole('article', { name: 'Pro', exact: true }).getByRole('button')
    const max = dialog.getByRole('article', { name: 'Max', exact: true }).getByRole('button')
    await expect(basic).toBeEnabled()
    await basic.scrollIntoViewIfNeeded()
    await page.evaluate(() => document.fonts.ready)
    const before = await planGeometry(dialog)
    await basic.click()
    await expect.poll(() => pending.requests.length).toBe(1)
    await expect(basic).toHaveAttribute('aria-busy', 'true')
    await expect(basic).toHaveAttribute('data-loading', 'true')
    await expect(basic.locator('.pricing-button-spinner')).toHaveCount(1)
    await expect(dialog.locator('.pricing-button-spinner')).toHaveCount(1)
    await expect(basic).toBeDisabled()
    await expect(pro).toBeDisabled()
    await expect(max).toBeDisabled()
    await expect(dialog.locator('.pricing-loading')).toHaveCount(0)
    await expect(dialog.getByText(/^(正在处理，请稍候…|Processing, please wait…)$/)).toHaveCount(0)
    expect(await planGeometry(dialog)).toEqual(before)
    await basic.evaluate((button) => (button as HTMLButtonElement).click())
    await max.evaluate((button) => (button as HTMLButtonElement).click())
    await basic.press('Enter')
    await pro.press('Space')
    expect(pending.requests).toEqual([{ plan_code: 'basic' }])
    await page.screenshot({ path: test.info().outputPath('subscription-button-loading.png') })

    pending.release(true)
    await expect(dialog.locator('.pricing-feedback-error')).toBeVisible()
    await expect(dialog.locator('.pricing-button-spinner')).toHaveCount(0)
    await expect(basic).toBeEnabled()
    await expect(pro).toBeEnabled()
    await expect(max).toBeEnabled()

    const next = await delayBillingMutation(page, '/api/billing/checkouts/subscription')
    try {
      await max.click()
      await expect.poll(() => next.requests.length).toBe(1)
      await expect(max).toHaveAttribute('aria-busy', 'true')
      await expect(max.locator('.pricing-button-spinner')).toHaveCount(1)
      await expect(basic.locator('.pricing-button-spinner')).toHaveCount(0)
      await expect(dialog.locator('.pricing-button-spinner')).toHaveCount(1)
      expect(next.requests).toEqual([{ plan_code: 'max' }])
    } finally {
      next.release(true)
    }
  } finally {
    pending.release(true)
  }
})

test('upgrade preview opens a separate confirmation without shifting the plans and Escape restores its trigger', async ({
  page,
}) => {
  const billing = await stubBilling(page, { plan: 'basic' })
  const pending = await delayBillingMutation(page, '/api/billing/subscription/upgrade-preview')
  try {
    await page.goto('/new-task')
    const dialog = await openPricing(page)
    const basic = dialog.locator('.pricing-plan[aria-label="Basic"] button')
    const pro = dialog.locator('.pricing-plan[aria-label="Pro"] button')
    const max = dialog.locator('.pricing-plan[aria-label="Max"] button')
    await expect(pro).toBeEnabled()
    await pro.scrollIntoViewIfNeeded()
    await page.evaluate(() => document.fonts.ready)
    const before = await planGeometry(dialog)
    await pro.click()
    await expect.poll(() => pending.requests.length).toBe(1)
    await expect(pro).toHaveAccessibleName('升级至 Pro')
    await expect(pro).toHaveAttribute('aria-busy', 'true')
    await expect(pro.locator('.pricing-button-spinner')).toHaveCount(1)
    await expect(dialog.locator('.pricing-button-spinner')).toHaveCount(1)
    await expect(basic).toBeDisabled()
    await expect(pro).toBeDisabled()
    await expect(max).toBeDisabled()
    await expect(dialog.locator('.pricing-loading')).toHaveCount(0)
    expect(await planGeometry(dialog)).toEqual(before)
    expect(pending.requests).toEqual([{ plan_code: 'pro' }])

    pending.release(false)
    const upgrade = upgradeDialog(page)
    await expect(upgrade).toBeVisible()
    await expect(upgrade.locator('.pricing-upgrade-summary')).toContainText('Basic')
    await expect(upgrade.locator('.pricing-upgrade-summary')).toContainText('Pro')
    await expect(upgrade).toContainText('32.50')
    await expect(upgrade.locator('.pricing-upgrade-payment-detail')).toContainText('Visa*0042')
    await expect(dialog.locator('.pricing-quote-confirm')).toHaveCount(0)
    await expect(dialog.locator('.pricing-button-spinner')).toHaveCount(0)
    expect(await planGeometry(dialog)).toEqual(before)
    expect(
      billing.requests.filter((item) => item.path === '/api/billing/subscription/upgrade'),
    ).toHaveLength(0)
    await expect(upgrade.locator('.pricing-upgrade-confirm')).toBeInViewport({ ratio: 1 })
    await page.screenshot({
      path: test.info().outputPath('upgrade-confirmation-modal.png'),
      animations: 'disabled',
    })

    await page.keyboard.press('Escape')
    await expect(upgrade).toBeHidden()
    await expect(dialog).toBeVisible()
    await expect(pro).toBeFocused()
    await expect(pro).toBeEnabled()
    await expect(max).toBeEnabled()
    await expect(basic).toBeDisabled()
    await pro.click()
    await expect(upgrade).toBeVisible()
    await upgrade.locator('.pricing-upgrade-cancel').click()
    await expect(upgrade).toBeHidden()
    await expect(dialog).toBeVisible()
    await expect(pro).toBeFocused()
    expect(
      billing.requests.filter((item) => item.path === '/api/billing/subscription/upgrade'),
    ).toHaveLength(0)
  } finally {
    pending.release(false)
  }
})

test('upgrade confirmation keeps one payment action and its layout until Stripe replaces the document', async ({
  page,
}) => {
  await stubBilling(page, { plan: 'basic' })
  const pending = await delayBillingMutation(page, '/api/billing/subscription/upgrade')
  let releaseStripe!: () => void
  const navigation = new Promise<void>((resolve) => {
    releaseStripe = resolve
  })
  let checkoutRequested = false
  await page.route(checkoutUrl, async (route) => {
    checkoutRequested = true
    await navigation
    await route.fallback()
  })
  try {
    await page.goto('/new-task')
    const dialog = await openPricing(page)
    await dialog.getByRole('article', { name: 'Pro', exact: true }).getByRole('button').click()
    const upgrade = upgradeDialog(page)
    const confirm = upgrade.locator('.pricing-upgrade-confirm')
    await expect(confirm).toBeEnabled()
    await confirm.scrollIntoViewIfNeeded()
    const before = await planGeometry(dialog)
    const modalHeight = (await upgrade.boundingBox())!.height
    const confirmHeight = (await confirm.boundingBox())!.height
    const confirmLabel = await confirm.innerText()
    const modalElement = (await upgrade.elementHandle())!
    const departure = page.waitForEvent('console', {
      predicate: (message) => message.text().startsWith('billing-departure:'),
    })
    await modalElement.evaluate((element) => {
      window.addEventListener('beforeunload', () => {
        const confirm = element.querySelector<HTMLButtonElement>('.pricing-upgrade-confirm')!
        const grid = document.querySelector('.subscription-modal .pricing-plan-grid')!
        const gridRect = grid.getBoundingClientRect()
        const geometry = [...grid.querySelectorAll('article')].map((card) => {
          const cardRect = card.getBoundingClientRect()
          const buttonRect = card.querySelector('button')!.getBoundingClientRect()
          return {
            card: [
              cardRect.x - gridRect.x,
              cardRect.y - gridRect.y,
              cardRect.width,
              cardRect.height,
            ],
            button: [
              buttonRect.x - cardRect.x,
              buttonRect.y - cardRect.y,
              buttonRect.width,
              buttonRect.height,
            ],
          }
        })
        console.debug(
          `billing-departure:${JSON.stringify({
            modal: {
              connected: element.isConnected,
              height: element.getBoundingClientRect().height,
            },
            confirm: {
              busy: confirm.getAttribute('aria-busy'),
              disabled: confirm.disabled,
              spinners: confirm.querySelectorAll('.pricing-button-spinner').length,
              allSpinners: element.querySelectorAll('.pricing-button-spinner').length,
              height: confirm.getBoundingClientRect().height,
            },
            geometry,
          })}`,
        )
      })
    })
    await confirm.click()
    await expect.poll(() => pending.requests.length).toBe(1)
    await expect(confirm).toHaveAttribute('aria-busy', 'true')
    await expect(confirm).toHaveAccessibleName(confirmLabel)
    await expect(confirm.locator('.pricing-button-spinner')).toHaveCount(1)
    await expect(upgrade.locator('.pricing-upgrade-cancel')).toBeDisabled()
    await expect(upgrade.locator('.pricing-upgrade-other')).toBeDisabled()
    await expect(dialog.locator('.pricing-plan .pricing-button-spinner')).toHaveCount(0)
    await expect(dialog.locator('.pricing-loading')).toHaveCount(0)
    await confirm.evaluate((button) => (button as HTMLButtonElement).click())
    await confirm.press('Enter')
    await page.keyboard.press('Escape')
    await expect(upgrade).toBeVisible()
    expect(pending.requests).toHaveLength(1)
    expect(pending.requests[0]).toMatchObject({ payment_mode: 'saved_method' })
    expect(await planGeometry(dialog)).toEqual(before)

    pending.release(false)
    await expect.poll(() => checkoutRequested).toBe(true)
    // Chromium suspends the old document during cross-site navigation. Inspect its final
    // beforeunload snapshot while the Stripe document response is still held.
    const departing = JSON.parse((await departure).text().slice('billing-departure:'.length))
    expect(departing.modal).toEqual({ connected: true, height: modalHeight })
    expect(departing.confirm).toEqual({
      busy: 'true',
      disabled: true,
      spinners: 1,
      allSpinners: 1,
      height: confirmHeight,
    })
    expect(departing.geometry).toEqual(before)

    releaseStripe()
    await expect(page).toHaveURL(checkoutUrl)
    await expect(page.getByRole('heading', { name: 'Stripe checkout fixture' })).toBeVisible()
  } finally {
    pending.release(false)
    releaseStripe()
  }
})

test('automatic top-up quote keeps amount editable and checkout locks the submit button until rejection', async ({
  page,
}) => {
  await stubBilling(page, { plan: 'basic' })
  const quote = await delayBillingMutation(page, '/api/billing/topup-quotes')
  try {
    await page.goto('/new-task')
    const dialog = await openPricing(page)
    await dialog.getByRole('tab', { name: '积分加购', exact: true }).click()
    const input = dialog.getByRole('textbox', { name: '加购金额', exact: true })
    await input.fill('10.25')
    const submit = dialog.locator('.pricing-topup-submit')
    await expect.poll(() => quote.requests.length).toBe(1)
    await expect(submit.locator('.pricing-button-spinner')).toHaveCount(0)
    await expect(dialog.locator('.pricing-topup-result')).toHaveAttribute('aria-busy', 'true')
    await expect(dialog.locator('.pricing-loading')).toHaveCount(0)
    await expect(input).toBeEnabled()
    await expect(dialog.getByRole('tab', { name: '会员套餐', exact: true })).toBeEnabled()
    await expect(submit).toBeDisabled()
    await submit.scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath('topup-automatic-quote-pending.png') })
    quote.release(false)
    await expect(dialog.locator('.pricing-topup-result strong')).toContainText('6,789')
    await expect(submit).toHaveAttribute('aria-busy', 'false')
    await expect(submit.locator('.pricing-button-spinner')).toHaveCount(0)
    await expect(submit).toBeEnabled()

    const checkout = await delayBillingMutation(page, '/api/billing/checkouts/topup')
    try {
      await submit.click()
      await expect.poll(() => checkout.requests.length).toBe(1)
      await expect(submit).toHaveAttribute('aria-busy', 'true')
      await expect(submit.locator('.pricing-button-spinner')).toHaveCount(1)
      await expect(dialog.locator('.pricing-button-spinner')).toHaveCount(1)
      await expect(input).toBeDisabled()
      await submit.evaluate((button) => (button as HTMLButtonElement).click())
      expect(checkout.requests).toHaveLength(1)
      checkout.release(true)
      await expect(dialog.locator('.pricing-feedback-error')).toBeVisible()
      await expect(submit).toHaveAttribute('aria-busy', 'false')
      await expect(submit.locator('.pricing-button-spinner')).toHaveCount(0)
      await expect(submit).toBeEnabled()
      await expect(input).toBeEnabled()
    } finally {
      checkout.release(true)
    }
  } finally {
    quote.release(false)
  }
})

test('system entry loads backend membership and the available balance, including after reload', async ({
  page,
}) => {
  const billing = await stubBilling(page, { plan: 'basic', available: '12345' })
  await page.goto('/new-task')
  await expect
    .poll(() => billing.requests.filter((item) => item.path === '/api/billing/account').length)
    .toBeGreaterThan(0)
  await expect
    .poll(() => billing.requests.filter((item) => item.path === '/api/credits/balance').length)
    .toBeGreaterThan(0)
  for (let visit = 0; visit < 2; visit++) {
    if (visit) await page.reload()
    await (await settingsTrigger(page)).click()
    const settings = page.getByRole('dialog', { name: '账户设置', exact: true })
    await expect(settings.locator('.settings-plan-summary')).toContainText('Basic')
    await expect(settings.locator('.settings-plan-summary')).toContainText('12,345')
    await settings.getByRole('button', { name: '关闭', exact: true }).click()
  }
})

test('subscription uses server prices, pays in the current tab and returns to its original workspace', async ({
  page,
}) => {
  const billing = await stubBilling(page)
  await page.goto('/new-task')
  const composer = page.getByRole('textbox', { name: '交易想法' })
  await composer.fill('保留当前研究草稿')
  const dialog = await openPricing(page)
  await expectCleanPricing(page)
  await expect(dialog.getByRole('tab')).toHaveCount(0)
  await expect(dialog.getByRole('article')).toHaveCount(3)
  await expect(dialog.getByRole('article', { name: 'Free', exact: true })).toHaveCount(0)
  const basic = dialog.getByRole('article', { name: 'Basic', exact: true })
  await expect(basic).toContainText('12.75')
  await expect(basic).toContainText('8,400')
  await expect(dialog.getByRole('article', { name: 'Pro', exact: true })).toContainText('32.5')
  await expect(dialog.getByRole('article', { name: 'Max', exact: true })).toContainText('102.25')
  await expect
    .poll(async () => (await dialog.boundingBox())?.width)
    .toBe(page.viewportSize()!.width)
  await expect
    .poll(async () => (await dialog.boundingBox())?.height)
    .toBe(page.viewportSize()!.height)
  await expectCheckoutInCurrentTab(page, () =>
    basic.getByRole('button', { name: '选择 Basic', exact: true }).click(),
  )
  const create = billing.requests.find(
    (item) => item.path === '/api/billing/checkouts/subscription',
  )!
  expect(create.body).toEqual({ plan_code: 'basic' })
  expect(create.key).toBeTruthy()
  billing.account = billingAccount('basic')
  billing.balance = billingBalance('11150')
  billing.order!.payment_status = 'paid'
  billing.order!.fulfillment_status = 'fulfilled'
  await page.getByRole('link', { name: 'Return after payment' }).click()
  await expect(page).toHaveURL(`${origin}/new-task`)
  await expect(composer).toHaveValue('保留当前研究草稿')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => '__billingReturnDocument' in window)).toBe(false)
  await page.reload()
  await expect(composer).toHaveValue('保留当前研究草稿')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await (await settingsTrigger(page)).click()
  await expect(page.locator('.settings-plan-summary')).toContainText('11,150')
  expect(page.context().pages()).toHaveLength(1)
  expect(
    billing.requests.some((item) => item.path === `/api/billing/orders/${billing.order!.id}`),
  ).toBe(true)
})

test('payment from account settings reloads the original conversation with every dialog closed', async ({
  page,
}) => {
  const billing = await stubBilling(page)
  const conversationId = '01M2JEFAYKFYQVC23BVZ6FWXPE'
  const destination = `/conversations/${conversationId}?source=account#latest`
  await page.route(`**/api/conversations/${conversationId}`, (route) =>
    route.fulfill({
      json: envelope({
        conversation: {
          id: conversationId,
          title: '付款后继续研究',
          status: 'researching',
          is_favorite: false,
          last_message_at: '2026-10-13T08:00:00Z',
          created_at: '2026-10-13T08:00:00Z',
          updated_at: '2026-10-13T08:00:00Z',
        },
      }),
    }),
  )
  await page.goto(destination)
  const composer = page.getByRole('textbox', { name: '交易想法' })
  await expect(composer).toBeVisible()
  await (await settingsTrigger(page)).click()
  const settings = page.getByRole('dialog', { name: '账户设置', exact: true })
  await settings.getByRole('button', { name: '升级', exact: true }).click()
  const pricing = page.getByRole('dialog', { name: '选择适合你的套餐', exact: true })
  await expectCheckoutInCurrentTab(page, () =>
    pricing.getByRole('button', { name: '选择 Basic', exact: true }).click(),
  )
  // A checkout started before this change may still contain dialog restoration fields.
  // Session storage belongs to localhost, so inspect and seed it only after leaving Stripe.
  await page.addInitScript(
    ({ owner, orderId, path }) => {
      if (window.location.pathname !== '/billing/payment-return') return
      const key = `speakquant-payment-return:${owner}`
      sessionStorage.setItem(
        'fixture-original-payment-return',
        sessionStorage.getItem(key) ?? 'null',
      )
      sessionStorage.setItem(
        key,
        JSON.stringify({
          owner,
          orderId,
          path,
          tab: 'credits',
          settings: true,
          createdAt: Date.now(),
        }),
      )
    },
    { owner: testUser.id, orderId: billing.order!.id, path: destination },
  )
  billing.order!.payment_status = 'paid'
  billing.order!.fulfillment_status = 'fulfilled'
  billing.account = billingAccount('basic')
  billing.balance = billingBalance('11150')
  await page.getByRole('link', { name: 'Return after payment' }).click()
  await expect(page).toHaveURL(`${origin}${destination}`)
  await expect(composer).toBeVisible()
  await expect(composer).toBeEnabled()
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('fixture-original-payment-return')!),
    ),
  ).toEqual({ owner: testUser.id, orderId: billing.order!.id, path: destination })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => '__billingReturnDocument' in window)).toBe(false)
  expect(
    await page.evaluate(
      (owner) => sessionStorage.getItem(`speakquant-payment-return:${owner}`),
      testUser.id,
    ),
  ).toBeNull()
  await page.reload()
  await expect(composer).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.screenshot({
    path: test.info().outputPath('conversation-after-payment.png'),
    animations: 'disabled',
  })
  await (await settingsTrigger(page)).click()
  await expect(settings).toBeVisible()
  await expect(settings.locator('.settings-plan-summary')).toContainText('Basic')
  await expect(settings.locator('.settings-plan-summary')).toContainText('11,150')
})

test('Stripe cancellation returns to pricing without an order panel or background order polling', async ({
  page,
}) => {
  const billing = await stubBilling(page)
  await page.goto('/new-task')
  const dialog = await openPricing(page)
  await expectCheckoutInCurrentTab(page, () =>
    dialog.getByRole('button', { name: '选择 Basic', exact: true }).click(),
  )
  await page.getByRole('link', { name: 'Back to pricing' }).click()
  await expect(page).toHaveURL(`${origin}/pricing`)
  await expect(
    page.getByRole('heading', { name: 'Choose the right plan for you', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expectCleanPricing(page)
  const reads = billing.requests.filter((request) =>
    request.path.startsWith('/api/billing/orders/'),
  ).length
  await page.clock.install()
  await page.clock.fastForward(15_000)
  expect(
    billing.requests.filter((request) => request.path.startsWith('/api/billing/orders/')),
  ).toHaveLength(reads)
  expect(
    billing.requests.filter((item) => item.path === '/api/billing/checkouts/subscription'),
  ).toHaveLength(1)
  expect(page.context().pages()).toHaveLength(1)
  const choose = page.getByRole('button', { name: 'Choose Basic', exact: true })
  await expect(choose).toBeEnabled()
  await expectCheckoutInCurrentTab(page, () => choose.click())
  const attempts = billing.requests.filter(
    (item) => item.path === '/api/billing/checkouts/subscription',
  )
  expect(attempts).toHaveLength(2)
  expect(attempts[1]!.key).not.toBe(attempts[0]!.key)
})

test('top-up selection automatically quotes once after rapid valid amount changes without extra instructions', async ({
  page,
}) => {
  const billing = await stubBilling(page, { plan: 'basic' })
  await page.goto('/new-task')
  const dialog = await openPricing(page)
  await page.waitForTimeout(450)
  expect(billing.requests.some((item) => item.path === '/api/billing/topup-quotes')).toBe(false)
  await dialog.getByRole('tab', { name: '积分加购', exact: true }).click()
  const input = dialog.getByRole('textbox', { name: '加购金额', exact: true })
  const submit = dialog.locator('.pricing-topup-submit')
  await expect(dialog.locator('.pricing-topup-result strong')).toContainText('6,789')
  await expect(submit).toContainText('5.00')
  await expect(dialog.locator('.pricing-topup-note')).toHaveCount(0)
  await expect(
    dialog.getByText(/获取报价后显示积分|由服务端确认|获取报价后继续支付|查看报价/),
  ).toHaveCount(0)
  expect(billing.requests.filter((item) => item.path === '/api/billing/topup-quotes')).toHaveLength(
    1,
  )
  for (const amount of ['10', '20', '50']) await input.fill(amount)
  await expect(submit).toBeDisabled()
  await expect(input).toBeEnabled()
  await expect(submit).toContainText('50')
  await expect.poll(() => submit.isEnabled()).toBe(true)
  const requests = billing.requests.filter((item) => item.path === '/api/billing/topup-quotes')
  expect(requests.map((item) => item.body)).toEqual([
    { amount_usd: '5.00' },
    { amount_usd: '50.00' },
  ])
  expect(billing.requests.some((item) => item.path === '/api/billing/checkouts/topup')).toBe(false)
  await submit.scrollIntoViewIfNeeded()
  await page.screenshot({ path: test.info().outputPath('topup-automatic-quote.png') })
})

test('top-ups ignore legacy catalog bounds and pay an amount above $500', async ({ page }) => {
  const billing = await stubBilling(page, { plan: 'basic' })
  // The API may retain old limits during rollout; the form follows the $5-only minimum.
  expect(billing.catalog.topup_min_usd).toBe('5.25')
  expect(billing.catalog.topup_max_usd).toBe('250.50')
  await page.goto('/new-task')
  const dialog = await openPricing(page)
  await dialog.getByRole('tab', { name: '积分加购', exact: true }).click()
  const input = dialog.getByRole('textbox', { name: '加购金额', exact: true })
  await expect(input).toHaveValue('5')
  await expect(input).not.toHaveAttribute('max')
  await expect(input).not.toHaveAttribute('maxlength')
  await expect(dialog.getByText(/5.*起充/)).toBeVisible()
  await expect(dialog.getByText(/250\.50|500.*USD/)).toHaveCount(0)
  await expect(dialog.locator('.pricing-topup-submit')).toBeEnabled()
  await input.fill('1000.25')
  await expect(input).not.toHaveAttribute('aria-invalid', 'true')
  await expect(dialog.locator('.pricing-topup-submit')).toHaveAccessibleName('支付 $1,000.25')
  await expect(dialog.locator('.pricing-topup-submit')).toBeEnabled()
  const quote = billing.requests.findLast((item) => item.path === '/api/billing/topup-quotes')!
  expect(quote.body).toEqual({ amount_usd: '1000.25' })
  await expect(dialog.locator('.pricing-topup-result strong')).toContainText('6,789')
  await expectCheckoutInCurrentTab(page, () => dialog.locator('.pricing-topup-submit').click())
  expect(billing.order!.amount_usd).toBe('1000.25')
  expect(
    billing.requests.find((item) => item.path === '/api/billing/checkouts/topup')!.body,
  ).toEqual({ quote_id: billing.quote!.quote_id })
})

for (const maximum of [undefined, null]) {
  test(`top-up quoting accepts a ${maximum === null ? 'null' : 'missing'} maximum from the catalog`, async ({
    page,
  }) => {
    const billing = await stubBilling(page, { plan: 'basic' })
    await page.route('**/api/billing/plans', (route) =>
      route.fulfill({
        json: envelope({ ...billing.catalog, topup_max_usd: maximum }),
      }),
    )
    await page.goto('/new-task')
    const dialog = await openPricing(page)
    await dialog.getByRole('tab', { name: '积分加购', exact: true }).click()
    await dialog.getByRole('textbox', { name: '加购金额', exact: true }).fill('1000.25')
    await expect(dialog.locator('.pricing-topup-submit')).toBeEnabled()
    expect(
      billing.requests.findLast((item) => item.path === '/api/billing/topup-quotes')!.body,
    ).toEqual({ amount_usd: '1000.25' })
    expect(billing.requests.some((item) => item.path === '/api/billing/checkouts/topup')).toBe(
      false,
    )
  })
}

test('a late top-up quote cannot replace the latest amount or be submitted for payment', async ({
  page,
}) => {
  await stubBilling(page, { plan: 'basic' })
  await letTopUpQuotesOutliveCancellation(page)
  const quotes = await holdTopUpQuotes(page)
  const checkout = await delayBillingMutation(page, '/api/billing/checkouts/topup')
  try {
    await page.goto('/new-task')
    const dialog = await openPricing(page)
    await dialog.getByRole('tab', { name: '积分加购', exact: true }).click()
    await expect.poll(() => quotes.length).toBe(1)
    quotes[0]!.release()
    await expect(dialog.locator('.pricing-topup-submit')).toBeEnabled()
    const input = dialog.getByRole('textbox', { name: '加购金额', exact: true })
    await input.fill('10')
    await expect.poll(() => quotes.length).toBe(2)
    await input.fill('20')
    await expect(dialog.locator('.pricing-topup-submit')).toBeDisabled()
    await expect.poll(() => quotes.length).toBe(3)
    quotes[2]!.release()
    await expect(dialog.locator('.pricing-topup-result strong')).toContainText('6,420')
    await expect(dialog.locator('.pricing-topup-submit')).toBeEnabled()
    quotes[1]!.release()
    await page.waitForTimeout(100)
    await expect(dialog.locator('.pricing-topup-result strong')).toContainText('6,420')
    await expect(dialog.locator('.pricing-topup-submit')).toContainText('20')
    await dialog.locator('.pricing-topup-submit').click()
    await expect.poll(() => checkout.requests.length).toBe(1)
    expect(checkout.requests).toEqual([{ quote_id: quotes[2]!.quote.quote_id }])
  } finally {
    for (const quote of quotes) quote.release()
    checkout.release(true)
  }
})

test('hiding or closing top-ups cancels queued quotes and ignores a response from the hidden form', async ({
  page,
}) => {
  await stubBilling(page, { plan: 'basic' })
  await letTopUpQuotesOutliveCancellation(page)
  const quotes = await holdTopUpQuotes(page)
  try {
    await page.goto('/new-task')
    let dialog = await openPricing(page)
    const creditsTab = dialog.getByRole('tab', { name: '积分加购', exact: true })
    const plansTab = dialog.getByRole('tab', { name: '会员套餐', exact: true })
    await creditsTab.click()
    await expect.poll(() => quotes.length).toBe(1)
    await plansTab.click()
    quotes[0]!.release()
    await page.waitForTimeout(450)
    expect(quotes).toHaveLength(1)
    await creditsTab.click()
    await expect(dialog.locator('.pricing-topup-submit')).toBeDisabled()
    await expect.poll(() => quotes.length).toBe(2)
    quotes[1]!.release()
    await expect(dialog.locator('.pricing-topup-submit')).toBeEnabled()
    const input = dialog.getByRole('textbox', { name: '加购金额', exact: true })
    await input.fill('10')
    await plansTab.click()
    await page.waitForTimeout(450)
    expect(quotes).toHaveLength(2)
    await creditsTab.click()
    await input.fill('20')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await page.waitForTimeout(450)
    expect(quotes).toHaveLength(2)
    dialog = await openPricing(page)
    await page.waitForTimeout(450)
    expect(quotes).toHaveLength(2)
    await expect(dialog.getByRole('tab', { name: '会员套餐', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  } finally {
    for (const quote of quotes) quote.release()
  }
})

test('failed automatic top-up quote has a local retry and never creates a payment operation', async ({
  page,
}) => {
  const billing = await stubBilling(page, { plan: 'basic' })
  billing.failNext.set('/api/billing/topup-quotes', 1)
  await page.goto('/new-task')
  const dialog = await openPricing(page)
  await dialog.getByRole('tab', { name: '积分加购', exact: true }).click()
  const result = dialog.locator('.pricing-topup-result')
  const error = dialog.locator('.pricing-topup-error')
  await expect(error).toBeVisible()
  await expect(dialog.locator('.pricing-operation-retry')).toHaveCount(0)
  await expect(dialog.getByRole('textbox', { name: '加购金额', exact: true })).toBeEnabled()
  await expect(dialog.locator('.pricing-topup-submit')).toBeDisabled()
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith('speakquant-billing:')),
    ),
  ).toEqual([])
  await error.getByRole('button', { name: '重试', exact: true }).click()
  await expect(error).toHaveCount(0)
  await expect(result.locator('strong')).toContainText('6,789')
  await expect(dialog.locator('.pricing-topup-submit')).toBeEnabled()
  expect(billing.requests.filter((item) => item.path === '/api/billing/topup-quotes')).toHaveLength(
    2,
  )
  expect(billing.requests.some((item) => item.path === '/api/billing/checkouts/topup')).toBe(false)
})

test('expired top-up quotes refresh automatically without starting payment', async ({ page }) => {
  const billing = await stubBilling(page, { plan: 'basic' })
  let requests = 0
  await page.route('**/api/billing/topup-quotes', async (route) => {
    requests++
    const amount = (route.request().postDataJSON() as { amount_usd: string }).amount_usd
    billing.quote = {
      ...billingQuote('topup', 'basic', amount),
      quote_id: `expiring-topup-${requests}`,
      credits: requests === 1 ? '1234' : '5678',
      expires_at: new Date(Date.now() + (requests === 1 ? 1200 : 15 * 60_000)).toISOString(),
    }
    await route.fulfill({ json: envelope(billing.quote) })
  })
  await page.goto('/new-task')
  const dialog = await openPricing(page)
  await dialog.getByRole('tab', { name: '积分加购', exact: true }).click()
  await expect(dialog.locator('.pricing-topup-result strong')).toContainText('1,234')
  await expect(dialog.locator('.pricing-topup-result strong')).toContainText('5,678')
  expect(requests).toBe(2)
  await expect(dialog.locator('.pricing-topup-submit')).toBeEnabled()
  expect(billing.requests.some((item) => item.path === '/api/billing/checkouts/topup')).toBe(false)
})

test('a server-stale top-up quote refreshes automatically and requires a new deliberate payment click', async ({
  page,
}) => {
  const billing = await stubBilling(page, { plan: 'basic' })
  let quoteRequests = 0
  const checkouts: Record<string, string>[] = []
  await page.route('**/api/billing/topup-quotes', async (route) => {
    quoteRequests++
    const amount = (route.request().postDataJSON() as { amount_usd: string }).amount_usd
    billing.quote = {
      ...billingQuote('topup', 'basic', amount),
      quote_id: `fresh-topup-${quoteRequests}`,
      credits: quoteRequests === 1 ? '1234' : '5678',
    }
    await route.fulfill({ json: envelope(billing.quote) })
  })
  await page.route('**/api/billing/checkouts/topup', async (route) => {
    checkouts.push(route.request().postDataJSON() as Record<string, string>)
    if (checkouts.length === 1)
      await route.fulfill({
        status: 409,
        json: { code: 40900, data: null, error: { key: 'QUOTE_STALE' } },
      })
    else await route.fallback()
  })
  await page.goto('/new-task')
  const dialog = await openPricing(page)
  await dialog.getByRole('tab', { name: '积分加购', exact: true }).click()
  await expect(dialog.locator('.pricing-topup-result strong')).toContainText('1,234')
  await dialog.locator('.pricing-topup-submit').click()
  await expect(dialog.locator('.pricing-topup-result strong')).toContainText('5,678')
  await expect(dialog.locator('.pricing-topup-submit')).toBeEnabled()
  expect(checkouts).toEqual([{ quote_id: 'fresh-topup-1' }])
  expect(page.url()).toBe(`${origin}/new-task`)
  await expectCheckoutInCurrentTab(page, () => dialog.locator('.pricing-topup-submit').click())
  expect(checkouts).toEqual([{ quote_id: 'fresh-topup-1' }, { quote_id: 'fresh-topup-2' }])
})

test('top-ups use a frozen server quote and return directly to the workspace', async ({ page }) => {
  const billing = await stubBilling(page, { plan: 'basic' })
  await page.goto('/new-task')
  const dialog = await openPricing(page)
  await expect(dialog.getByRole('tab')).toHaveCount(2)
  await dialog.getByRole('tab', { name: '积分加购', exact: true }).click()
  const input = dialog.getByRole('textbox', { name: '加购金额', exact: true })
  await expect(input).toHaveValue('5')
  await expect(dialog.locator('.pricing-topup-result strong')).toContainText('6,789')
  const initialQuotes = billing.requests.filter(
    (item) => item.path === '/api/billing/topup-quotes',
  ).length
  expect(initialQuotes).toBe(1)
  for (const invalid of ['', '4.99', '0', '-5', '20.123', '1e2', 'NaN']) {
    await input.fill(invalid)
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.locator('.pricing-topup-submit')).toBeDisabled()
  }
  await expect(dialog.getByText(/不少于.*5.*两位小数/)).toBeVisible()
  await page.waitForTimeout(450)
  expect(billing.requests.filter((item) => item.path === '/api/billing/topup-quotes')).toHaveLength(
    initialQuotes,
  )
  await input.fill('10.25')
  await expect(dialog.locator('.pricing-topup-result strong')).toContainText('6,789')
  await expect(dialog.locator('.pricing-topup-submit')).toContainText('10.25')
  const quote = billing.requests.findLast((item) => item.path === '/api/billing/topup-quotes')!
  expect(quote.body).toEqual({ amount_usd: '10.25' })
  expect(
    billing.requests.filter((item) => item.path === '/api/billing/checkouts/topup'),
  ).toHaveLength(0)
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await expectCheckoutInCurrentTab(page, () => dialog.locator('.pricing-topup-submit').click())
  const payment = billing.requests.find((item) => item.path === '/api/billing/checkouts/topup')!
  expect(payment.body).toEqual({ quote_id: billing.quote!.quote_id })
  expect(payment.key).toBeTruthy()
  expect(payment.key).not.toBe(quote.key)
  billing.order!.payment_status = 'paid'
  billing.order!.fulfillment_status = 'fulfilled'
  billing.balance = billingBalance('9539')
  await page.getByRole('link', { name: 'Return after payment' }).click()
  await expect(page).toHaveURL(`${origin}/new-task`)
  await expect(page.getByRole('textbox', { name: '交易想法' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => '__billingReturnDocument' in window)).toBe(false)
  await (await settingsTrigger(page)).click()
  await expect(page.locator('.settings-plan-summary')).toContainText('9,539')
})

test('public top-up payment reloads its original URL with the default plans tab', async ({
  page,
}) => {
  const billing = await stubBilling(page, { plan: 'basic' })
  const destination = '/zh-CN/pricing?source=account#credits'
  await page.goto(destination)
  await page.getByRole('tab', { name: '积分加购', exact: true }).click()
  await page.getByRole('textbox', { name: '加购金额', exact: true }).fill('10.25')
  await expect(page.locator('.pricing-topup-result strong')).toContainText('6,789')
  await expectCheckoutInCurrentTab(page, () => page.locator('.pricing-topup-submit').click())
  billing.order!.payment_status = 'paid'
  billing.order!.fulfillment_status = 'fulfilled'
  billing.balance = billingBalance('9539')
  await page.getByRole('link', { name: 'Return after payment' }).click()
  await expect(page).toHaveURL(`${origin}${destination}`)
  await expect(page.getByRole('tab', { name: '会员套餐', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('textbox', { name: '加购金额', exact: true })).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => '__billingReturnDocument' in window)).toBe(false)
  await expectCleanPricing(page)
})

test('upgrade confirmation uses the frozen quote and closes after direct fulfillment without opening a tab', async ({
  page,
}) => {
  const billing = await stubBilling(page, { plan: 'basic' })
  billing.immediateFulfillment = true
  await page.goto('/new-task')
  const dialog = await openPricing(page)
  await expect(
    dialog.getByRole('article', { name: 'Basic', exact: true }).getByRole('button'),
  ).toBeDisabled()
  await dialog.getByRole('article', { name: 'Pro', exact: true }).getByRole('button').click()
  const upgrade = upgradeDialog(page)
  await expect(upgrade).toBeVisible()
  await expect(upgrade).toContainText('32.50')
  expect(
    billing.requests.filter((item) => item.path === '/api/billing/subscription/upgrade'),
  ).toHaveLength(0)
  await upgrade.locator('.pricing-upgrade-confirm').click()
  await expect(upgrade).toBeHidden()
  await expect(
    dialog
      .getByRole('article', { name: 'Pro', exact: true })
      .getByRole('button', { name: '当前套餐', exact: true }),
  ).toBeDisabled()
  await expect(
    dialog.getByRole('article', { name: 'Basic', exact: true }).getByRole('button'),
  ).toBeDisabled()
  await expect(page).toHaveURL(`${origin}/new-task`)
  expect(page.context().pages()).toHaveLength(1)
  await expectCleanPricing(page)
  const payment = billing.requests.find(
    (item) => item.path === '/api/billing/subscription/upgrade',
  )!
  expect(payment.body).toEqual({ quote_id: billing.quote!.quote_id, payment_mode: 'saved_method' })
})

test('upgrade preview recovery after reload reuses its request and opens confirmation without payment', async ({
  page,
}) => {
  const billing = await stubBilling(page, { plan: 'basic' })
  billing.loseResponseNext.add('/api/billing/subscription/upgrade-preview')
  await page.goto('/new-task')
  let dialog = await openPricing(page)
  await dialog.getByRole('article', { name: 'Pro', exact: true }).getByRole('button').click()
  await expect(dialog.locator('.pricing-operation-retry')).toBeVisible()
  await expect(upgradeDialog(page)).toBeHidden()
  await page.reload()
  dialog = await openPricing(page)
  await dialog.locator('.pricing-operation-retry').click()
  const upgrade = upgradeDialog(page)
  await expect(upgrade).toBeVisible()
  await expect(upgrade.locator('.pricing-upgrade-summary')).toContainText('Pro')
  await expect(upgrade.locator('.pricing-upgrade-confirm')).toBeEnabled()
  const attempts = billing.requests.filter(
    (item) => item.path === '/api/billing/subscription/upgrade-preview',
  )
  expect(attempts).toHaveLength(2)
  expect(attempts[1]!.key).toBe(attempts[0]!.key)
  expect(attempts[1]!.body).toEqual(attempts[0]!.body)
  expect(
    billing.requests.filter((item) => item.path === '/api/billing/subscription/upgrade'),
  ).toHaveLength(0)
  await upgrade.locator('.pricing-upgrade-cancel').click()
  await expect(upgrade).toBeHidden()
  await expect(
    dialog.getByRole('article', { name: 'Pro', exact: true }).getByRole('button'),
  ).toBeFocused()
})

test('fulfilled upgrade closes confirmation even when the subsequent entitlement refresh fails', async ({
  page,
}) => {
  const billing = await stubBilling(page, { plan: 'basic' })
  billing.immediateFulfillment = true
  await page.route('**/api/billing/subscription/upgrade', async (route) => {
    billing.failNext.set('/api/billing/account', 3)
    billing.failNext.set('/api/credits/balance', 3)
    await route.fallback()
  })
  await page.goto('/new-task')
  const dialog = await openPricing(page)
  await dialog.getByRole('article', { name: 'Pro', exact: true }).getByRole('button').click()
  const upgrade = upgradeDialog(page)
  await upgrade.locator('.pricing-upgrade-confirm').click()
  await expect(upgrade).toBeHidden()
  await expect(page.locator('.pricing-upgrade-confirm')).toHaveCount(0)
  await expect(dialog.locator('.pricing-feedback-error')).toBeVisible()
  expect(billing.order).toMatchObject({ payment_status: 'paid', fulfillment_status: 'fulfilled' })
  expect(
    billing.requests.filter((item) => item.path === '/api/billing/subscription/upgrade'),
  ).toHaveLength(1)
  await expect(page).toHaveURL(`${origin}/new-task`)
})

test('upgrade other payment methods submits only stripe_page and navigates in the current tab', async ({
  page,
}) => {
  const billing = await stubBilling(page, { plan: 'basic' })
  // This fixture would fulfill a saved-card charge immediately, so the alternate path must not use it.
  billing.immediateFulfillment = true
  const pending = await delayBillingMutation(page, '/api/billing/subscription/upgrade')
  try {
    await page.goto('/new-task')
    const dialog = await openPricing(page)
    await dialog.getByRole('article', { name: 'Pro', exact: true }).getByRole('button').click()
    const upgrade = upgradeDialog(page)
    await expect(upgrade).toBeVisible()
    const other = upgrade.locator('.pricing-upgrade-other')
    const confirm = upgrade.locator('.pricing-upgrade-confirm')
    const pages = page.context().pages().length
    await other.click()
    await expect.poll(() => pending.requests.length).toBe(1)
    expect(pending.requests).toEqual([
      { quote_id: billing.quote!.quote_id, payment_mode: 'stripe_page' },
    ])
    await expect(other).toHaveAttribute('aria-busy', 'true')
    await expect(other).toBeDisabled()
    await expect(confirm).toBeDisabled()
    await expect(upgrade.locator('.pricing-upgrade-cancel')).toBeDisabled()
    await confirm.evaluate((button) => (button as HTMLButtonElement).click())
    await other.evaluate((button) => (button as HTMLButtonElement).click())
    expect(pending.requests).toHaveLength(1)
    pending.release(false)
    await expect(page).toHaveURL(checkoutUrl)
    expect(page.context().pages()).toHaveLength(pages)
    expect(billing.order).toMatchObject({
      payment_mode: 'stripe_page',
      payment_status: 'requires_action',
      fulfillment_status: 'pending',
    })
    expect(
      billing.requests.filter((item) => item.path === '/api/billing/portal-sessions'),
    ).toHaveLength(0)
  } finally {
    pending.release(false)
  }
})

for (const mode of ['saved_method', 'stripe_page'] as const) {
  test(`upgrade ${mode} keeps uncertain payment recovery in the dialog and retries the original mode and key`, async ({
    page,
  }) => {
    const billing = await stubBilling(page, { plan: 'basic' })
    billing.loseResponseNext.add('/api/billing/subscription/upgrade')
    await page.goto('/new-task')
    const dialog = await openPricing(page)
    await dialog.getByRole('article', { name: 'Pro', exact: true }).getByRole('button').click()
    const upgrade = upgradeDialog(page)
    await upgrade
      .locator(mode === 'saved_method' ? '.pricing-upgrade-confirm' : '.pricing-upgrade-other')
      .click()
    await expect(upgrade.locator('.pricing-feedback-error')).toBeVisible()
    const retry = upgrade.locator('.pricing-operation-retry')
    await expect(retry).toBeVisible()
    await expect(upgrade.locator('.pricing-upgrade-confirm')).toBeDisabled()
    await expect(upgrade.locator('.pricing-upgrade-other')).toBeDisabled()
    const acceptedId = billing.order!.id
    await expectCheckoutInCurrentTab(page, () => retry.click())
    expect(billing.order!.id).toBe(acceptedId)
    const attempts = billing.requests.filter(
      (item) => item.path === '/api/billing/subscription/upgrade',
    )
    expect(attempts).toHaveLength(2)
    expect(attempts[0]!.body).toEqual({ quote_id: billing.quote!.quote_id, payment_mode: mode })
    expect(attempts[1]!.key).toBe(attempts[0]!.key)
    expect(attempts[1]!.body).toEqual(attempts[0]!.body)
    expect(
      billing.requests.filter((item) => item.path === '/api/billing/subscription/upgrade-preview'),
    ).toHaveLength(1)
  })
}

for (const paymentMode of [undefined, 'unrecognized_mode']) {
  test(`upgrade persisted request with ${paymentMode === undefined ? 'missing' : 'invalid'} payment mode stays blocked through reload without changing its request`, async ({
    page,
  }) => {
    const billing = await stubBilling(page, { plan: 'pro' })
    const storageKey = `speakquant-billing:${testUser.id}`
    const body: Record<string, string> = { quote_id: '01M4T000000000000000000002' }
    if (paymentMode !== undefined) body.payment_mode = paymentMode
    const persisted = {
      operation: {
        kind: 'order',
        path: '/billing/subscription/upgrade',
        body,
        key: 'unknown-upgrade-payment-mode-original-key',
      },
      orderId: null,
    }
    await page.addInitScript(
      ({ key, saved }) => {
        // Seed once so a reload cannot hide an accidental deletion or rewrite of the request.
        const marker = 'billing-unknown-payment-mode-seeded'
        if (sessionStorage.getItem(marker)) return
        sessionStorage.setItem(marker, 'true')
        localStorage.setItem(key, JSON.stringify(saved))
      },
      { key: storageKey, saved: persisted },
    )
    await page.goto('/new-task')
    for (const reloaded of [false, true]) {
      if (reloaded) await page.reload()
      const dialog = await openPricing(page)
      await expect(dialog.locator('.pricing-feedback-error')).toHaveText(
        '无法确认付款方式，请联系支持核对原订单。',
      )
      await expect(dialog.locator('.pricing-operation-retry')).toHaveCount(0)
      const upgrade = dialog.getByRole('article', { name: 'Max', exact: true }).getByRole('button')
      await expect(upgrade).toBeDisabled()
      await upgrade.evaluate((button) => (button as HTMLButtonElement).click())
      await expect(upgradeDialog(page)).toBeHidden()
      await expect(page.locator('.pricing-upgrade-other')).toHaveCount(0)
      expect(
        billing.requests.filter((item) => item.path === '/api/billing/subscription/upgrade'),
      ).toHaveLength(0)
      expect(
        billing.requests.filter(
          (item) => item.path === '/api/billing/subscription/upgrade-preview',
        ),
      ).toHaveLength(0)
      expect(
        await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), storageKey),
      ).toEqual(persisted)
    }
  })
}

for (const previousLink of ['expired', 'missing'] as const) {
  test(`upgrade stripe_page resumes its same order after returning when its payment link is ${previousLink}`, async ({
    page,
  }) => {
    const billing = await stubBilling(page, { plan: 'basic' })
    await page.goto('/new-task')
    const dialog = await openPricing(page)
    await dialog.getByRole('article', { name: 'Pro', exact: true }).getByRole('button').click()
    await expectCheckoutInCurrentTab(page, () =>
      upgradeDialog(page).locator('.pricing-upgrade-other').click(),
    )
    const orderId = billing.order!.id
    billing.order!.payment_action =
      previousLink === 'missing'
        ? null
        : {
            ...billingPaymentAction(),
            url: 'https://checkout.stripe.com/c/pay/expired_upgrade',
            expires_at: '2000-01-01T00:00:00Z',
          }
    billing.quote!.expires_at = '2000-01-01T00:00:00Z'
    await page.getByRole('link', { name: 'Back to pricing' }).click()
    await expect(page).toHaveURL(`${origin}/pricing`)
    const continuePayment = page
      .getByRole('article', { name: 'Pro', exact: true })
      .getByRole('button', { name: 'Continue payment', exact: true })
    await expect(continuePayment).toBeEnabled()
    await expectCheckoutInCurrentTab(page, () => continuePayment.click())
    expect(billing.order!.id).toBe(orderId)
    const resume = billing.requests.filter(
      (item) => item.path === `/api/billing/orders/${orderId}/payment-page`,
    )
    expect(resume).toHaveLength(1)
    expect(resume[0]!.method).toBe('POST')
    expect(resume[0]!.body).toBeNull()
    expect(resume[0]!.key).toBeTruthy()
    const create = billing.requests.filter(
      (item) => item.path === '/api/billing/subscription/upgrade',
    )
    expect(create).toHaveLength(1)
    expect(resume[0]!.key).not.toBe(create[0]!.key)
    expect(
      billing.requests.filter((item) => item.path === '/api/billing/subscription/upgrade-preview'),
    ).toHaveLength(1)
  })
}

test('upgrade payment-page recovery after reload reuses the same order and continuation key', async ({
  page,
}) => {
  const billing = await stubBilling(page, { plan: 'basic' })
  await page.goto('/new-task')
  const dialog = await openPricing(page)
  await dialog.getByRole('article', { name: 'Pro', exact: true }).getByRole('button').click()
  await expectCheckoutInCurrentTab(page, () =>
    upgradeDialog(page).locator('.pricing-upgrade-other').click(),
  )
  const orderId = billing.order!.id
  const paymentPage = `/api/billing/orders/${orderId}/payment-page`
  billing.order!.payment_action = null
  billing.loseResponseNext.add(paymentPage)
  await page.getByRole('link', { name: 'Back to pricing' }).click()
  await page.getByRole('button', { name: 'Continue payment', exact: true }).click()
  await expect(page.locator('.pricing-operation-retry')).toBeVisible()
  await page.reload()
  await expect(page.locator('.pricing-operation-retry')).toBeVisible()
  await expectCheckoutInCurrentTab(page, () => page.locator('.pricing-operation-retry').click())
  expect(billing.order!.id).toBe(orderId)
  const attempts = billing.requests.filter((item) => item.path === paymentPage)
  expect(attempts).toHaveLength(2)
  expect(attempts[0]!.body).toBeNull()
  expect(attempts[1]!.body).toBeNull()
  expect(attempts[1]!.key).toBe(attempts[0]!.key)
  expect(
    billing.requests.filter((item) => item.path === '/api/billing/subscription/upgrade'),
  ).toHaveLength(1)
  expect(
    billing.requests.filter((item) => item.path === '/api/billing/subscription/upgrade-preview'),
  ).toHaveLength(1)
})

test('upgrade already paid with pending fulfillment never navigates to a stale payment URL', async ({
  page,
}) => {
  const billing = await stubBilling(page, { plan: 'basic' })
  billing.orderOverrides = { payment_status: 'paid', fulfillment_status: 'pending' }
  await page.goto('/new-task')
  const dialog = await openPricing(page)
  await dialog.getByRole('article', { name: 'Pro', exact: true }).getByRole('button').click()
  const upgrade = upgradeDialog(page)
  await upgrade.locator('.pricing-upgrade-confirm').click()
  await expect(upgrade.locator('.pricing-feedback-error')).toBeVisible()
  await expect(upgrade.locator('.pricing-upgrade-confirm')).toHaveAttribute('aria-busy', 'false')
  await expect(page).toHaveURL(`${origin}/new-task`)
  expect(billing.order).toMatchObject({ payment_status: 'paid', fulfillment_status: 'pending' })
  expect(billing.order!.payment_action?.url).toBe(checkoutUrl)
  await expect(upgrade.locator('.pricing-upgrade-confirm')).toBeDisabled()
  await expect(upgrade.locator('.pricing-upgrade-other')).toBeDisabled()
  await upgrade
    .locator('.pricing-upgrade-confirm')
    .evaluate((button) => (button as HTMLButtonElement).click())
  await upgrade
    .locator('.pricing-upgrade-other')
    .evaluate((button) => (button as HTMLButtonElement).click())
  expect(
    billing.requests.filter((item) => item.path === '/api/billing/subscription/upgrade'),
  ).toHaveLength(1)
})

test.describe('upgrade preview contract', () => {
  test.use({ timezoneId: 'Asia/Shanghai' })

  test('upgrade displays the quoted current plan, card leading zeros and estimated new billing date', async ({
    page,
  }) => {
    const billing = await stubBilling(page, { plan: 'basic' })
    billing.upgradeQuoteOverrides = {
      current_plan: {
        code: 'basic',
        version: 'paid-quote-snapshot',
        price_usd: '15.25',
        monthly_credits: '9234',
      },
    }
    await page.goto('/new-task')
    const dialog = await openPricing(page)
    await dialog.getByRole('article', { name: 'Pro', exact: true }).getByRole('button').click()
    const upgrade = upgradeDialog(page)
    await expect(upgrade.locator('.pricing-upgrade-summary')).toContainText('9,234')
    await expect(upgrade.locator('.pricing-upgrade-summary')).not.toContainText('8,400')
    await expect(upgrade.locator('.pricing-upgrade-payment-detail')).toContainText('Visa*0042')
    await expect(upgrade.locator('.pricing-upgrade-period')).toContainText('预计下次扣款：')
    // UTC December 1 at 20:30 is December 2 in Shanghai; the old account period ends in 2099.
    await expect(upgrade.locator('.pricing-upgrade-period')).toContainText(/2026.*12.*2/)
    await expect(upgrade.locator('.pricing-upgrade-period')).not.toContainText('2099')
    expect(
      billing.requests.filter((item) => item.path === '/api/billing/subscription/upgrade'),
    ).toHaveLength(0)
  })
})

test('upgrade shows an explicit null-card state without inventing a card summary', async ({
  page,
}) => {
  const billing = await stubBilling(page, { plan: 'basic' })
  billing.upgradeQuoteOverrides = { payment_method: null }
  await page.goto('/new-task')
  const dialog = await openPricing(page)
  await dialog.getByRole('article', { name: 'Pro', exact: true }).getByRole('button').click()
  const upgrade = upgradeDialog(page)
  await expect(upgrade.locator('.pricing-upgrade-payment-detail')).toContainText(
    '暂无可显示的默认银行卡',
  )
  await expect(upgrade.locator('.pricing-upgrade-payment-detail')).not.toContainText('0042')
  await expect(upgrade.locator('.pricing-upgrade-payment-detail')).not.toContainText(/visa/i)
  await expect(upgrade.locator('.pricing-upgrade-other')).toBeEnabled()
  expect(
    billing.requests.filter((item) => item.path === '/api/billing/subscription/upgrade'),
  ).toHaveLength(0)
})

test('expired upgrade quotes require a new quote and another explicit confirmation before payment', async ({
  page,
}) => {
  const billing = await stubBilling(page, { plan: 'basic' })
  await page.clock.install()
  await page.goto('/new-task')
  const dialog = await openPricing(page)
  await dialog.getByRole('article', { name: 'Pro', exact: true }).getByRole('button').click()
  const upgrade = upgradeDialog(page)
  await expect(upgrade.locator('.pricing-upgrade-amounts')).toContainText('32.50')
  const oldQuoteId = billing.quote!.quote_id
  await page.clock.fastForward(16 * 60_000)
  const confirm = upgrade.locator('.pricing-upgrade-confirm')
  if (await confirm.isEnabled()) await confirm.click()
  await expect(upgrade.locator('.pricing-upgrade-refresh-quote')).toBeVisible()
  expect(
    billing.requests.filter((item) => item.path === '/api/billing/subscription/upgrade'),
  ).toHaveLength(0)
  expect(
    billing.requests.filter((item) => item.path === '/api/billing/subscription/upgrade-preview'),
  ).toHaveLength(1)

  billing.upgradeQuoteOverrides = {
    amount_usd: '45.75',
    expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
  }
  await upgrade.locator('.pricing-upgrade-refresh-quote').click()
  await expect(upgrade.locator('.pricing-upgrade-amounts')).toContainText('45.75')
  await expect(confirm).toBeEnabled()
  expect(
    billing.requests.filter((item) => item.path === '/api/billing/subscription/upgrade'),
  ).toHaveLength(0)
  const previews = billing.requests.filter(
    (item) => item.path === '/api/billing/subscription/upgrade-preview',
  )
  expect(previews).toHaveLength(2)
  expect(previews[1]!.key).not.toBe(previews[0]!.key)
  expect(billing.quote!.quote_id).not.toBe(oldQuoteId)
  await expectCheckoutInCurrentTab(page, () => confirm.click())
  const payments = billing.requests.filter(
    (item) => item.path === '/api/billing/subscription/upgrade',
  )
  expect(payments).toHaveLength(1)
  expect(payments[0]!.body).toEqual({
    quote_id: billing.quote!.quote_id,
    payment_mode: 'saved_method',
  })
})

test('English public pricing uses the same upgrade dialog and returns focus after cancellation', async ({
  page,
}) => {
  const billing = await stubBilling(page, { plan: 'basic' })
  // Enter through the hydrated public navigation so browser mocks cover the catalog request.
  await page.goto('/contact')
  await expect(page.getByRole('button', { name: 'Language', exact: true })).toBeEnabled()
  await page.getByRole('banner').getByRole('link', { name: 'Pricing', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/pricing`)
  const pro = page.getByRole('article', { name: 'Pro', exact: true }).getByRole('button')
  await expect(pro).toBeEnabled()
  await pro.click()
  const upgrade = upgradeDialog(page, true)
  await expect(upgrade).toBeVisible()
  await expect(upgrade.locator('.pricing-upgrade-summary')).toContainText('Basic')
  await expect(upgrade.locator('.pricing-upgrade-summary')).toContainText('Pro')
  await expect(upgrade.locator('.pricing-upgrade-confirm')).toHaveAccessibleName('Pay now')
  await expect(upgrade.locator('.pricing-upgrade-cancel')).toHaveAccessibleName('Cancel')
  await expect(upgrade.locator('.pricing-upgrade-payment-detail')).toContainText('Visa*0042')
  await expect(upgrade.locator('.pricing-upgrade-terms')).toContainText(
    'Unused monthly credits expire. Signup and top-up credits stay.',
  )
  await expect(upgrade.locator('.pricing-upgrade-period')).toContainText('Next billing (est.):')
  await expect(upgrade.locator('.pricing-upgrade-other')).toHaveAccessibleName(
    'Other payment methods',
  )
  expect(await upgrade.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await expect(upgrade.locator('.pricing-upgrade-confirm')).toBeInViewport({ ratio: 1 })
  await page.screenshot({
    path: test.info().outputPath('upgrade-confirmation-public-english.png'),
    animations: 'disabled',
  })
  await upgrade.locator('.pricing-upgrade-cancel').click()
  await expect(upgrade).toBeHidden()
  await expect(pro).toBeFocused()
  expect(
    billing.requests.filter((item) => item.path === '/api/billing/subscription/upgrade'),
  ).toHaveLength(0)
  await expect(page).toHaveURL(`${origin}/pricing`)
})

test('failed checkout retries the same request and idempotency key after reload', async ({
  page,
}) => {
  const billing = await stubBilling(page)
  billing.failNext.set('/api/billing/checkouts/subscription', 1)
  await page.goto('/new-task')
  let dialog = await openPricing(page)
  await dialog.getByRole('button', { name: '选择 Basic', exact: true }).click()
  await expect(dialog.locator('.pricing-operation-retry')).toBeVisible()
  await page.reload()
  dialog = await openPricing(page)
  await expect(dialog.locator('.pricing-operation-retry')).toBeVisible()
  await expectCheckoutInCurrentTab(page, () => dialog.locator('.pricing-operation-retry').click())
  const attempts = billing.requests.filter(
    (item) => item.path === '/api/billing/checkouts/subscription',
  )
  expect(attempts).toHaveLength(2)
  expect(attempts[1]!.body).toEqual(attempts[0]!.body)
  expect(attempts[1]!.key).toBe(attempts[0]!.key)
})

test('a lost checkout response retries its accepted order with the original operation key', async ({
  page,
}) => {
  const billing = await stubBilling(page)
  billing.loseResponseNext.add('/api/billing/checkouts/subscription')
  await page.goto('/new-task')
  const dialog = await openPricing(page)
  await dialog.getByRole('button', { name: '选择 Basic', exact: true }).click()
  await expect(dialog.locator('.pricing-operation-retry')).toBeVisible()
  const acceptedId = billing.order!.id
  await expectCheckoutInCurrentTab(page, () => dialog.locator('.pricing-operation-retry').click())
  expect(billing.order!.id).toBe(acceptedId)
  const attempts = billing.requests.filter(
    (item) => item.path === '/api/billing/checkouts/subscription',
  )
  expect(attempts).toHaveLength(2)
  expect(attempts[1]!.key).toBe(attempts[0]!.key)
  expect(attempts[1]!.body).toEqual(attempts[0]!.body)
})

test('refunded payments return to the source without granting a membership', async ({ page }) => {
  const billing = await stubBilling(page)
  await page.goto('/new-task')
  const dialog = await openPricing(page)
  await expectCheckoutInCurrentTab(page, () =>
    dialog.getByRole('button', { name: '选择 Basic', exact: true }).click(),
  )
  billing.order!.payment_status = 'refunded'
  billing.order!.fulfillment_status = 'fulfilled'
  billing.account = billingAccount()
  await page.getByRole('link', { name: 'Return after payment' }).click()
  await expect(page).toHaveURL(`${origin}/new-task`)
  await expect(page.getByRole('textbox', { name: '交易想法' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await (await settingsTrigger(page)).click()
  await expect(page.locator('.settings-plan-summary')).toContainText('Free')
  await expectCleanPricing(page)
})

test('free users only see subscription plans and never request top-up quotes', async ({ page }) => {
  const billing = await stubBilling(page)
  await page.goto('/new-task')
  const dialog = await openPricing(page)
  await expect(dialog.getByRole('tab')).toHaveCount(0)
  await expect(dialog.getByRole('article')).toHaveCount(3)
  await expect(dialog.getByRole('textbox', { name: '加购金额', exact: true })).toHaveCount(0)
  await expect(dialog.locator('.pricing-empty-state')).toHaveCount(0)
  await expectCleanPricing(page)
  expect(billing.requests.some((item) => item.path === '/api/billing/topup-quotes')).toBe(false)
})

test('English dark theme preserves modal keyboard focus and responsive top-up layout', async ({
  page,
}) => {
  await stubBilling(page, { plan: 'basic' })
  await page
    .context()
    .addCookies([{ name: 'trade-locale-manual', value: 'en-US', domain: 'localhost', path: '/' }])
  await page.goto('/new-task')
  const dialog = await openPricing(page, true)
  await expect(
    dialog.getByRole('article', { name: 'Pro', exact: true }).getByRole('button'),
  ).toBeEnabled()
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark'
    document.documentElement.classList.add('dark')
  })
  const close = dialog.getByRole('button', { name: 'Close', exact: true })
  await close.focus()
  await close.press('Shift+Tab')
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  await dialog.getByRole('tab', { name: 'Credit top-ups', exact: true }).click()
  await expect(dialog.getByRole('textbox', { name: 'Top-up amount', exact: true })).toHaveValue('5')
  await expect(dialog.locator('.pricing-topup-result strong')).toContainText('6,789')
  await expect(dialog.locator('.pricing-topup-submit')).toHaveAccessibleName('Pay $5.00')
  await expect(dialog.getByText('Minimum $5 USD', { exact: true })).toBeVisible()
  await expect(
    dialog.getByText(/Credits appear after your quote|The server confirms|Review quote/),
  ).toHaveCount(0)
  await expectCleanPricing(page)
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await dialog.locator('.pricing-topup-submit').scrollIntoViewIfNeeded()
  await page.screenshot({
    path: test.info().outputPath('billing-english-dark.png'),
    animations: 'disabled',
  })
})

test('payment return waits for authoritative fulfillment before restoring the source', async ({
  page,
}) => {
  const billing = await stubBilling(page)
  await page.goto('/new-task')
  const dialog = await openPricing(page)
  await expectCheckoutInCurrentTab(page, () =>
    dialog.getByRole('button', { name: '选择 Basic', exact: true }).click(),
  )
  billing.order!.payment_status = 'paid'
  await page.getByRole('link', { name: 'Return after payment' }).click()
  await expect(page).toHaveURL(/\/billing\/payment-return\?order_id=/)
  await expect(page.locator('.billing-return-actions')).toHaveCount(0)
  await expect
    .poll(
      () =>
        billing.requests.filter(
          (request) => request.path === `/api/billing/orders/${billing.order!.id}`,
        ).length,
    )
    .toBeGreaterThan(0)
  // Payment confirmation alone must not mark a plan current while fulfillment is still pending.
  await expect(page.getByRole('button', { name: '当前套餐', exact: true })).toHaveCount(0)
  billing.order!.fulfillment_status = 'fulfilled'
  billing.account = billingAccount('basic')
  await expect(page).toHaveURL(`${origin}/new-task`)
  await expect(page.getByRole('textbox', { name: '交易想法' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => '__billingReturnDocument' in window)).toBe(false)
  await (await settingsTrigger(page)).click()
  await expect(page.locator('.settings-plan-summary')).toContainText('Basic')
  await expectCleanPricing(page)
})

test('payment return without a saved source uses pricing and reads the authoritative order', async ({
  page,
}) => {
  const billing = await stubBilling(page)
  billing.order = billingOrder()
  billing.order.payment_status = 'refunded'
  billing.order.fulfillment_status = 'fulfilled'
  await page.goto(`/billing/payment-return?order_id=${billing.order.id}&success=true`)
  await expect(page).toHaveURL(/\/(?:zh-CN\/)?pricing$/)
  await expect(page.getByRole('button', { name: /^(Current plan|当前套餐)$/ })).toHaveCount(0)
  await expectCleanPricing(page)
  expect(
    billing.requests.some((request) => request.path === `/api/billing/orders/${billing.order!.id}`),
  ).toBe(true)
})

test('payment return requires sign-in and preserves the original order query', async ({ page }) => {
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      status: 401,
      json: { code: 40101, data: null, error: { key: 'AUTH_REQUIRED' } },
    }),
  )
  const destination =
    '/billing/payment-return?order_id=01M4T000000000000000000001&session_id=cs_fixture'
  await page.goto(destination)
  await expect(page).toHaveURL(/\/login\?/)
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe(destination)
  await expect(page.locator('.billing-return')).toHaveCount(0)
})
