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

/** HTTP boundary fixture: application code always uses the real API module. */
export async function stubHistory(page: Page) {
  const { createMockHistory } = await import('./history-data')
  let rows = createMockHistory()
  const calls: { method: string; path: string; body: unknown; headers: Record<string, string> }[] =
    []
  await page.route(/\/api\/conversations(?:\/[^/?]+)?(?:\?.*)?$/, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const body = request.postDataJSON()
    calls.push({ method, path: url.pathname, body, headers: request.headers() })
    const id = url.pathname.split('/')[3]
    const item = rows.find((row) => row.id === id)
    if (!id && method === 'GET') {
      const scope = url.searchParams.get('scope')
      const pageNumber = Number(url.searchParams.get('page') ?? 1)
      const size = Number(url.searchParams.get('size') ?? 20)
      const filtered = [...rows]
        .filter((row) =>
          scope === 'favorite'
            ? row.is_favorite
            : scope === 'non_favorite'
              ? !row.is_favorite
              : true,
        )
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      await route.fulfill({
        json: envelope({
          items: filtered.slice((pageNumber - 1) * size, pageNumber * size),
          page: pageNumber,
          size,
          total: filtered.length,
          total_pages: Math.ceil(filtered.length / size),
        }),
      })
    } else if (!item) {
      await route.fulfill({
        status: 404,
        json: { code: 40400, data: null, error: { key: 'NOT_FOUND' } },
      })
    } else if (method === 'PATCH') {
      Object.assign(item, body, { updated_at: new Date().toISOString() })
      await route.fulfill({ json: envelope(item) })
    } else if (method === 'DELETE') {
      if (
        !request.headers()['idempotency-key'] ||
        request.headers()['x-confirm-delete'] !== 'permanent'
      ) {
        await route.fulfill({
          status: 400,
          json: { code: 40012, data: null, error: { key: 'DELETE_CONFIRMATION_REQUIRED' } },
        })
        return
      }
      rows = rows.filter((row) => row.id !== id)
      await route.fulfill({ json: envelope({ deleted: true, conversation_id: id }) })
    } else {
      await route.fulfill({ json: envelope({ conversation: item }) })
    }
  })
  return calls
}
