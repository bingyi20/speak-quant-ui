import { expect, test } from '@playwright/test'
import { conversationId, stubConversation } from './conversation-fixtures'

test('history actions reveal on hover or keyboard and copy raw Markdown after streaming', async ({
  page,
}, info) => {
  const raw = '**原始 Markdown**\n\n[链接](https://example.com)\n\n`code`'
  await stubConversation(page, { manyMessages: true, replyChunks: [raw] })
  await page.addInitScript(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async (text: string) => {
        Object.assign(window, { copiedMarkdown: text })
      },
    })
  })
  await page.goto(`/conversations/${conversationId}`)
  const last = page.locator('[data-message-id="old-79"]')
  const older = page.locator('[data-message-id="old-77"]')
  await expect(last.locator('footer')).toBeVisible()
  await expect(older.locator('footer')).toBeHidden()
  if (info.project.name === 'desktop') {
    await older.hover()
    await expect(older.locator('footer')).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(older.locator('footer')).toBeHidden()
  }
  await older.focus()
  await expect(older.locator('footer')).toBeVisible()
  const input = page.getByRole('textbox', { name: '交易想法' })
  await input.fill('测试复制')
  await input.press('Enter')
  const reply = page.locator('[data-message-id="assistant-1"]')
  await expect(reply).toBeVisible()
  await expect(reply.locator('footer')).toHaveCount(0)
  await expect(reply.locator('footer')).toBeVisible()
  await reply.getByRole('button', { name: '复制 Markdown' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { copiedMarkdown: string }).copiedMarkdown),
    )
    .toBe(raw)
  await expect(reply.getByRole('status')).toBeEmpty()
  await expect(reply.locator('time')).toHaveAttribute('datetime', /2026-09-08/)
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async () => {
        throw new Error('denied')
      },
    })
  })
  await reply.getByRole('button', { name: '复制 Markdown' }).click()
  await expect(reply.getByRole('status')).toContainText('复制失败')
})
