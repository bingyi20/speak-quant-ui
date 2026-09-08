import { createRequire } from 'node:module'
import { dirname } from 'node:path'

// Resolve Vue internals from this project's Vue, never a parent's node_modules.
const vueRequire = createRequire(import.meta.resolve('vue'))
const runtimeRequire = createRequire(vueRequire.resolve('@vue/runtime-dom'))

export default defineNuxtConfig({
  alias: {
    '@vue/runtime-core': dirname(runtimeRequire.resolve('@vue/runtime-core/package.json')),
    '@vue/compiler-sfc': dirname(vueRequire.resolve('@vue/compiler-sfc/package.json')),
  },
  compatibilityDate: '2026-09-05',
  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxtjs/i18n', '@nuxt/eslint'],
  devtools: { enabled: false },
  devServer: { host: '127.0.0.1', port: 6002 },
  css: ['~/assets/css/main.css'],
  ui: { colorMode: false },
  fonts: { providers: { google: false, googleicons: false } },
  icon: { provider: 'none', serverBundle: 'local', clientBundle: { scan: true } },
  runtimeConfig: {
    apiBase: 'http://localhost:6001/api',
    public: {
      apiBase: process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:6001/api',
      apiEnabled: true,
      enableDarkTheme: false,
      termsUrl: '',
      privacyUrl: '',
      siteUrl: 'http://localhost:6002',
    },
  },
  routeRules: {
    '/new-task': {
      ssr: false,
      headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' },
    },
    '/conversations/**': {
      ssr: false,
      headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' },
    },
    '/login': { headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' } },
  },
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'zh-CN',
    detectBrowserLanguage: false,
    vueI18n: './i18n.config.ts',
    locales: [
      { code: 'zh-CN', language: 'zh-CN', name: '简体中文' },
      { code: 'en-US', language: 'en-US', name: 'English' },
    ],
  },
  typescript: {
    strict: true,
    tsConfig: {
      exclude: ['../prototype/**'],
      compilerOptions: {
        paths: {
          '@vue/runtime-core': [dirname(runtimeRequire.resolve('@vue/runtime-core/package.json'))],
          '@vue/compiler-sfc': [dirname(vueRequire.resolve('@vue/compiler-sfc/package.json'))],
        },
      },
    },
  },
  ignore: ['prototype/**'],
  app: { head: { link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }] } },
})
