import { expect, test } from '@playwright/test'
import { conversationId, message, stubConversation } from './conversation-fixtures'

test('fast history loads never reveal a spinner and slow loads wait 200ms without moving it', async ({
  page,
}) => {
  await stubConversation(page, {
    initialMessages: [message('history-1', 1, 'assistant', '已有研究内容')],
  })
  let release!: () => void
  let pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(/\/api\/conversations\/[^/?]+\/messages(?:\?.*)?$/, async (route) => {
    await pending
    await route.fallback()
  })
  const now = new Date('2026-10-14T00:00:00Z')
  await page.clock.install({ time: now })
  await page.clock.pauseAt(now)
  await page.goto(`/conversations/${conversationId}`)
  const spinner = page.locator('.message-loading .loading-spinner')
  await expect(spinner).toHaveCount(1)
  await expect(spinner).toBeHidden()
  await page.clock.runFor(199)
  await expect(spinner).toBeHidden()
  release()
  await expect(page.locator('.message-scroll')).toContainText('已有研究内容')
  await page.clock.runFor(500)
  await expect(spinner).toHaveCount(0)

  pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.reload()
  await expect(spinner).toHaveCount(1)
  await expect(spinner).toBeHidden()
  const slot = page.locator('.message-loading')
  const beforeSlot = await slot.boundingBox()
  const before = (await spinner.boundingBox())!
  expect(beforeSlot).not.toBeNull()
  expect(before).not.toBeNull()
  await page.clock.runFor(199)
  await expect(spinner).toBeHidden()
  await page.clock.runFor(1)
  await expect(spinner).toBeVisible()
  // Rotation changes the ring's bounding box, but not its center or reserved slot.
  const after = (await spinner.boundingBox())!
  expect(after).not.toBeNull()
  expect(after.x + after.width / 2).toBeCloseTo(before.x + before.width / 2, 2)
  expect(after.y + after.height / 2).toBeCloseTo(before.y + before.height / 2, 2)
  expect(await slot.boundingBox()).toEqual(beforeSlot)
  release()
  await expect(page.locator('.message-scroll')).toContainText('已有研究内容')
  await expect(spinner).toHaveCount(0)
})

test('initial history loading is centered in the chat viewport and is not an assistant reply', async ({
  page,
}) => {
  await stubConversation(page, {
    initialMessages: [message('history-1', 1, 'assistant', '已有研究内容')],
  })
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(/\/api\/conversations\/[^/?]+\/messages(?:\?.*)?$/, async (route) => {
    await gate
    await route.fallback()
  })
  await page.goto(`/conversations/${conversationId}`)
  const viewport = page.locator('.message-scroll')
  const loader = viewport.locator('.message-loading')
  await expect(loader).toBeVisible()
  await expect(loader.locator('.loading-spinner')).toBeVisible()
  await expect(viewport).toHaveAttribute('aria-busy', 'true')
  await expect(page.locator('.reply-waiting')).toHaveCount(0)
  const bounds = (await viewport.boundingBox())!
  const spinner = (await loader.locator('.loading-spinner').boundingBox())!
  expect(Math.abs(spinner.x + spinner.width / 2 - (bounds.x + bounds.width / 2))).toBeLessThan(5)
  expect(Math.abs(spinner.y + spinner.height / 2 - (bounds.y + bounds.height / 2))).toBeLessThan(2)
  const width = await viewport.evaluate((element) => element.clientWidth)
  await page.screenshot({ path: test.info().outputPath('chat-history-loading.png') })
  release()
  await expect(loader).toHaveCount(0)
  await expect(viewport).toContainText('已有研究内容')
  await expect(viewport).toHaveAttribute('aria-busy', 'false')
  expect(await viewport.evaluate((element) => element.clientWidth)).toBe(width)
})
