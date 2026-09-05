import Decimal from 'decimal.js'
export function formatDecimal(
  value: string | null | undefined,
  locale = 'zh-CN',
  digits = 2,
): string {
  if (value == null || value === '') return '—'
  try {
    const decimal = new Decimal(value)
    if (!decimal.isFinite()) return '—'
    const parts = decimal.toFixed(digits).split('.')
    const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
      BigInt(parts[0]!),
    )
    const separator =
      new Intl.NumberFormat(locale).formatToParts(1.1).find((p) => p.type === 'decimal')?.value ??
      '.'
    const negativeZero = decimal.isNegative() && BigInt(parts[0]!) === 0n ? '-' : ''
    return negativeZero + integer + (digits ? separator + parts[1] : '')
  } catch {
    return '—'
  }
}
export function formatRatio(value: string | null, locale = 'zh-CN', digits = 2): string {
  try {
    if (value === null) return '—'
    const formatted = formatDecimal(new Decimal(value).times(100).toString(), locale, digits)
    return formatted === '—' ? formatted : formatted + '%'
  } catch {
    return '—'
  }
}
export function formatDate(value: string, locale = 'zh-CN', timeZone = 'UTC'): string {
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone,
    }).format(date)
  } catch {
    return '—'
  }
}
