import zh from './locales/zh-CN.json'
import en from './locales/en-US.json'
export default defineI18nConfig(() => ({
  legacy: false,
  locale: 'en-US',
  fallbackLocale: 'en-US',
  messages: { 'zh-CN': zh, 'en-US': en },
}))
