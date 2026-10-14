import Decimal from 'decimal.js'
import type { Plan, PlanCatalog } from './types'

export type PricingTab = 'plans' | 'credits'
export const TOP_UP_MIN_USD = '5'
export const TOP_UP_AMOUNTS = [5, 10, 20, 50] as const

export function planName(code: string): string {
  return code ? code.charAt(0).toUpperCase() + code.slice(1) : ''
}

/** Validate USD input with a $5 minimum, without a business maximum or implicit rounding. */
export function validateTopUpAmount(input: string): string | null {
  const value = input.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null
  try {
    const amount = new Decimal(value)
    if (!amount.isFinite() || amount.lt(TOP_UP_MIN_USD)) return null
    return amount.toFixed(2)
  } catch {
    return null
  }
}

/** Display rate only; purchases always consume a server-issued quote. */
export function topUpRatePer1000(plan: Plan, catalog: PlanCatalog): string {
  try {
    return new Decimal(plan.price_usd)
      .div(plan.monthly_credits)
      .times(1000)
      .times(new Decimal(catalog.topup_markup_bps).div(10000).plus(1))
      .toString()
  } catch {
    return ''
  }
}
