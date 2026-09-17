import { expect, it } from 'vitest'
import { advancePlayback } from '~/features/replay/playback-state'
import { buildReplayEvents, fillActionKey, groupEvents } from '~/features/replay/events'
import { toBar } from '~/features/replay/normalize'
import { candles, replayTrades, replayInsights } from '../e2e/replay-fixtures'
const bars = candles().map(toBar),
  events = buildReplayEvents(bars, replayTrades, replayInsights, true)
it('never skips a fill/insight at high speed, holds before ending, buffers at the frontier', () => {
  expect(advancePlayback(0, 100, bars, events, '1h', true)).toMatchObject({
    index: 20,
    hold: 1200,
    ended: false,
  })
  expect(advancePlayback(80, 80, bars, events, '1h', true)).toMatchObject({
    index: 100,
    hold: 2400,
  })
  expect(advancePlayback(199, 1, bars, events, '1h', false)).toMatchObject({
    buffering: true,
    ended: false,
  })
  expect(advancePlayback(199, 1, bars, events, '1h', true)).toMatchObject({
    buffering: false,
    ended: true,
  })
})
it('stops at a real candle gap and groups dense events on a fixed time axis', () => {
  const gap = [...bars.slice(0, 10), ...bars.slice(12)]
  expect(advancePlayback(8, 10, gap, [], '1h', true)).toMatchObject({ index: 9, gap: true })
  const groups = groupEvents(events, bars[0]!.time, bars.at(-1)!.time, 400)
  expect(groups.flatMap((g) => g.items).length).toBe(events.length)
  expect(groups.some((g) => g.items.length > 1)).toBe(true)
})

it('groups only timeline occurrences without counting result shortcuts twice', () => {
  const occurrences = events.filter((event) => event.kind === 'fill' || event.kind === 'insight')
  const groups = groupEvents(occurrences, bars[0]!.time, bars.at(-1)!.time, 200, 32)
  expect(groups.flatMap((group) => group.items)).toHaveLength(5)
  expect(
    groups.flatMap((group) => group.items).filter((event) => event.kind === 'fill'),
  ).toHaveLength(4)
  expect(fillActionKey('open', 'short')).toBe('replay.fillActions.short.open')
  expect(fillActionKey('close', 'long')).toBe('replay.fillActions.long.close')
  expect(fillActionKey('unknown', 'long')).toBe('replay.actions.trade')
})
it('advances at the requested bar rate even in long intervals with no events', () => {
  const long = candles(1000).map(toBar)
  expect(advancePlayback(0, 1, long, [], '1h', true)).toMatchObject({ index: 1 })
  expect(advancePlayback(10, 8, long, [], '1h', true)).toMatchObject({ index: 18 })
})

it('allows a short fill hold while still stopping at the exact trade candle', () => {
  expect(advancePlayback(0, 100, bars, events, '1h', true, 125)).toMatchObject({
    index: 20,
    hold: 125,
  })
})

it.each([20, 50, 80, 100])(
  'uses the same brief desktop hold for buy/sell at candle %i, including coincident insights',
  (index) => {
    const insight = events.find((event) => event.kind === 'insight')!
    const coincident = [...events, { ...insight, id: `insight-at-${index}`, index }].sort(
      (a, b) => a.index - b.index,
    )
    for (const hold of [150, 125, 12.5]) {
      expect(advancePlayback(index - 1, 50, bars, coincident, '1h', true, hold)).toMatchObject({
        index,
        hold,
        ended: false,
      })
      expect(advancePlayback(index, 1, bars, coincident, '1h', true, hold).index).toBe(index + 1)
    }
    expect(advancePlayback(index - 1, 1, bars, coincident, '1h', true).hold).toBe(2400)
  },
)
