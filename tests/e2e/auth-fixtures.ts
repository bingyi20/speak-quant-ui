import type { Page } from '@playwright/test'
export const testUser = {
  id: '01TESTUSER00000000000000000',
  email: 'tester@example.com',
  display_name: 'Test Researcher',
  avatar_url: null,
  locale: 'zh-CN',
  timezone: 'Asia/Shanghai',
  created_at: '2026-09-05T00:00:00Z',
}
export const authResponse = {
  access_token: 'test-memory-access',
  token_type: 'Bearer',
  expires_in: 3600,
  user: testUser,
}
export const envelope = (data: unknown) => ({ code: 0, message: 'ok', data })
export const anonymous = { code: 40101, message: 'No session', error: { key: 'AUTH_REQUIRED' } }
/** Stub the external SDK only in tests; production always loads Google's official SDK. */
export async function stubGoogle(page: Page) {
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
    window.google = { accounts: { id: {
      initialize(config) { this.config = config; },
      renderButton(container) { const button = document.createElement('button'); button.type = 'button'; button.textContent = '使用 Google 继续'; button.onclick = () => this.config.callback({ credential: 'test-google-credential' }); container.append(button); },
      disableAutoSelect() { window.googleSignedOut = true; }, cancel() {}
    } } };
  `,
    }),
  )
}

export async function settingsTrigger(page: Page) {
  const trigger = page.getByRole('button', { name: '个人信息与偏好' }).filter({ visible: true })
  if ((page.viewportSize()?.width ?? 1440) <= 760)
    await page.getByRole('button', { name: '展开侧栏' }).filter({ visible: true }).click()
  return trigger
}
