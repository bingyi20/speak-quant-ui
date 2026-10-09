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
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ status: 401, json: anonymous }),
  )
  await page.route('**/api/auth/google/config', (route) =>
    route.fulfill({ json: envelope({ client_id: 'test-client', nonce: 'test-nonce' }) }),
  )
  await page.route('**/api/auth/email/code', (route) =>
    route.fulfill({
      json: envelope({
        verification_id: '01CODE00000000000000000000',
        expires_in: 600,
        resend_after: 60,
      }),
    }),
  )
})

test('email login submits once, preserves draft, restores the session and signs out', async ({
  page,
}) => {
  let verified = false
  let verificationCount = 0
  let refreshCount = 0
  await page.route('**/api/auth/refresh', (route) => {
    refreshCount++
    return route.fulfill({
      status: verified ? 200 : 401,
      json: verified ? envelope(authResponse) : anonymous,
    })
  })
  await page.route('**/api/auth/email/verify', (route) => {
    verificationCount++
    expect(route.request().postDataJSON()).toEqual({
      verification_id: '01CODE00000000000000000000',
      code: '123456',
    })
    expect(route.request().headers().authorization).toBeUndefined()
    verified = true
    return route.fulfill({ json: envelope(authResponse) })
  })
  await page.route('**/api/auth/logout', (route) => {
    expect(route.request().headers().authorization).toBe('Bearer test-memory-access')
    verified = false
    return route.fulfill({ json: envelope({ logged_out: true }) })
  })
  await page.goto('/login?returnTo=/new-task')
  await page.evaluate(() =>
    sessionStorage.setItem('trade-research-draft:anonymous', JSON.stringify('我的未提交假设')),
  )
  await page.getByLabel('邮箱地址').fill('tester@example.com')
  await page.getByRole('button', { name: '继续', exact: true }).click()
  await expect(page.getByRole('heading', { name: '查看你的邮箱' })).toBeVisible()
  await expect(page.getByRole('button', { name: /重新发送/ })).toBeDisabled()
  await expect(page.getByLabel('第 1 位验证码')).toBeFocused()
  await page.getByLabel('第 1 位验证码').pressSequentially('123456')
  await expect(page).toHaveURL((url) => url.pathname === '/new-task')
  expect(verificationCount).toBe(1)
  await expect(page.getByRole('textbox', { name: '交易想法' })).toHaveValue('我的未提交假设')
  await page.reload()
  await expect(page.getByRole('heading', { name: '今天，想验证什么？' })).toBeVisible()
  expect(refreshCount).toBe(2)
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
  expect(storage).not.toContain('test-memory-access')
  await (await settingsTrigger(page)).click()
  await expect(page.getByRole('dialog').last().getByText('tester@example.com')).toBeVisible()
  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(page).toHaveURL(/\/login/)
})

test('invalid code is announced, resend replaces the challenge and back retains email', async ({
  page,
}) => {
  await page.clock.install()
  let sends = 0
  let configs = 0
  await page.route('**/api/auth/google/config', (route) => {
    configs++
    return route.fulfill({ json: envelope({ client_id: 'client', nonce: 'nonce' }) })
  })
  await page.route('**/api/auth/email/code', (route) => {
    sends++
    return route.fulfill({
      json: envelope({ verification_id: `challenge-${sends}`, expires_in: 600, resend_after: 2 }),
    })
  })
  await page.route('**/api/auth/email/verify', (route) =>
    route.fulfill({ status: 400, json: { code: 40010, error: { key: 'EMAIL_CODE_INVALID' } } }),
  )
  await page.goto('/login')
  await page.getByLabel('邮箱地址').fill('tester@example.com')
  await page.getByRole('button', { name: '继续', exact: true }).click()
  await page.getByLabel('第 1 位验证码').pressSequentially('123456')
  await expect(page.getByRole('alert')).toHaveText('验证码不正确，请检查后重新输入。')
  await expect(page.getByLabel('第 1 位验证码')).toHaveValue('')
  await page.clock.fastForward(2100)
  await page.getByRole('button', { name: /重新发送/ }).click()
  expect(sends).toBe(2)
  await expect(page.locator('#login-error')).toBeEmpty()
  await page.getByRole('button', { name: '返回登录' }).click()
  await expect(page.getByLabel('邮箱地址')).toHaveValue('tester@example.com')
  expect(configs).toBe(1)
  await page.getByRole('link', { name: 'SpeakQuant · 返回首页' }).click()
  await expect(page).toHaveURL(/\/zh-CN$/)
})

test('Google mailbox binding uses the Google endpoint and keeps its credential in memory', async ({
  page,
}) => {
  let calls = 0
  await page.route('**/api/auth/email/verify', () => {
    throw new Error('Must not consume Google binding code via email verify')
  })
  await page.route('**/api/auth/google', (route) => {
    calls++
    const body = route.request().postDataJSON()
    expect(body.credential).toBe('test-google-credential')
    if (calls === 1)
      return route.fulfill({
        status: 409,
        json: {
          code: 40910,
          error: { key: 'GOOGLE_EMAIL_VERIFICATION_REQUIRED' },
          data: { email: 'tester@example.com' },
        },
      })
    expect(body).toEqual({
      credential: 'test-google-credential',
      verification_id: '01CODE00000000000000000000',
      code: '123456',
    })
    return route.fulfill({ json: envelope(authResponse) })
  })
  await page.goto('/login?returnTo=https://example.com')
  await page.getByRole('button', { name: '使用 Google 继续' }).click()
  await expect(page.getByText('请验证邮箱，完成 Google 账号登录')).toBeVisible()
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
  expect(storage).not.toContain('test-google-credential')
  await page.getByLabel('第 1 位验证码').pressSequentially('123456')
  await expect(page).toHaveURL((url) => url.pathname === '/new-task')
  expect(calls).toBe(2)
})

test('attempt limit disables verification, and resending unlocks a fresh code', async ({
  page,
}) => {
  await page.clock.install()
  await page.route('**/api/auth/email/verify', (route) =>
    route.fulfill({
      status: 429,
      json: { code: 42901, error: { key: 'EMAIL_CODE_ATTEMPTS_EXCEEDED' } },
    }),
  )
  await page.goto('/login')
  await page.getByLabel('邮箱地址').fill('tester@example.com')
  await page.getByRole('button', { name: '继续', exact: true }).click()
  await page.getByLabel('第 1 位验证码').pressSequentially('123456')
  await expect(page.getByRole('alert')).toContainText('尝试次数已达上限')
  await expect(page.getByLabel('第 1 位验证码')).toBeDisabled()
  await page.clock.fastForward(61000)
  await page.getByRole('button', { name: /重新发送/ }).click()
  await expect(page.getByLabel('第 1 位验证码')).toBeEnabled()
})

test('leaving verification aborts the request and prevents a late redirect', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/auth/email/verify', async (route) => {
    await gate
    await route.fulfill({ json: envelope(authResponse) }).catch(() => {})
  })
  await page.goto('/login')
  await page.getByLabel('邮箱地址').fill('tester@example.com')
  await page.getByRole('button', { name: '继续', exact: true }).click()
  await page.getByLabel('第 1 位验证码').pressSequentially('123456')
  await expect(page.getByRole('button', { name: '正在验证…' })).toBeDisabled()
  await page.getByRole('button', { name: '返回登录' }).click()
  release()
  await expect(page.getByRole('heading', { name: '登录或注册' })).toBeVisible()
  await expect(page.getByLabel('邮箱地址')).toBeEnabled()
  await expect(page).toHaveURL(/\/login$/)
})

test('pasting a six-digit code submits once and a failed resend preserves the old challenge', async ({
  page,
}) => {
  await page.clock.install()
  let sends = 0
  let verifies = 0
  await page.route('**/api/auth/email/code', (route) => {
    sends++
    return route.fulfill(
      sends === 1
        ? {
            json: envelope({
              verification_id: 'original-challenge',
              expires_in: 600,
              resend_after: 1,
            }),
          }
        : { status: 503, json: { code: 50300, error: { key: 'SERVICE_UNAVAILABLE' } } },
    )
  })
  await page.route('**/api/auth/email/verify', (route) => {
    verifies++
    expect(route.request().postDataJSON()).toEqual({
      verification_id: 'original-challenge',
      code: '123456',
    })
    return route.fulfill({ json: envelope(authResponse) })
  })
  await page.goto('/login')
  await page.getByLabel('邮箱地址').fill('tester@example.com')
  await page.getByRole('button', { name: '继续', exact: true }).click()
  await page.clock.fastForward(1100)
  await page.getByRole('button', { name: /重新发送/ }).click()
  await expect(page.getByRole('alert')).toContainText('服务暂不可用')
  await page.getByLabel('第 1 位验证码').evaluate((element) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', '123456')
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true }))
  })
  await expect(page).toHaveURL((url) => url.pathname === '/new-task')
  expect(verifies).toBe(1)
})

test('expired Google challenge is renewed before retrying direct sign-in', async ({ page }) => {
  let attempts = 0
  let configs = 0
  await page.route('**/api/auth/google/config', (route) => {
    configs++
    return route.fulfill({ json: envelope({ client_id: 'client', nonce: `nonce-${configs}` }) })
  })
  await page.route('**/api/auth/google', (route) => {
    attempts++
    return route.fulfill(
      attempts === 1
        ? { status: 401, json: { code: 40106, error: { key: 'GOOGLE_LOGIN_CHALLENGE_INVALID' } } }
        : { json: envelope(authResponse) },
    )
  })
  await page.goto('/login?returnTo=/conversations/research-one')
  await page.getByRole('button', { name: '使用 Google 继续' }).click()
  await expect(page.getByRole('alert')).toContainText('Google 登录已过期')
  await page.getByRole('button', { name: '使用 Google 继续' }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/conversations/research-one')
  expect(configs).toBe(2)
  expect(attempts).toBe(2)
})
