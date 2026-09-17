import { describe, expect, it } from 'vitest'
import { tradeTooltipPosition } from '../../app/lib/chart/tooltip-position'

describe('trade tooltip placement', () => {
  const popup = { width: 240, height: 100 }
  const area = { width: 600, height: 400 }
  it.each([
    [100, 200, 'right-top', 100, 96],
    [100, 34, 'right-bottom', 128, 34],
    [560, 200, 'left-top', 344, 96],
    [560, 34, 'left-bottom', 316, 34],
  ])('positions at %s,%s as %s', (left, top, placement, x, y) => {
    expect(
      tradeTooltipPosition({ id: 'fill', left, top, width: 24, height: 23 }, popup, area),
    ).toEqual({ left: x, top: y, placement })
  })
  it('accounts for the tag width and gap when fitting the right-bottom popup', () => {
    expect(
      tradeTooltipPosition({ id: 'fill', left: 340, top: 34, width: 24, height: 23 }, popup, area),
    ).toEqual({ left: 96, top: 34, placement: 'left-bottom' })
  })
  it('uses the measured height of multiple fills when choosing above or below', () => {
    const tag = { id: 'fill', left: 100, top: 160, width: 24, height: 23 }
    expect(tradeTooltipPosition(tag, popup, area).placement).toBe('right-top')
    expect(tradeTooltipPosition(tag, { ...popup, height: 180 }, area).placement).toBe(
      'right-bottom',
    )
  })
})
