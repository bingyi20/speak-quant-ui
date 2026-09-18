import type { ChartRange } from './adapter'

export const DEFAULT_CHART_VIEWPORT = { history: 100, right: 8 } as const

/** Default progress view; actual rendering uses the same bar counts in adapter.follow. */
export function defaultViewportRange(time: number, step: number, desktop = true): ChartRange {
  return {
    from: time - step * (desktop ? DEFAULT_CHART_VIEWPORT.history : 50),
    to: time + step * DEFAULT_CHART_VIEWPORT.right,
  }
}

/** Evidence inspection deliberately fits its own interval, independently of the default view. */
export function evidenceViewportRange(range: ChartRange, step: number): ChartRange {
  const margin = Math.max(step * 8, (range.to - range.from) * 0.1)
  return { from: range.from - margin, to: range.to + margin }
}
