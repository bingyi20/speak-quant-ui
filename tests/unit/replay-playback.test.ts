import { expect, it } from 'vitest'
import { advancePlayback } from '~/features/replay/playback-state'
import { buildReplayEvents, groupEvents } from '~/features/replay/events'
import { toBar } from '~/features/replay/normalize'
import { candles, replayTrades, replayInsights } from '../e2e/replay-fixtures'
const bars = candles().map(toBar),
  events = buildReplayEvents(bars, replayTrades, replayInsights, true)
it('never skips a fill/insight at high speed, holds before ending, buffers at the frontier', () => {
  expect(advancePlayback(0, 100, bars, events, '1h', true, true)).toMatchObject({
    index: 20,
    hold: 1200,
    ended: false,
  })
  expect(advancePlayback(80, 80, bars, events, '1h', true, true)).toMatchObject({
    index: 100,
    hold: 2400,
  })
  expect(advancePlayback(199, 1, bars, events, '1h', false, true)).toMatchObject({
    buffering: true,
    ended: false,
  })
  expect(advancePlayback(199, 1, bars, events, '1h', true, true)).toMatchObject({
    buffering: false,
    ended: true,
  })
})
it('stops at a real candle gap and groups dense events on a fixed time axis', () => {
  const gap = [...bars.slice(0, 10), ...bars.slice(12)]
  expect(advancePlayback(8, 10, gap, [], '1h', true, true)).toMatchObject({ index: 9, gap: true })
  const groups = groupEvents(events, bars[0]!.time, bars.at(-1)!.time, 400)
  expect(groups.flatMap((g) => g.items).length).toBe(events.length)
  expect(groups.some((g) => g.items.length > 1)).toBe(true)
})
