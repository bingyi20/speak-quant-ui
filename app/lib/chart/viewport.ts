import type { ChartRange } from './adapter'

export const DEFAULT_CHART_VIEWPORT = { history: 100, right: 8 } as const

/** Default right margin, independent of user zoom. */
export const PLAYBACK_VIEWPORT_POSITION =
  DEFAULT_CHART_VIEWPORT.history / (DEFAULT_CHART_VIEWPORT.history + DEFAULT_CHART_VIEWPORT.right)

/** Short history grows from the left at the user's scale before following the right margin. */
export function playbackViewportPosition(index: number, width: number, barSpacing: number) {
  const left = Math.max(8, barSpacing / 2 + 1)
  return Math.min(PLAYBACK_VIEWPORT_POSITION, (left + index * barSpacing) / width)
}

/** Reveal hidden evidence with room for its history and subsequent candles. */
export const EVIDENCE_REVEAL_POSITION = 0.7

/** Default viewport for initial framing and data loading. */
export function defaultViewportRange(time: number, step: number, desktop = true): ChartRange {
  return {
    from: time - step * (desktop ? DEFAULT_CHART_VIEWPORT.history : 50),
    to: time + step * DEFAULT_CHART_VIEWPORT.right,
  }
}

/** Explicit result/evidence navigation can fit an interval, independently of the timeline. */
export function evidenceViewportRange(range: ChartRange, step: number): ChartRange {
  const margin = Math.max(step * 8, (range.to - range.from) * 0.1)
  return { from: range.from - margin, to: range.to + margin }
}

export type PlaybackViewportPolicy =
  { mode: 'following'; position: number } | { mode: 'filling' } | { mode: 'detached' }

/** Decide what new candles do after a manual pan/zoom, using the actual plot bounds. */
export function playbackViewportPolicy(
  x: number,
  width: number,
  barSpacing: number,
): PlaybackViewportPolicy {
  if (x - barSpacing / 2 >= width) return { mode: 'detached' }
  if (x < width * PLAYBACK_VIEWPORT_POSITION - 1) return { mode: 'filling' }
  return { mode: 'following', position: Math.max(PLAYBACK_VIEWPORT_POSITION, x / width) }
}

/** Default short history needs no return action; displaced history can be aligned again. */
export function canReturnToLatest(x: number, width: number, barSpacing: number, index: number) {
  const position = playbackViewportPosition(index, width, barSpacing)
  if (position < PLAYBACK_VIEWPORT_POSITION) return Math.abs(x - width * position) > 1
  return x < width * PLAYBACK_VIEWPORT_POSITION - 1 || x - barSpacing / 2 >= width
}
