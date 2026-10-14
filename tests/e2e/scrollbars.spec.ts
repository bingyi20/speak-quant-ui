import { expect, test, type Locator, type Page } from '@playwright/test'
import { conversationId, message, strategyCard, stubConversation } from './conversation-fixtures'
import { currentStrategy, stubStrategyDetails } from './strategy-fixtures'

// Chromium's default headless flag hides painted scrollbars from screenshots.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

async function prepareResearch(page: Page) {
  await stubConversation(page, {
    initialMessages: [
      ...Array.from({ length: 30 }, (_, index) =>
        message(
          `research-${index}`,
          index + 1,
          index % 2 ? 'assistant' : 'user',
          `研究记录 ${index + 1}：${'比较趋势信号、交易成本和风险条件。'.repeat(8)}`,
        ),
      ),
      message('strategy', 31, 'assistant', '策略已生成', [strategyCard]),
    ],
  })
  await stubStrategyDetails(page, {
    ...currentStrategy,
    design: {
      format: 'markdown',
      content: `# 当前设计\n\n${Array.from(
        { length: 50 },
        (_, index) =>
          `## 规则 ${index + 1}\n\n比较入场、离场和风险条件，验证策略在不同市场的表现。`,
      ).join('\n\n')}`,
    },
    code: {
      language: 'python',
      content: Array.from(
        { length: 100 },
        (_, index) => `# Rule ${index + 1}: ${'strategy condition '.repeat(50)}`,
      ).join('\n'),
    },
  })
  await page.goto(`/conversations/${conversationId}`)
  await expect(page.locator('.message-list-shell .message-card')).toBeVisible()
}

async function wheel(page: Page, scroller: Locator, deltaX: number, deltaY: number) {
  const rect = (await scroller.boundingBox())!
  await page.mouse.move(
    rect.x + rect.width / 2,
    Math.min(rect.y + rect.height / 2, page.viewportSize()!.height - 160),
  )
  await page.mouse.wheel(deltaX, deltaY)
}

async function geometry(scroller: Locator) {
  return scroller.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      width: rect.width,
      height: rect.height,
      contentX: element.firstElementChild?.getBoundingClientRect().x,
    }
  })
}

async function expectActive(scroller: Locator) {
  await expect(scroller).toHaveAttribute('data-scrollbar-visible', '')
  await expect
    .poll(() =>
      scroller.evaluate(
        (element) => getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor,
      ),
    )
    .not.toBe('rgba(0, 0, 0, 0)')
}

async function expectIdle(scroller: Locator) {
  await expect(scroller).not.toHaveAttribute('data-scrollbar-visible', '')
  await expect
    .poll(() =>
      scroller.evaluate(
        (element) => getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor,
      ),
    )
    .toBe('rgba(0, 0, 0, 0)')
}

async function scrollbarColors(scroller: Locator) {
  return scroller.evaluate((element) => {
    const context = document.createElement('canvas').getContext('2d')!
    function alpha(color: string) {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return context.getImageData(0, 0, 1, 1).data[3]! / 255
    }
    const style = getComputedStyle(element)
    return {
      opacity: Number(style.getPropertyValue('--scrollbar-opacity')),
      thumb: alpha(getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor),
      hover: alpha(style.getPropertyValue('--color-scrollbar-thumb-hover-visible')),
    }
  })
}

test('scrollbar colors gently fade and restore immediately when scrolling resumes', async ({
  page,
}) => {
  await prepareResearch(page)
  const chat = page.locator('.message-scroll')
  await expectIdle(chat)
  const before = await geometry(chat)
  // Pause the real fade halfway through so intermediate color checks do not race its short duration.
  await chat.evaluate((element) => {
    const animate = element.animate.bind(element)
    element.animate = (keyframes, options) => {
      const animation = animate(keyframes, options)
      animation.pause()
      animation.currentTime = 80
      return animation
    }
  })
  await wheel(page, chat, 0, -220)
  await expectActive(chat)
  const active = await scrollbarColors(chat)
  expect(active.opacity).toBe(1)
  await expect.poll(() => chat.evaluate((element) => element.getAnimations().length)).toBe(1)
  const fading = await scrollbarColors(chat)
  expect(fading.opacity).toBeGreaterThan(0)
  expect(fading.opacity).toBeLessThan(1)
  expect(fading.thumb).toBeGreaterThan(0)
  expect(fading.thumb).toBeLessThan(active.thumb)
  expect(fading.hover).toBeGreaterThan(0)
  expect(fading.hover).toBeLessThan(active.hover)
  expect(await geometry(chat)).toEqual(before)

  await wheel(page, chat, 0, -220)
  await expectActive(chat)
  expect(await scrollbarColors(chat)).toEqual(active)
  expect(await chat.evaluate((element) => element.getAnimations().length)).toBe(0)
  expect(await geometry(chat)).toEqual(before)
  await expect.poll(() => chat.evaluate((element) => element.getAnimations().length)).toBe(1)
  await chat.evaluate((element) => element.getAnimations()[0]!.play())
  await expectIdle(chat)
  expect(await geometry(chat)).toEqual(before)
})

test('reduced motion hides idle scrollbars without starting a fade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await prepareResearch(page)
  const chat = page.locator('.message-scroll')
  await expectIdle(chat)
  const before = await geometry(chat)
  await chat.evaluate((element) => {
    const animate = element.animate.bind(element)
    element.animate = (keyframes, options) => {
      element.setAttribute('data-test-fade-started', '')
      return animate(keyframes, options)
    }
  })
  await wheel(page, chat, 0, -220)
  await expectActive(chat)
  await expectIdle(chat)
  await expect(chat).not.toHaveAttribute('data-test-fade-started', '')
  expect(await chat.evaluate((element) => element.getAnimations().length)).toBe(0)
  expect(await geometry(chat)).toEqual(before)
})

test('chat and Design reveal independently, extend activity on scroll and hide without moving content', async ({
  page,
  isMobile,
}) => {
  await prepareResearch(page)
  const chat = page.locator('.message-scroll')
  await expectIdle(chat)
  const chatGeometry = await geometry(chat)
  const initialScroll = await chat.evaluate((element) => element.scrollTop)
  await wheel(page, chat, 0, -220)
  await expect.poll(() => chat.evaluate((element) => element.scrollTop)).toBeLessThan(initialScroll)
  await expectActive(chat)
  expect(await geometry(chat)).toEqual(chatGeometry)
  // The second action should keep the thumb visible beyond the first action's idle deadline.
  await page.waitForTimeout(500)
  await wheel(page, chat, 0, -220)
  await expectActive(chat)
  await page.waitForTimeout(450)
  await expectActive(chat)
  await expectIdle(chat)
  expect(await geometry(chat)).toEqual(chatGeometry)

  await page.locator('.message-list-shell .message-card').click()
  const panel = page.locator('.asset-detail-panel')
  const design = panel.locator('.strategy-detail-body')
  await expect(panel.locator('.strategy-document')).toContainText('当前设计')
  await expectIdle(chat)
  await expectIdle(design)
  const designGeometry = await geometry(design)
  await wheel(page, design, 0, 320)
  await expect.poll(() => design.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await expectActive(design)
  await expectIdle(chat)
  expect(await geometry(design)).toEqual(designGeometry)
  await page.screenshot({ path: test.info().outputPath('design-scrollbar-active.png') })
  await expectIdle(design)
  expect(await geometry(design)).toEqual(designGeometry)
  await page.screenshot({ path: test.info().outputPath('design-scrollbar-idle.png') })
  if (!isMobile) {
    await wheel(page, chat, 0, -220)
    await expectActive(chat)
    await expectIdle(design)
  }
})

test('fullscreen Code keeps horizontal and vertical scrollbars independent and supports keyboard scrolling', async ({
  page,
}) => {
  await prepareResearch(page)
  await page.locator('.message-list-shell .message-card').click()
  const panel = page.locator('.asset-detail-panel')
  await expect(panel.locator('.strategy-document')).toContainText('当前设计')
  await panel.getByRole('tab', { name: '代码', exact: true }).click()
  const code = panel.locator('.strategy-code-scroll')
  await expect(code).toBeVisible()
  await panel.getByRole('button', { name: '全屏', exact: true }).click()
  await expect(panel).toHaveClass(/is-fullscreen/)
  expect(await panel.boundingBox()).toEqual({ x: 0, y: 0, ...page.viewportSize()! })
  const body = panel.locator('.strategy-detail-body')
  await expectIdle(body)
  await expectIdle(code)
  const bodyGeometry = await geometry(body)
  const codeGeometry = await geometry(code)
  await wheel(page, code, 500, 0)
  await expect.poll(() => code.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
  await expectActive(code)
  await expectIdle(body)
  expect(await geometry(body)).toEqual(bodyGeometry)
  expect(await code.evaluate((element) => element.clientWidth)).toBe(codeGeometry.clientWidth)
  await expectIdle(code)
  const beforeKey = await code.evaluate((element) => element.scrollLeft)
  await code.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => code.evaluate((element) => element.scrollLeft)).toBeGreaterThan(beforeKey)
  await expectActive(code)
  await expectIdle(code)
  await expectIdle(body)
  await wheel(page, body, 0, 360)
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await expectActive(body)
  await expectIdle(code)
  expect(await geometry(body)).toEqual(bodyGeometry)
  await expectIdle(body)
  expect(await geometry(body)).toEqual(bodyGeometry)
})

test('public document scrolling uses the same idle behavior without changing page width', async ({
  page,
}) => {
  await page.goto('/privacy')
  const root = page.locator('html')
  await expect(page.locator('.public-shell')).toBeVisible()
  await expectIdle(root)
  const pageWidth = await root.evaluate((element) => element.clientWidth)
  await page.mouse.move(page.viewportSize()!.width / 2, page.viewportSize()!.height / 2)
  await page.mouse.wheel(0, 400)
  await expect
    .poll(() => page.evaluate(() => document.scrollingElement!.scrollTop))
    .toBeGreaterThan(0)
  await expectActive(root)
  expect(await root.evaluate((element) => element.clientWidth)).toBe(pageWidth)
  await expect(page.locator('.public-shell')).not.toHaveAttribute('data-scrollbar-visible', '')
  await expectIdle(root)
  expect(await root.evaluate((element) => element.clientWidth)).toBe(pageWidth)
})
