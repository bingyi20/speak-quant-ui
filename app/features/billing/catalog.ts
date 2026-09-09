export type PlanId = 'free' | 'pro' | 'max'
export type PricingTab = 'plans' | 'credits'

export interface PricingPlan {
  id: PlanId
  name: string
  monthlyPriceCents: number
  monthlyCredits: number
  topUpCentsPer100: number
  recommended?: boolean
}

/** Display-only catalog until billing is connected. Amounts are USD cents. */
export const PRICING_PLANS: readonly PricingPlan[] = [
  { id: 'free', name: 'Free', monthlyPriceCents: 0, monthlyCredits: 300, topUpCentsPer100: 150 },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPriceCents: 3000,
    monthlyCredits: 3000,
    topUpCentsPer100: 120,
  },
  {
    id: 'max',
    name: 'Max',
    monthlyPriceCents: 10000,
    monthlyCredits: 13000,
    topUpCentsPer100: 90,
    recommended: true,
  },
]
export const PREVIEW_PLAN_ID: PlanId = 'free'
export const TOP_UP_AMOUNTS = [5, 10, 20, 50] as const
export const TOP_UP_MIN = 5
export const TOP_UP_MAX = 10000

export interface CheckoutSelection {
  kind: 'subscription' | 'credits'
  planId: PlanId
  planName: string
  amountCents: number
  credits: number
}

/** Strict whole-dollar input; never coerce empty, decimal or exponential notation. */
export function quoteTopUp(input: string, plan: PricingPlan): CheckoutSelection | null {
  if (!/^\d+$/.test(input.trim())) return null
  const amount = Number(input)
  if (!Number.isSafeInteger(amount) || amount < TOP_UP_MIN || amount > TOP_UP_MAX) return null
  const amountCents = amount * 100
  if (!Number.isSafeInteger(plan.topUpCentsPer100) || plan.topUpCentsPer100 <= 0) return null
  return {
    kind: 'credits',
    planId: plan.id,
    planName: plan.name,
    amountCents,
    credits: Math.floor((amountCents * 100) / plan.topUpCentsPer100),
  }
}
