import { describe, expect, it } from 'vitest'
import {
  equityChartPoints,
  equityChartTimeline,
  equityVisibleCount,
} from '~/features/replay/equity-chart'
import type { ReplayEquityCurvePoint } from '~/features/replay/types'

const start = Date.parse('2026-09-01T00:00:00Z') / 1000
function point(sequence: number, offset: number, equity: string): ReplayEquityCurvePoint {
  return {
    sequence,
    time: new Date((start + offset) * 1000).toISOString(),
    open_time: sequence ? new Date((start + offset - 3600) * 1000).toISOString() : null,
    equity,
    net_return_rate: '0',
    drawdown_rate: '0',
    is_initial: sequence === 0,
  }
}

describe('equity chart visibility', () => {
  it('uses the account effective close time inclusively, not a candle end millisecond', () => {
    const points = equityChartPoints([point(0, 0, '100'), point(1, 3600, '101')])
    expect(equityVisibleCount(points, start - 1)).toBe(0)
    expect(equityVisibleCount(points, start)).toBe(1)
    expect(equityVisibleCount(points, start + 3599.999)).toBe(1)
    expect(equityVisibleCount(points, start + 3600)).toBe(2)
    expect(equityVisibleCount(points, start)).toBe(1)
    expect(equityVisibleCount(points, Infinity)).toBe(2)
  })

  it('preserves legacy millisecond closes and zero/negative account values', () => {
    const points = equityChartPoints([
      point(0, 0, '100'),
      point(1, 3599.999, '0'),
      point(2, 7199.999, '-25.125'),
    ])
    expect(points.map(({ value }) => value)).toEqual([100, 0, -25.125])
    expect(points[1]!.time).toBe(start + 3599.999)
    expect(points[2]!.time).toBe(start + 7199.999)
    expect(equityVisibleCount(points, start + 3599.998)).toBe(1)
    expect(equityVisibleCount(points, start + 3599.999)).toBe(2)
  })

  it('reserves the full time range without fabricating any money values', () => {
    const points = equityChartPoints([point(0, 0, '100'), point(1, 1800, '99')])
    expect(equityChartTimeline(points, start, start + 3600)).toEqual([
      start,
      start + 1800,
      start + 3600,
    ])
    expect(points).toHaveLength(2)
    expect(points.at(-1)?.source.equity).toBe('99')
  })

  it('does not allocate a whole extra chart slot for a legacy one-millisecond end boundary', () => {
    const points = equityChartPoints([point(0, 0, '100'), point(1, 3599.999, '99')])
    expect(equityChartTimeline(points, start, start + 3600)).toEqual([start, start + 3599.999])
    // Only the layout anchor is omitted; effective times and reveal boundaries
    // remain the exact values returned by the API.
    expect(points[1]!.source.time).toBe('2026-09-01T00:59:59.999Z')
    expect(equityVisibleCount(points, start + 3599.998)).toBe(1)
    expect(equityVisibleCount(points, start + 3599.999)).toBe(2)
    const earlier = equityChartPoints([point(0, 0, '100'), point(1, 3599.998, '99')])
    expect(equityChartTimeline(earlier, start, start + 3600)).toHaveLength(3)
    const boundary = equityChartPoints([point(0, 0, '100'), point(1, 3600, '99')])
    expect(equityChartTimeline(boundary, start, start + 3600)).toHaveLength(2)
  })

  it('does not silently skip invalid, duplicate or out-of-range points', () => {
    expect(() => equityChartPoints([point(0, 0, '100'), point(1, 0, '99')])).toThrow()
    expect(() => equityChartPoints([point(0, 0, 'NaN')])).toThrow()
    const points = equityChartPoints([point(0, 0, '100'), point(1, 3600, '99')])
    expect(() => equityChartTimeline(points, start, start + 3500)).toThrow()
  })
})
