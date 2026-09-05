import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
const script = readFileSync(new URL('../../public/theme-init.js', import.meta.url), 'utf8')
function initialTheme(cookie: string, enabled: boolean, systemDark: boolean) {
  const root = {
    dataset: {} as Record<string, string>,
    classList: { toggle: (_name: string, _value: boolean) => {} },
  }
  runInNewContext(script, {
    document: {
      cookie,
      currentScript: { dataset: { darkEnabled: String(enabled) } },
      documentElement: root,
    },
    matchMedia: () => ({ matches: systemDark }),
  })
  return root.dataset.theme
}
describe('theme initialization', () => {
  it('resolves explicit and system preference before application mount', () => {
    expect(initialTheme('trade-theme=dark', true, false)).toBe('dark')
    expect(initialTheme('trade-theme=light', true, true)).toBe('light')
    expect(initialTheme('trade-theme=system', true, true)).toBe('dark')
    expect(initialTheme('trade-theme=system', true, false)).toBe('light')
  })
  it('keeps unapproved dark mode gated and recovers from invalid preferences', () => {
    expect(initialTheme('trade-theme=dark', false, true)).toBe('light')
    expect(initialTheme('trade-theme=broken', true, true)).toBe('light')
    expect(initialTheme('trade-theme=%', true, true)).toBe('light')
  })
  it('defines the same semantic keys in both themes', () => {
    const keys = (name: string) =>
      [
        ...readFileSync(
          new URL(`../../app/assets/css/themes/${name}.css`, import.meta.url),
          'utf8',
        ).matchAll(/(--[\w-]+):/g),
      ]
        .map((match) => match[1])
        .sort()
    expect(keys('dark')).toEqual(keys('light'))
  })
})
