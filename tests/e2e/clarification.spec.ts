import { expect, test } from '@playwright/test'
import { questionsCard, stubConversation } from './conversation-fixtures'

test('five questions stay compact, preserve drafts and submit once after optional skipping', async ({
  page,
}) => {
  const prompts = ['选择交易市场', '选择执行周期', '是否补充交易时段', '成交量阈值', '出场方式']
  const options = [
    '跟随趋势，只在突破后入场',
    '等待回撤确认后入场',
    '结合成交量与波动率过滤信号',
    '使用更保守的仓位管理规则',
    '暂时保持现有设置',
  ]
  const { calls } = await stubConversation(page, {
    questionsCard: {
      ...questionsCard,
      data: {
        answered: false,
        answers: [],
        questions: prompts.map((question, i) => ({
          id: `q${i}`,
          question,
          required: i !== 2,
          options,
          allow_custom: true,
        })),
      },
    },
  })
  await page.goto('/new-task')
  const composer = page.getByRole('textbox', { name: '交易想法' })
  await composer.fill('研究趋势突破')
  await composer.press('Enter')
  await expect(page.getByRole('heading', { name: '研究结论' })).toBeVisible()
  await composer.fill('独立的普通消息草稿')
  const form = page.getByRole('form', { name: '补充研究信息' })
  await expect(form).toBeVisible()
  await expect(composer).toBeVisible()
  await expect(form.getByRole('heading')).toHaveText(prompts[0]!)
  const questionBox = (await form.boundingBox())!
  const composerBox = (await page.locator('.research-composer').boundingBox())!
  expect(questionBox.y + questionBox.height).toBeLessThan(composerBox.y)
  expect(Math.abs(questionBox.width - composerBox.width)).toBeLessThan(1)

  await expect(form.locator('.question-progress')).toHaveText('1 / 5')
  await expect(form.getByRole('button', { name: '跳过', exact: true })).toBeEnabled()
  await expect
    .poll(() =>
      form.locator('.question-custom-icon').evaluate((el) => getComputedStyle(el).maskImage),
    )
    .not.toBe('none')
  await page.screenshot({ path: test.info().outputPath('questions-step-one.png') })
  await form.screenshot({ path: test.info().outputPath('questions-card.png') })
  const bounds = (await form.boundingBox())!
  expect(bounds.y).toBeGreaterThan(48)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  await form.getByRole('heading').focus()
  await page.keyboard.press('1')
  await expect(form.locator('.question-progress')).toHaveText('2 / 5')
  await form.getByRole('button', { name: '自定义', exact: true }).click()
  const custom = form.getByRole('textbox', { name: prompts[1] })
  await expect(custom).toBeFocused()
  await custom.fill('15分钟')
  await custom.press('Shift+Enter')
  await expect(custom).toHaveValue('15分钟\n')
  await custom.press('1')
  await expect(form.locator('.question-progress')).toHaveText('2 / 5')
  await custom.fill('15分钟\n收盘确认')
  await custom.dispatchEvent('compositionstart')
  await custom.dispatchEvent('keydown', { key: 'Enter' })
  await expect(form.locator('.question-progress')).toHaveText('2 / 5')
  await custom.dispatchEvent('compositionend')
  await custom.dispatchEvent('keydown', { key: 'Enter', isComposing: true })
  await custom.dispatchEvent('keydown', { key: 'Enter', keyCode: 229 })
  await expect(form.locator('.question-progress')).toHaveText('2 / 5')
  const iconBox = (await form.locator('.question-custom-trigger').boundingBox())!
  const inputBox = (await custom.boundingBox())!
  const nextBox = (await form.locator('.question-submit-button').boundingBox())!
  expect(iconBox.x + iconBox.width).toBeLessThan(inputBox.x)
  expect(inputBox.x + inputBox.width).toBeLessThan(nextBox.x)
  expect(Math.abs(inputBox.y + inputBox.height / 2 - nextBox.y - nextBox.height / 2)).toBeLessThan(
    2,
  )
  expect(await custom.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px')
  expect(await custom.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none')
  await form.screenshot({ path: test.info().outputPath('questions-inline-custom.png') })
  await custom.press('Enter')
  await form.getByRole('button', { name: '跳过', exact: true }).click()
  await expect(form.locator('.question-progress')).toHaveText('4 / 5')
  await form.getByRole('button', { name: options[2], exact: true }).click()
  await expect(form.locator('.question-progress')).toHaveText('5 / 5')
  expect(calls.filter((c) => c.method === 'send')).toHaveLength(0)
  await form.getByRole('button', { name: '收起问题，改用文字回复' }).click()
  await expect(composer).toBeVisible()
  await expect(composer).toBeFocused()
  await expect(composer).toHaveValue('独立的普通消息草稿')
  const resume = page.getByRole('button', { name: '继续回答 · 5 个问题' })
  await expect(resume).toHaveText('5')
  await expect(resume).toHaveAttribute('title', '继续回答 · 5 个问题')
  const resumeBox = (await resume.boundingBox())!
  const sendBox = (await page.getByRole('button', { name: '发送研究想法' }).boundingBox())!
  expect(resumeBox.x + resumeBox.width).toBeLessThan(sendBox.x)
  expect(Math.abs(resumeBox.y - sendBox.y)).toBeLessThan(1)
  await expect(page.locator('.clarification-questions[aria-hidden="true"]')).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('questions-resume-composer.png') })
  await resume.click()
  await expect(form.locator('.question-progress')).toHaveText('5 / 5')
  await form.getByRole('button', { name: options[0], exact: true }).click()
  await expect(form).toBeHidden()
  expect(calls.filter((c) => c.method === 'send')).toHaveLength(1)
  expect(calls.find((c) => c.method === 'send')?.body.structured_answers).toEqual([
    { question_id: 'q0', value: options[0] },
    { question_id: 'q1', custom_text: '15分钟\n收盘确认' },
    { question_id: 'q3', value: options[2] },
    { question_id: 'q4', value: options[0] },
  ])
  await expect(composer).toHaveValue('独立的普通消息草稿')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('Skip stays enabled, omits skipped required questions and submits partial answers', async ({
  page,
}) => {
  const { calls } = await stubConversation(page)
  await page.goto('/new-task')
  await page.getByRole('textbox', { name: '交易想法' }).fill('检查逐题回答')
  await page.getByRole('button', { name: '发送研究想法' }).click()
  const form = page.getByRole('form', { name: '补充研究信息' })
  await form.getByRole('button', { name: '现货', exact: true }).click()
  const custom = form.getByRole('textbox', { name: '选择执行周期' })
  await expect(custom).toHaveAttribute('placeholder', '输入其他回答，按回车确认')
  await custom.fill('字'.repeat(2001))
  await expect(custom).toHaveAttribute('aria-invalid', 'true')
  await custom.press('Enter')
  expect(calls.filter((c) => c.method === 'send')).toHaveLength(0)
  await custom.fill('')
  await custom.press('Enter')
  await expect(form).toBeVisible()
  await expect(form.getByRole('button', { name: '跳过', exact: true })).toBeEnabled()
  await form.getByRole('button', { name: '跳过', exact: true }).click()
  await expect(form).toBeHidden()
  expect(calls.find((c) => c.method === 'send')?.body.structured_answers).toEqual([
    { question_id: 'market', value: '现货' },
  ])
})

test('all questions can be skipped and an empty answer array retries with the same key', async ({
  page,
}) => {
  const { calls } = await stubConversation(page, { failSendOnce: true })
  await page.goto('/new-task')
  await page.getByRole('textbox', { name: '交易想法' }).fill('跳过问答')
  await page.getByRole('button', { name: '发送研究想法' }).click()
  const form = page.getByRole('form', { name: '补充研究信息' })
  await form.getByRole('button', { name: '跳过', exact: true }).click()
  await expect(form.locator('.question-progress')).toHaveText('2 / 2')
  await form.getByRole('button', { name: '跳过', exact: true }).click()
  await expect(page.locator('.user-message [aria-label]')).toBeVisible()
  await expect(page.getByText('已跳过所有问题', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('已跳过所有问题', { exact: true })).toBeVisible()
  await page.locator('.user-message button').click()
  await expect(form).toBeHidden()
  const sent = calls.filter((c) => c.method === 'send')
  expect(sent).toHaveLength(2)
  expect(sent[0]!.key).toBe(sent[1]!.key)
  expect(sent[1]!.body).toEqual({ reply_to_message_id: 'assistant-1', structured_answers: [] })
})

test('a single English question wraps and retains the whole answer when retrying', async ({
  page,
}) => {
  await page
    .context()
    .addCookies([{ name: 'trade-locale-manual', value: 'en-US', url: 'http://localhost:6002' }])
  const prompt =
    'Which risk management approach should we use when a breakout reverses before the next candle closes?'
  const { calls } = await stubConversation(page, {
    failSendOnce: true,
    questionsCard: {
      ...questionsCard,
      data: {
        answered: false,
        answers: [],
        questions: [
          {
            id: 'risk',
            question: prompt,
            required: true,
            allow_custom: true,
            options: [
              'Wait for the next candle to close before evaluating the exit signal',
              'Close the position as soon as the protective stop is triggered',
            ],
          },
        ],
      },
    },
  })
  await page.goto('/new-task')
  await page.getByRole('textbox', { name: 'Trading idea' }).fill('Review a breakout strategy')
  await page.getByRole('button', { name: 'Submit research idea' }).click()
  const form = page.getByRole('form', { name: 'Clarify your research' })
  await expect(form.locator('.question-progress')).toHaveText('1 / 1')
  await expect(form.getByRole('button', { name: 'Previous question' })).toBeDisabled()
  await expect(form.getByRole('button', { name: 'Next question' })).toBeDisabled()
  await form.getByRole('button', { name: 'Custom', exact: true }).click()
  await form
    .getByRole('textbox', { name: prompt })
    .fill('Use an ATR stop, with a 1% maximum risk per trade.')
  await expect(form.getByRole('button', { name: 'Skip', exact: true })).toBeEnabled()
  await page.screenshot({ path: test.info().outputPath('questions-english.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await form.getByRole('textbox', { name: prompt }).press('Enter')
  await expect(page.locator('.user-message [aria-label]')).toBeVisible()
  await page.locator('.user-message button').click()
  await expect(form).toBeHidden()
  const sent = calls.filter((c) => c.method === 'send')
  expect(sent).toHaveLength(2)
  expect(sent[0]!.key).toBe(sent[1]!.key)
  expect(sent[1]!.body).toEqual({
    reply_to_message_id: 'assistant-1',
    structured_answers: [
      { question_id: 'risk', custom_text: 'Use an ATR stop, with a 1% maximum risk per trade.' },
    ],
  })
})

test('closing questions animates toward the composer and can be interrupted or reduced', async ({
  page,
}) => {
  await stubConversation(page)
  await page.goto('/new-task')
  await page.getByRole('textbox', { name: '交易想法' }).fill('检查收起动效')
  await page.getByRole('button', { name: '发送研究想法' }).click()
  const form = page.getByRole('form', { name: '补充研究信息' })
  await expect(form).toBeVisible()
  const movement = await page.evaluate(async () => {
    const card = document.querySelector<HTMLElement>('.clarification-questions')!
    card.querySelector<HTMLButtonElement>('.question-navigation button:last-child')!.click()
    await new Promise(requestAnimationFrame)
    const animation = card.getAnimations()[0]!
    const effect = animation.effect as KeyframeEffect
    animation.pause()
    animation.currentTime = 120
    return {
      duration: effect.getTiming().duration,
      frames: effect.getKeyframes(),
      inert: card.inert,
      destination: !!document.querySelector('.research-composer .question-resume'),
    }
  })
  expect(movement.duration).toBe(240)
  expect(movement.frames.at(-1)?.transform).toContain('scale(0.08)')
  expect(movement.frames.at(-1)?.opacity).toBe('0')
  expect(movement.inert).toBe(true)
  expect(movement.destination).toBe(true)
  await page.screenshot({ path: test.info().outputPath('questions-collapse-midpoint.png') })
  await page.getByRole('button', { name: '继续回答 · 2 个问题' }).click()
  await expect(form).toBeVisible()
  await expect(page.locator('.clarification-questions[aria-hidden="true"]')).toHaveCount(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await form.getByRole('button', { name: '收起问题，改用文字回复' }).click()
  await expect(page.locator('.clarification-questions')).toHaveCount(0)
  expect(await page.locator('.question-resume').evaluate((el) => el.getAnimations().length)).toBe(0)
})
