import { expect, test } from '@playwright/test'
import { anonymous, authResponse, envelope, stubHistory } from './auth-fixtures'

const origin = 'http://localhost:6002'
test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ status: 401, json: anonymous }),
  )
  await page.route('**/api/auth/google/config', (route) => route.fulfill({ status: 503, json: {} }))
})

test('public language URLs render stable SSR, including legal drafts and pricing', async ({
  request,
}) => {
  for (const [path, language, title] of [
    ['/', 'en-US', 'Test your trading idea'],
    ['/zh-CN', 'zh-CN', '验证你的交易想法'],
    ['/pricing', 'en-US', 'Choose the right plan for you'],
    ['/zh-CN/pricing', 'zh-CN', '选择适合你的套餐'],
    ['/privacy', 'en-US', 'Privacy Policy'],
    ['/zh-CN/privacy', 'zh-CN', '隐私政策'],
    ['/terms', 'en-US', 'Terms of Service'],
    ['/zh-CN/terms', 'zh-CN', '服务条款'],
    ['/contact', 'en-US', 'Contact'],
    ['/zh-CN/contact', 'zh-CN', '联系我们'],
    ['/open-source', 'en-US', 'TradingView'],
    ['/zh-CN/open-source', 'zh-CN', 'TradingView'],
  ]) {
    const response = await request.get(path!, {
      headers: {
        cookie:
          path === '/' ? 'trade-locale=zh-CN' : 'trade-locale=zh-CN; trade-locale-manual=zh-CN',
        'accept-language': 'zh-CN',
      },
    })
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain(`lang="${language}"`)
    expect(html).toContain(title!)
    expect(html).toContain(`rel="canonical" href="https://speakquant.com${path}"`)
    expect(html).toContain('hreflang="en-US"')
    expect(html).toContain('hreflang="zh-CN"')
    expect(html).toContain('https://speakquant.com/social-card.png')
    if (/privacy|terms|refunds|contact/.test(path!))
      expect(html).toContain('content="noindex, nofollow"')
  }
})

test('fresh visitors default to English and an old automatic Chinese cookie is ignored', async ({
  page,
}) => {
  await page.context().addCookies([{ name: 'trade-locale', value: 'zh-CN', url: origin }])
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Test your trading ideain 3 minutes.',
  )
  await expect(
    page.locator('.public-header').getByRole('link', { name: 'How it works' }),
  ).toHaveCount(0)
  await expect(page.locator('.public-footer a')).toHaveCount(4)
  await expect(page.locator('.public-footer')).not.toContainText('Historical results')
  await page.goto('/login')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in or sign up')
})

test('language switch changes the address, preserves a draft and persists through sign-out', async ({
  page,
  isMobile,
}) => {
  await stubHistory(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Reversal', exact: true }).click()
  const draft = 'My edited reversal hypothesis'
  await page.getByRole('textbox', { name: 'Trading idea' }).fill(draft)
  await page.getByRole('button', { name: 'Interface language', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: '中文', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/zh-CN`)
  await expect(page.getByRole('textbox', { name: '交易想法' })).toHaveValue(draft)
  await page.reload()
  await expect(page.getByRole('textbox', { name: '交易想法' })).toHaveValue(draft)
  await page.goto('/?source=return#method')
  await expect(page).toHaveURL(`${origin}/zh-CN?source=return#method`)
  await expect(page.getByRole('textbox', { name: '交易想法' })).toHaveValue(draft)
  await page.getByRole('link', { name: '价格', exact: true }).first().click()
  await expect(page).toHaveURL(`${origin}/zh-CN/pricing`)
  await page.getByRole('button', { name: '界面语言', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'EN', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/pricing`)
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ json: envelope(authResponse) }),
  )
  await page.route('**/api/auth/logout', (route) =>
    route.fulfill({ json: envelope({ logged_out: true }) }),
  )
  await page.goto('/new-task')
  await expect(page.getByRole('heading', { name: 'What will you explore today?' })).toBeVisible()
  if (isMobile)
    await page.getByRole('button', { name: 'Expand sidebar' }).filter({ visible: true }).click()
  await page
    .getByRole('button', { name: 'Profile & preferences' })
    .filter({ visible: true })
    .click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sign in or sign up' })).toBeVisible()
  expect(
    (await page.context().cookies()).find((cookie) => cookie.name === 'trade-locale-manual')?.value,
  ).toBe('en-US')
})

test('examples fill matching ideas without writes; navigating policies preserves the draft', async ({
  page,
}) => {
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && !request.url().endsWith('/auth/refresh'))
      writes.push(request.url())
  })
  await page.goto('/')
  const input = page.getByRole('textbox', { name: 'Trading idea' })
  await expect(page.getByRole('button', { name: 'Submit research idea' })).toBeDisabled()
  for (const [label, expected] of [
    ['Trend', 'moving average'],
    ['Breakout', 'rising volume'],
    ['Reversal', 'trend reversal'],
    ['Timeframes', 'hourly signals'],
  ]) {
    await page.getByRole('button', { name: label!, exact: true }).click()
    await expect(input).toHaveValue(new RegExp(expected!))
    await expect(input).toBeFocused()
  }
  await input.fill('A draft to keep')
  await page.getByRole('link', { name: 'Privacy Policy', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/privacy`)
  await page.getByRole('link', { name: 'Trade Lab', exact: true }).click()
  await expect(input).toHaveValue('A draft to keep')
  expect(writes).toEqual([])
})

test('public language menu keeps the header stable when opening, closing and changing language', async ({
  page,
}) => {
  for (const signedIn of [false, true]) {
    if (signedIn) {
      await page.route('**/api/auth/refresh', (route) =>
        route.fulfill({ json: envelope(authResponse) }),
      )
    }
    await page.goto('/pricing')
    const language = page.locator('.public-header .preference-select')
    await expect(language).toBeEnabled()
    await expect(page.locator('.public-account-link')).toHaveText(
      signedIn ? 'Workspace' : 'Sign in',
    )
    await page.evaluate(() => window.scrollTo({ top: 180, behavior: 'instant' }))
    const geometry = () =>
      page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        bodyOverflow: document.body.style.overflow,
        bodyPadding: document.body.style.paddingRight,
        boxes: [
          '.public-header',
          '.public-brand-link',
          '.public-pricing-link',
          '.preference-select',
          '.public-account-link',
          '.public-menu-toggle',
        ].map((selector) => {
          const { x, y, width, height } = document.querySelector(selector)!.getBoundingClientRect()
          return { x, y, width, height }
        }),
      }))
    const before = await geometry()
    await language.click()
    await expect(page.getByRole('menu')).toBeVisible()
    expect(await geometry()).toEqual(before)
    expect(await page.evaluate(() => window.scrollY)).toBe(180)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toBeHidden()
    await expect(language).toBeFocused()
    expect(await geometry()).toEqual(before)
    await language.click()
    await page.getByRole('heading', { name: 'Free', exact: true }).click()
    await expect(page.getByRole('menu')).toBeHidden()
    expect(await geometry()).toEqual(before)
    for (const [label, pathname] of [
      ['中文', '/zh-CN/pricing'],
      ['EN', '/pricing'],
    ]) {
      await language.click()
      await page.getByRole('menuitemcheckbox', { name: label!, exact: true }).click()
      await expect(page).toHaveURL(`${origin}${pathname}`)
      await expect(page.getByRole('menu')).toBeHidden()
      expect(await geometry()).toEqual(before)
    }
  }
})

test('policies open in a new tab without cancelling the login operation', async ({
  page,
  context,
}) => {
  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Email address' }).fill('draft@example.com')
  const popupPromise = context.waitForEvent('page')
  await page.getByRole('link', { name: 'Privacy Policy' }).click()
  const popup = await popupPromise
  await expect(popup).toHaveURL(`${origin}/privacy`)
  await expect(popup.getByRole('heading', { level: 1 })).toHaveText('Privacy Policy')
  await expect(page.getByRole('textbox', { name: 'Email address' })).toHaveValue(
    'draft@example.com',
  )
  await popup.close()
})

test('pricing is an honest preview and Free has no research entry', async ({ page }) => {
  await page.goto('/pricing')
  await expect(page.getByText('Current plan', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Membership plans', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('tab', { name: 'Credit top-ups', exact: true })).toBeVisible()
  for (const plan of ['Pro', 'Max']) {
    await page.getByRole('button', { name: `Choose ${plan}`, exact: true }).click()
    await expect(page.getByText('Payments coming soon', { exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await expect(page.locator('.pricing-plan')).toHaveCount(3)
  await expect(page.locator('.public-credit-examples')).toContainText('About 10–30 credits / task')
  await expect(page.locator('.public-usage-note')).toContainText('Illustrative usage only')
  await expect(page.locator('#billing')).toContainText('Cancellation stops renewal')
  const cards = await page.locator('.pricing-plan-grid').boundingBox()
  expect(cards).not.toBeNull()
  for (const selector of [
    '.public-pricing-details',
    '#credits',
    '#billing',
    '.public-credit-examples',
  ]) {
    const details = await page.locator(selector).boundingBox()
    expect(details).not.toBeNull()
    expect(Math.abs(cards!.x - details!.x)).toBeLessThan(1)
    expect(Math.abs(cards!.width - details!.width)).toBeLessThan(1)
  }
  await expect(page.getByRole('button', { name: 'Free plan', exact: true })).toBeDisabled()
  await expect(page.getByRole('link', { name: 'Start research', exact: true })).toHaveCount(0)
})

test('pricing tabs keep the same surface from server-only first paint through hydration', async ({
  browser,
  page,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: page.viewportSize(),
  })
  try {
    const serverPage = await context.newPage()
    for (const path of ['/pricing', '/zh-CN/pricing']) {
      await serverPage.goto(`${origin}${path}`)
      const trigger = serverPage.locator('.pricing-tab-trigger[data-state="active"]')
      await expect(trigger).toBeVisible()
      await expect(serverPage.locator('.pricing-tab-indicator')).toHaveCount(0)
      const firstPaint = await trigger.evaluate((element) => ({
        background: getComputedStyle(element, '::before').backgroundColor,
        radius: getComputedStyle(element, '::before').borderRadius,
        shadow: getComputedStyle(element, '::before').boxShadow,
        opacity: getComputedStyle(element).opacity,
        surface: getComputedStyle(document.querySelector('.pricing-plan')!).backgroundColor,
      }))
      expect(firstPaint.background).toBe(firstPaint.surface)
      expect(firstPaint.opacity).toBe('1')
      await serverPage.screenshot({
        path: test.info().outputPath(`pricing-ssr-${path.includes('zh-CN') ? 'zh' : 'en'}.png`),
      })

      await page.goto(path)
      await expect(page.locator('.pricing-tab-trigger[data-state="active"]')).toBeEnabled()
      const indicator = page.locator('.pricing-tab-indicator')
      await expect(indicator).toBeVisible()
      await expect(indicator).toHaveCSS('background-color', firstPaint.background)
      await expect(indicator).toHaveCSS('border-radius', firstPaint.radius)
      await expect(indicator).toHaveCSS('box-shadow', firstPaint.shadow)
    }
  } finally {
    await context.close()
  }
})

test('pricing updates the current plan after delayed session restoration without a research CTA', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (/hydration.*mismatch/i.test(message.text())) errors.push(message.text())
  })
  let restore!: () => void
  const restored = new Promise<void>((resolve) => {
    restore = resolve
  })
  await page.route('**/api/auth/refresh', async (route) => {
    await restored
    await route.fulfill({ json: envelope(authResponse) })
  })
  await page.goto('/pricing', { waitUntil: 'domcontentloaded' })
  try {
    await expect(page.getByRole('tab', { name: 'Membership plans', exact: true })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Free plan', exact: true })).toBeDisabled()
    await expect(page.getByText('Start research', { exact: true })).toHaveCount(0)
  } finally {
    restore()
  }
  await expect(page.getByRole('button', { name: 'Current plan', exact: true })).toBeDisabled()
  await page.getByRole('tab', { name: 'Credit top-ups', exact: true }).click()
  await expect(page.getByText('Current membership', { exact: true })).toBeVisible()
  await expect(page.getByText('Top-up rate preview', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('public pricing shares the credit calculator, tab state and payment preview in both languages', async ({
  page,
  isMobile,
}) => {
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && !request.url().endsWith('/auth/refresh'))
      writes.push(request.url())
  })
  for (const copy of [
    {
      path: '/pricing',
      plans: 'Membership plans',
      credits: 'Credit top-ups',
      input: 'Top-up amount',
      preview: 'Top-up rate preview',
      notice: 'Payments coming soon',
    },
    {
      path: '/zh-CN/pricing',
      plans: '会员套餐',
      credits: '积分加购',
      input: '加购金额',
      preview: '加购单价示例',
      notice: '支付功能待上线',
    },
  ]) {
    await page.goto(copy.path)
    const plans = page.getByRole('tab', { name: copy.plans, exact: true })
    const credits = page.getByRole('tab', { name: copy.credits, exact: true })
    await expect(plans).toBeEnabled()
    await plans.focus()
    await plans.press('ArrowRight')
    await expect(credits).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText(copy.preview, { exact: true })).toBeVisible()
    const input = page.getByRole('textbox', { name: copy.input, exact: true })
    await expect(input).toHaveValue('5')
    await page.getByRole('button', { name: '$10', exact: true }).click()
    await expect(page.locator('.pricing-topup-result strong')).toContainText('666')
    await input.fill('')
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator('.pricing-topup button[type="submit"]')).toBeDisabled()
    await input.fill('75')
    await expect(page.locator('.pricing-topup-result strong')).toContainText('5,000')
    await plans.click()
    await credits.click()
    await expect(input).toHaveValue('75')
    await input.press('Enter')
    await expect(page.getByText(copy.notice, { exact: true })).toBeVisible()
    await expect(input).toBeFocused()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL(`${origin}${copy.path}`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByText(copy.notice, { exact: true })).toBeHidden()
    await page.screenshot({
      path: `/tmp/trade-public-topup-${copy.path.startsWith('/zh-CN') ? 'zh' : 'en'}-${isMobile ? 'mobile' : 'desktop'}.png`,
      fullPage: true,
    })
  }
  expect(writes).toEqual([])
})

test('refund links reach pricing and open-source notices remain accessible through terms', async ({
  page,
  request,
}) => {
  for (const prefix of ['', '/zh-CN']) {
    const response = await request.get(`${prefix}/refunds`, { maxRedirects: 0 })
    expect(response.status()).toBe(301)
    expect(response.headers().location).toBe(`${prefix}/pricing#billing`)
    await page.goto(`${prefix}/refunds`)
    await expect(page).toHaveURL(`${origin}${prefix}/pricing#billing`)
    await expect(page.locator('#billing')).toBeInViewport()
    await expect
      .poll(async () => (await page.locator('#billing').boundingBox())?.y ?? 0)
      .toBeGreaterThanOrEqual(60)
    await expect(page.locator('.public-footer a[href$="/refunds"]')).toHaveCount(0)
    await expect(page.locator('.public-footer a[href$="/open-source"]')).toHaveCount(0)
    await page.goto(`${prefix}/terms`)
    await page.locator('.public-document a[href$="/open-source"]').click()
    await expect(page).toHaveURL(`${origin}${prefix}/open-source`)
    await expect(page.locator('.open-source-page')).toContainText('Copyright')
    await expect(page.getByRole('link', { name: 'TradingView', exact: true })).toHaveAttribute(
      'href',
      'https://www.tradingview.com/',
    )
  }
})

test('public pages have no overflow or hydration errors at the configured viewport', async ({
  page,
  isMobile,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (/hydration/i.test(message.text())) errors.push(message.text())
  })
  for (const path of [
    '/',
    '/zh-CN',
    '/pricing',
    '/zh-CN/pricing',
    '/privacy',
    '/zh-CN/terms',
    '/refunds',
    '/zh-CN/contact',
  ]) {
    await page.goto(path)
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('.public-footer')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy()
  }
  await page.goto('/')
  const header = page.locator('.public-header')
  const language = header.getByRole('button', {
    name: 'Interface language',
    exact: true,
    includeHidden: true,
  })
  await expect(language).toBeEnabled()
  const headerBox = await header.boundingBox()
  expect(headerBox?.height).toBe(60)
  expect(headerBox?.y).toBe(0)
  if (!isMobile) {
    const brand = header.locator('.brand')
    const brandColor = await brand.evaluate((el) => getComputedStyle(el).color)
    await brand.hover()
    await expect(brand).toHaveCSS('color', brandColor)
    await language.hover()
    await expect(language).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  }
  await language.click()
  await expect(language).toHaveAttribute('data-state', 'open')
  await expect(language).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await page.keyboard.press('Escape')
  await expect(language).toBeFocused()
  await page.evaluate(() => window.scrollTo({ top: 180, behavior: 'instant' }))
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  expect((await header.boundingBox())?.y).toBe(0)
  await page.screenshot({
    path: `/tmp/trade-header-scrolled-${isMobile ? 'mobile' : 'desktop'}.png`,
  })
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  if (isMobile) {
    await expect(page.locator('.public-account-link')).toBeHidden()
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('#public-mobile-menu')).toHaveCount(0)
    expect(
      await page
        .locator('.quick-examples')
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length),
    ).toBe(2)
  }
  await expect(page.getByRole('button', { name: 'Trend', exact: true })).toBeEnabled()
  await page.screenshot({
    path: `/tmp/trade-landing-${isMobile ? 'mobile' : 'desktop'}.png`,
    fullPage: true,
  })
  await page.goto('/pricing')
  await expect(page.getByRole('button', { name: 'Choose Pro', exact: true })).toBeEnabled()
  await page.screenshot({
    path: `/tmp/trade-pricing-${isMobile ? 'mobile' : 'desktop'}.png`,
    fullPage: true,
  })
  expect(errors).toEqual([])
})

test('sitemap only contains reviewed public entries and invalid routes are real 404s', async ({
  request,
}) => {
  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.status()).toBe(200)
  const xml = await sitemap.text()
  expect(xml).toContain('https://speakquant.com/zh-CN/pricing')
  expect(xml).not.toMatch(/localhost|new-task|conversations|login|privacy|refunds|contact/)
  expect(xml.match(/<loc>/g)).toHaveLength(6)
  for (const path of ['/new-task', '/conversations/private-test', '/login']) {
    const response = await request.get(path)
    expect(response.headers()['x-robots-tag']).toContain('noindex')
  }
  for (const path of ['/missing-page', '/zh-CN/missing-page', '/zh-CN/new-task']) {
    const response = await request.get(path)
    expect(response.status()).toBe(404)
  }
})

test('small phones and landscape keep navigation, plans and policies readable', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Additional phone widths')
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 320, height: 740 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport)
    for (const path of ['/', '/zh-CN/pricing', '/zh-CN/privacy']) {
      await page.goto(path)
      await expect(page.locator('.public-header .preference-select')).toBeEnabled()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy()
    }
  }
})
