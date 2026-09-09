import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'questions.spec.ts',
  timeout: 0,
  workers: 1,
  retries: 0,
  reporter: 'line',
  outputDir: '../../test-results/questions-preview',
  use: {
    baseURL: 'http://localhost:6002',
    browserName: 'chromium',
    headless: process.env.QUESTIONS_PREVIEW_CHECK === '1',
    viewport: null,
    locale: 'zh-CN',
    launchOptions: { args: ['--window-size=1440,1000'] },
    actionTimeout: 15_000,
  },
  webServer: {
    command: 'pnpm dev',
    cwd: '../..',
    url: 'http://localhost:6002',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
