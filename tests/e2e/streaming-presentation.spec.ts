import { expect, test, type Page } from '@playwright/test'
import { conversationId, stubConversation } from './conversation-fixtures'

const first =
  '## 稳定标题\n\n已完成的段落保持原位。\n\n| 指标 | 数值 |\n| --- | --- |\n| 次数 | 12 |\n\n```ts\n' +
  'const example = "' +
  'long-code-'.repeat(20) +
  '"\n```\n'
const tails = [1, 2, 3].map(
  (index) => `\n\n新增段落 ${index}：${'文字应连续出现，中文和 👩‍💻 Emoji 保持完整。'.repeat(6)}`,
)

type Sample = {
  length: number
  top: number
  stable: boolean
  toolHeight: number | null
  toolEmpty: boolean
}
async function probe(page: Page) {
  await page.addInitScript(() => {
    const samples: {
      length: number
      top: number
      stable: boolean
      max: number
      following: boolean
      toolHeight: number | null
      toolEmpty: boolean
    }[] = []
    Object.assign(window, { streamSamples: samples })
    let paragraph: Element | null = null
    let table: Element | null = null
    let code: Element | null = null
    function sample() {
      const root = document.querySelector('[data-message-id="assistant-1"] .markdown-content')
      const viewport = document.querySelector('.message-scroll')
      const tools = document.querySelector('[data-message-id="assistant-1"] .tool-statuses')
      if (root && viewport) {
        if (!paragraph && root.querySelector('p')?.textContent === '已完成的段落保持原位。')
          paragraph = root.querySelector('p')
        table ??= root.querySelector('table')
        code ??= root.querySelector('pre')
        samples.push({
          length: root.textContent?.length ?? 0,
          top: viewport.scrollTop,
          max: viewport.scrollHeight - viewport.clientHeight,
          following: !document.querySelector('.jump-latest'),
          toolHeight: tools?.getBoundingClientRect().height ?? null,
          toolEmpty: tools?.classList.contains('is-empty') ?? false,
          stable:
            (!paragraph || root.querySelector('p') === paragraph) &&
            (!table || root.querySelector('table') === table) &&
            (!code || root.querySelector('pre') === code),
        })
      }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
}

test('large SSE chunks reveal continuously and retain existing Markdown nodes', async ({
  page,
}) => {
  await stubConversation(page, { manyMessages: true, replyChunks: [first, ...tails] })
  await probe(page)
  await page.goto(`/conversations/${conversationId}`)
  const input = page.getByRole('textbox', { name: '交易想法' })
  await input.fill('检查连续展示')
  await input.press('Enter')
  await input.fill('下一轮草稿')
  const markdown = page.locator('[data-message-id="assistant-1"] .markdown-content')
  const code = markdown.locator('pre')
  await expect(code).toContainText('long-code-'.repeat(20))
  await code.evaluate((el) => {
    el.scrollLeft = 80
  })
  await expect(
    page.getByRole('button', { name: '发送研究想法', includeHidden: true }),
  ).toBeEnabled()
  await expect(markdown).toContainText(tails[2]!.trim())
  const samples = await page.evaluate(
    () => (window as typeof window & { streamSamples: Sample[] }).streamSamples,
  )
  await test.info().attach('stream-samples.json', {
    body: JSON.stringify(samples),
    contentType: 'application/json',
  })
  expect(new Set(samples.map((sample) => sample.length)).size).toBeGreaterThan(100)
  expect(samples.every((sample) => sample.stable)).toBe(true)
  expect(samples.some((sample) => sample.toolEmpty && sample.toolHeight === 20)).toBe(true)
  expect(samples.some((sample) => !sample.toolEmpty && sample.toolHeight === 20)).toBe(true)
  expect(await code.evaluate((el) => el.scrollLeft)).toBe(80)
  await expect(page.locator('[data-message-id]').first()).toHaveAttribute(
    'data-message-id',
    'old-30',
  )
  await page.screenshot({ path: test.info().outputPath('continuous-stream.png') })
  await page.reload()
  await expect(markdown).toContainText(tails[2]!.trim())
  const restored = await page.evaluate(
    () => (window as typeof window & { streamSamples: Sample[] }).streamSamples,
  )
  expect(new Set(restored.map((sample) => sample.length)).size).toBe(1)
})

test('scrolling up interrupts following while queued text continues rendering', async ({
  page,
}) => {
  await stubConversation(page, { manyMessages: true, replyChunks: [first, ...tails] })
  await page.goto(`/conversations/${conversationId}`)
  await page.getByRole('textbox', { name: '交易想法' }).fill('检查上滚暂停跟随')
  await page.getByRole('button', { name: '发送研究想法' }).click()
  await page.getByRole('textbox', { name: '交易想法' }).fill('下一轮草稿')
  const markdown = page.locator('[data-message-id="assistant-1"] .markdown-content')
  await expect(markdown).toContainText('新增段落 1')
  const viewport = page.locator('.message-scroll')
  const before = await viewport.evaluate((el) => el.scrollTop)
  const bounds = (await viewport.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 100)
  await page.mouse.wheel(0, -400)
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeLessThan(before - 200)
  const reading = await viewport.evaluate((el) => el.scrollTop)
  await expect(
    page.getByRole('button', { name: '发送研究想法', includeHidden: true }),
  ).toBeEnabled()
  await expect(markdown).toContainText(tails[2]!.trim())
  expect(await viewport.evaluate((el) => el.scrollTop)).toBe(reading)
  await expect(page.locator('[data-message-id]').first()).toHaveAttribute(
    'data-message-id',
    'old-30',
  )
  await page.getByRole('button', { name: '回到最新消息', exact: true }).click()
  await expect
    .poll(() => viewport.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
    .toBeLessThan(1)
})

test('a large final chunk appears a few characters per frame even after the Run completes', async ({
  page,
}) => {
  const text = '文字逐步出现'.repeat(180)
  await stubConversation(page, { replyChunks: [text] })
  await probe(page)
  await page.goto(`/conversations/${conversationId}`)
  const input = page.getByRole('textbox', { name: '交易想法' })
  await input.fill('检查大块文本')
  await input.press('Enter')
  await input.fill('下一轮草稿')
  await expect(
    page.getByRole('button', { name: '发送研究想法', includeHidden: true }),
  ).toBeEnabled()
  const markdown = page.locator('[data-message-id="assistant-1"] .markdown-content')
  expect((await markdown.textContent())!.trim().length).toBeLessThan(text.length)
  await expect(markdown).toHaveText(text)
  const samples = await page.evaluate(
    () => (window as typeof window & { streamSamples: Sample[] }).streamSamples,
  )
  const steps = samples.slice(1).map((sample, index) => sample.length - samples[index]!.length)
  expect(steps.every((step) => step >= 0 && step <= 4)).toBe(true)
  expect(new Set(samples.map((sample) => sample.length)).size).toBeGreaterThan(270)
})

test('reduced motion renders complete chunks without a reveal animation', async ({ page }) => {
  const chunks = ['首段'.repeat(100), '\n\n' + '后段'.repeat(100)]
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await stubConversation(page, { replyChunks: chunks })
  await probe(page)
  await page.goto(`/conversations/${conversationId}`)
  await page.getByRole('textbox', { name: '交易想法' }).fill('检查减少动态效果')
  await page.getByRole('button', { name: '发送研究想法' }).click()
  const markdown = page.locator('[data-message-id="assistant-1"] .markdown-content')
  await expect(markdown).toContainText('后段'.repeat(100))
  const samples = await page.evaluate(
    () => (window as typeof window & { streamSamples: Sample[] }).streamSamples,
  )
  expect(new Set(samples.map((sample) => sample.length))).toEqual(new Set([201, 402]))
})
