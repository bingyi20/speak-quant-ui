import { expect, test } from '@playwright/test'
import { questionsCard, stubConversation } from '../e2e/conversation-fixtures'
import type { ClarificationQuestion } from '../../app/features/conversation/types'

const questions: ClarificationQuestion[] = [
  {
    id: 'timeframe',
    question: '用哪种时间周期来判定突破和成交量？',
    options: ['1小时（日内）', '4小时', '日线（D）'],
    required: true,
    allow_custom: true,
  },
  {
    id: 'lookback',
    question: '“近期高点”的回看窗口取多长？',
    options: ['20根K线', '55根K线（唐奇安经典）', '100根K线'],
    required: true,
    allow_custom: true,
  },
  {
    id: 'volume',
    question: '“成交量放大”的判定标准？',
    options: ['高于近20根均量的1.5倍', '高于近20根均量的2倍', '高于近50根均量的1.5倍'],
    required: true,
    allow_custom: true,
  },
  {
    id: 'exit',
    question: '出场方式怎么定？',
    options: ['跌破近期低点（对称通道）', '固定百分比止损 + 止盈', 'ATR 动态止损'],
    required: true,
    allow_custom: true,
  },
  {
    id: 'backtest',
    question: '要不要先做一次历史回测验证？',
    options: ['先做一次历史回测', '先完善策略规则'],
    required: false,
    allow_custom: true,
  },
]

test('interactive Ask User preview', async ({ page, context }) => {
  // This context never falls through to a real business endpoint.
  await context.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) =>
      route.fulfill({
        status: 501,
        json: { code: 501, message: '此操作未包含在问答预览中。' },
      }),
  )
  let resetting = false
  async function reset() {
    if (resetting || page.isClosed()) return
    resetting = true
    try {
      await page.unrouteAll({ behavior: 'wait' })
      await stubConversation(page, {
        immediateStream: true,
        questionsCard: { ...questionsCard, data: { questions, answered: false, answers: [] } },
        replyChunks: [
          '这是问答交互预览，以下内容均为模拟数据。\n\n请逐题补充策略条件；选择不会发起真实研究，最后统一提交即可查看收起效果。',
        ],
      })
      await page.goto('/new-task')
      await page.evaluate(() => sessionStorage.clear())
      const input = page.locator('.research-composer textarea').first()
      await input.fill('预览：成交量放大时突破近期高点的趋势策略')
      await input.press('Enter')
      await expect(page.locator('.clarification-questions')).toBeVisible({ timeout: 20_000 })
      await expect(page.locator('.question-progress')).toHaveText('1 / 5')
    } finally {
      resetting = false
    }
  }
  await page.exposeFunction('__tradeQuestionPreviewReset', reset)
  await page.addInitScript(() => {
    window.addEventListener(
      'DOMContentLoaded',
      () => {
        const toolbar = document.createElement('aside')
        toolbar.dataset.questionPreview = 'true'
        toolbar.setAttribute('aria-label', '问答预览工具')
        toolbar.style.cssText =
          'position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:10000;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 24px);padding:8px 14px;border:1px solid #d7c7aa;border-radius:10px;background:#fff9ed;color:#725322;font:13px/1.5 system-ui;box-shadow:0 2px 12px #0000000a;'
        const label = document.createElement('span')
        label.textContent = '问答预览 · 模拟数据'
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = '重新开始'
        button.style.cssText =
          'white-space:nowrap;border:1px solid #b79a66;border-radius:6px;padding:4px 10px;background:white;color:inherit;cursor:pointer;'
        button.onclick = () => {
          button.disabled = true
          void (window as typeof window & { __tradeQuestionPreviewReset: () => Promise<void> })
            .__tradeQuestionPreviewReset()
            .catch(() => {
              button.disabled = false
            })
        }
        toolbar.append(label, button)
        document.body.append(toolbar)
      },
      { once: true },
    )
  })
  await reset()
  if (process.env.QUESTIONS_PREVIEW_CHECK === '1') {
    expect(
      await page.evaluate(() =>
        fetch('/api/preview-unhandled').then((response) => response.status),
      ),
    ).toBe(501)
    await page.getByRole('button', { name: questions[0]!.options[0], exact: true }).click()
    await expect(page.locator('.question-progress')).toHaveText('2 / 5')
    await page.getByRole('button', { name: '重新开始', exact: true }).click()
    await expect(page.locator('.question-progress')).toHaveText('1 / 5')
    return
  }
  console.log('问答预览已打开：直接作答；点击“重新开始”可重置。关闭浏览器窗口或按 Ctrl+C 结束。')
  await new Promise<void>((resolve) => page.on('close', () => resolve()))
})
