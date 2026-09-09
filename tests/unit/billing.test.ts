import { describe, expect, it } from 'vitest'
import { PRICING_PLANS, quoteTopUp } from '~/features/billing/catalog'

describe('preview credit pricing', () => {
  it('offers cheaper credits on higher paid tiers and charges a premium for top-ups', () => {
    const [, pro, max] = PRICING_PLANS
    expect(max!.monthlyPriceCents / max!.monthlyCredits).toBeLessThan(
      pro!.monthlyPriceCents / pro!.monthlyCredits,
    )
    for (const plan of PRICING_PLANS) {
      expect(plan.topUpCentsPer100).toBeGreaterThan(
        (plan.monthlyPriceCents * 100) / plan.monthlyCredits,
      )
    }
  })
  it('quotes each membership rate using integer amounts, rounding down partial credits', () => {
    expect(PRICING_PLANS.map((plan) => quoteTopUp('5', plan)?.credits)).toEqual([333, 416, 555])
    expect(quoteTopUp('100', PRICING_PLANS[1]!)?.credits).toBe(8333)
    expect(quoteTopUp('10000', PRICING_PLANS[2]!)).toMatchObject({
      amountCents: 1000000,
      credits: 1111111,
      planId: 'max',
    })
  })
  it.each([
    '',
    ' ',
    '0',
    '-20',
    '4',
    '10001',
    '20.5',
    '20.0',
    '1e3',
    'Infinity',
    'NaN',
    'abc',
    '￥100',
    '999999999999999999',
  ])('rejects an invalid amount: %s', (input) => {
    expect(quoteTopUp(input, PRICING_PLANS[0]!)).toBeNull()
  })
})
