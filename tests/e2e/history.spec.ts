import { expect, test, type Locator, type Page } from '@playwright/test'
import { authResponse, envelope } from './auth-fixtures'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ json: envelope(authResponse) }),
  )
})
async function navigation(page: Page, mobile: boolean) {
  if (mobile) {
    await page.locator('.workspace-expand').click()
    return page.locator('.mobile-navigation')
  }
  return page.locator('.workspace-sidebar')
}
async function menu(nav: Locator, title: string, mobile: boolean) {
  const row = nav
    .locator('.history-row')
    .filter({ has: nav.page().getByRole('link', { name: title, exact: true }) })
  if (!mobile) await row.hover()
  await row.getByRole('button', { name: `管理研究：${title}` }).click()
}

test('history groups collapse independently and selection follows navigation', async ({
  page,
  isMobile,
}) => {
  await page.goto('/new-task')
  let nav = await navigation(page, isMobile)
  const favorites = nav.locator('.history-group').nth(0)
  const recent = nav.locator('.history-group').nth(1)
  await expect(favorites.locator('.history-row')).toHaveCount(3)
  await expect(recent.locator('.history-row')).toHaveCount(9)
  await favorites.getByRole('button', { name: '收藏', exact: true }).click()
  await expect(favorites.getByRole('link').first()).toBeHidden()
  await expect(recent.getByRole('link').first()).toBeVisible()
  await recent.getByRole('button', { name: '历史', exact: true }).click()
  await expect(recent.getByRole('link').first()).toBeHidden()
  await favorites.getByRole('button', { name: '收藏', exact: true }).click()
  await favorites.getByRole('link', { name: 'BTC 均线趋势策略', exact: true }).click()
  await expect(page.locator('.workspace-conversation-title')).toHaveText('BTC 均线趋势策略')
  if (isMobile) nav = await navigation(page, true)
  await expect(nav.locator('.history-row.is-selected')).toContainText('BTC 均线趋势策略')
  await expect(nav.locator('.new-research')).not.toHaveClass(/is-selected/)
})

test('pin, rename and delete work locally, including deleting the current research', async ({
  page,
  isMobile,
}) => {
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/conversations')) requests.push(request.url())
  })
  await page.goto('/new-task')
  let nav = await navigation(page, isMobile)
  await menu(nav, 'BTC 均线趋势策略', isMobile)
  await page.getByRole('menuitem', { name: '取消收藏', exact: true }).click()
  await expect(
    nav
      .locator('.history-group')
      .nth(1)
      .getByRole('link', { name: 'BTC 均线趋势策略', exact: true }),
  ).toBeVisible()
  await menu(nav, 'BTC 均线趋势策略', isMobile)
  await page.getByRole('menuitem', { name: '收藏', exact: true }).click()
  await expect(
    nav
      .locator('.history-group')
      .nth(0)
      .getByRole('link', { name: 'BTC 均线趋势策略', exact: true }),
  ).toBeVisible()
  await menu(nav, 'BTC 均线趋势策略', isMobile)
  await page.getByRole('menuitem', { name: '重命名', exact: true }).click()
  let rename = nav.getByRole('textbox', { name: '研究名称' })
  await expect(rename).toBeFocused()
  await expect
    .poll(() =>
      rename.evaluate(
        (field: HTMLInputElement) =>
          field.selectionStart === 0 && field.selectionEnd === field.value.length,
      ),
    )
    .toBe(true)
  await rename.fill('   ')
  await rename.press('Enter')
  await expect(nav.getByRole('link', { name: 'BTC 均线趋势策略', exact: true })).toBeVisible()
  await menu(nav, 'BTC 均线趋势策略', isMobile)
  await page.getByRole('menuitem', { name: '重命名', exact: true }).click()
  rename = nav.getByRole('textbox', { name: '研究名称' })
  await rename.fill('新的趋势研究')
  await rename.press('Enter')
  await expect(rename).toHaveCount(0)
  await nav.getByRole('link', { name: '新的趋势研究', exact: true }).click()
  await expect(page.locator('.workspace-conversation-title')).toHaveText('新的趋势研究')
  if (isMobile) nav = await navigation(page, true)
  await menu(nav, '新的趋势研究', isMobile)
  await page.getByRole('menuitem', { name: '删除', exact: true }).click()
  const remove = page.getByRole('dialog', { name: '删除研究？', exact: true })
  await remove.getByRole('button', { name: '取消', exact: true }).click()
  await expect(nav.getByRole('link', { name: '新的趋势研究', exact: true })).toBeVisible()
  await menu(nav, '新的趋势研究', isMobile)
  await page.getByRole('menuitem', { name: '删除', exact: true }).click()
  await remove.getByRole('button', { name: '删除', exact: true }).click()
  await expect(page).toHaveURL(/\/new-task$/)
  if (isMobile) nav = await navigation(page, true)
  await expect(nav.getByRole('link', { name: '新的趋势研究', exact: true })).toHaveCount(0)
  expect(requests).toEqual([])
})

test('hover sidebar stays open while renaming inline and Escape cancels editing first', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop pointer preview')
  await page.goto('/new-task')
  await page.getByRole('button', { name: '收起侧栏' }).click()
  const nav = page.locator('.workspace-sidebar')
  await expect(nav).toBeHidden()
  const bounds = await page.locator('.workspace-expand').boundingBox()
  await page.mouse.move(bounds!.x + 16, bounds!.y + 16)
  await menu(nav, 'BTC 均线趋势策略', false)
  await page.getByRole('menuitem', { name: '重命名', exact: true }).hover()
  await expect(nav).toBeVisible()
  await page.getByRole('menuitem', { name: '重命名', exact: true }).click()
  let rename = nav.getByRole('textbox', { name: '研究名称' })
  await rename.fill('取消这次修改')
  await rename.press('Escape')
  await expect(nav).toBeVisible()
  await expect(nav.getByRole('link', { name: 'BTC 均线趋势策略', exact: true })).toBeVisible()
  await menu(nav, 'BTC 均线趋势策略', false)
  await page.getByRole('menuitem', { name: '重命名', exact: true }).click()
  rename = nav.getByRole('textbox', { name: '研究名称' })
  await rename.fill('悬停侧栏的研究')
  await rename.press('Enter')
  await expect(nav.getByRole('link', { name: '悬停侧栏的研究', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(nav).toBeHidden()
})

test('inline rename saves on blur and does not submit during IME composition', async ({
  page,
  isMobile,
}) => {
  await page.goto('/new-task')
  const nav = await navigation(page, isMobile)
  await menu(nav, 'BTC 均线趋势策略', isMobile)
  await page.getByRole('menuitem', { name: '重命名', exact: true }).click()
  let rename = nav.getByRole('textbox', { name: '研究名称' })
  await expect(page.getByRole('dialog', { name: '重命名研究', exact: true })).toHaveCount(0)
  await rename.fill('失焦保存的研究')
  await nav.getByRole('button', { name: '历史', exact: true }).click()
  await expect(nav.getByRole('link', { name: '失焦保存的研究', exact: true })).toBeVisible()
  await menu(nav, '失焦保存的研究', isMobile)
  await page.getByRole('menuitem', { name: '重命名', exact: true }).click()
  rename = nav.getByRole('textbox', { name: '研究名称' })
  await rename.dispatchEvent('compositionstart')
  await rename.fill('中文输入研究')
  await rename.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true })
  await expect(rename).toBeVisible()
  await rename.dispatchEvent('compositionend')
  await rename.press('Enter')
  await expect(nav.getByRole('link', { name: '中文输入研究', exact: true })).toBeVisible()
})
