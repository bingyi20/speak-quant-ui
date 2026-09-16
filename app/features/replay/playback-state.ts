import { nextBarTime } from './normalize'
import type { ReplayBar, ReplayEvent } from './types'

export interface PlaybackStep {
  index: number
  hold: number
  gap: boolean
  ended: boolean
  buffering: boolean
}
/** Pure advancement: never crosses a known event, gap, or the loaded frontier. */
export function advancePlayback(
  index: number,
  steps: number,
  bars: readonly ReplayBar[],
  events: readonly ReplayEvent[],
  timeframe: string,
  complete: boolean,
  compress: boolean,
): PlaybackStep {
  const last = bars.length - 1
  if (index >= last) return { index, hold: 0, gap: false, ended: complete, buffering: !complete }
  let target = Math.min(last, index + Math.max(1, steps))
  const nextEvent = events.find(
    (e) => e.index > index && (e.kind === 'fill' || e.kind === 'insight'),
  )
  if (compress && index >= 0 && (nextEvent?.index ?? last) - index > 240)
    target = Math.min(last, (nextEvent?.index ?? last) - 8, index + Math.max(steps, 240))
  if (nextEvent && nextEvent.index <= target) target = nextEvent.index
  for (let i = Math.max(0, index); i < target; i++) {
    const expected = nextBarTime(bars[i]!.time, timeframe)
    if (expected !== null && bars[i + 1]!.time > expected)
      return { index: i, hold: 0, gap: true, ended: false, buffering: false }
  }
  const atEvent =
    target !== index &&
    events.some((e) => e.index === target && (e.kind === 'fill' || e.kind === 'insight'))
  const insight = events.some((e) => e.index === target && e.kind === 'insight')
  return {
    index: target,
    hold: atEvent ? (insight ? 2400 : 1200) : 0,
    gap: false,
    ended: target === last && complete && !atEvent,
    buffering: false,
  }
}
