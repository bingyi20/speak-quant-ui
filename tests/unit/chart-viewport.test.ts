import { expect, it } from 'vitest'
import {
  advancePlaybackViewport,
  canReturnToLatest,
  playbackViewportPolicy,
  playbackViewportPosition,
  playbackViewportRight,
  type PlaybackViewport,
  PLAYBACK_VIEWPORT_POSITION,
} from '~/lib/chart/viewport'

it('keeps a smaller right margin until the latest candle has completely left the plot', () => {
  for (const x of [930, 980, 1000, 1003.9]) {
    expect(canReturnToLatest(x, 1000, 8, 200)).toBe(false)
    expect(playbackViewportPolicy(x, 1000, 8)).toEqual({ mode: 'following', position: x / 1000 })
  }
  expect(canReturnToLatest(1004, 1000, 8, 200)).toBe(true)
  expect(playbackViewportPolicy(1004, 1000, 8)).toEqual({ mode: 'detached' })
})
it('fills extra whitespace before following, without treating pixel rounding as displacement', () => {
  for (const x of [-200, 8, 500, 900]) {
    expect(playbackViewportPolicy(x, 1000, 8)).toEqual({ mode: 'filling' })
    expect(canReturnToLatest(x, 1000, 8, 200)).toBe(true)
  }
  const x = 1000 * PLAYBACK_VIEWPORT_POSITION - 0.5
  expect(canReturnToLatest(x, 1000, 8, 200)).toBe(false)
  expect(playbackViewportPolicy(x, 1000, 8)).toEqual({
    mode: 'following',
    position: PLAYBACK_VIEWPORT_POSITION,
  })
})

it('keeps all short historical prefixes left-aligned at the current scale and plot width', () => {
  expect(playbackViewportPosition(0, 1000, 8)).toBe(0.008)
  expect(playbackViewportPosition(50, 1000, 8)).toBe(0.408)
  expect(playbackViewportPosition(50, 1000, 4)).toBe(0.208)
  expect(playbackViewportPosition(50, 2000, 8)).toBe(0.204)
  // A wide single candle must fit entirely inside the plot too.
  expect(playbackViewportPosition(0, 1000, 40)).toBe(0.021)
  expect(playbackViewportPosition(115, 1000, 8)).toBe(PLAYBACK_VIEWPORT_POSITION)
  expect(playbackViewportPosition(10000, 1000, 8)).toBe(PLAYBACK_VIEWPORT_POSITION)
})

it('does not offer a no-op return for short history but can remove manual left whitespace', () => {
  expect(canReturnToLatest(408, 1000, 8, 50)).toBe(false)
  expect(canReturnToLatest(408.5, 1000, 8, 50)).toBe(false)
  expect(canReturnToLatest(428, 1000, 8, 50)).toBe(true)
  expect(canReturnToLatest(388, 1000, 8, 50)).toBe(true)
  expect(canReturnToLatest(926, 1000, 8, 50)).toBe(true)
})

function atPosition(
  index: number,
  position: number,
  policy: PlaybackViewport['policy'],
): PlaybackViewport {
  return { policy, spacing: 8, right: playbackViewportRight(index, 1000, 8, position) }
}

function advanceIndividually(
  viewport: PlaybackViewport,
  from: number,
  to: number,
  shiftVisibleRangeOnNewBar = false,
  follow = true,
) {
  for (let index = from + 1; index <= to; index++)
    viewport = advancePlaybackViewport(viewport, index, 1000, {
      previousIndex: index - 1,
      shiftVisibleRangeOnNewBar,
      follow,
    })
  return viewport
}

it('catches up following views at their own right margin and candle spacing', () => {
  const saved = atPosition(200, 0.98, { mode: 'following', position: 0.98 })
  const resumed = advancePlaybackViewport(saved, 6000, 1000)
  expect(resumed).toEqual(advanceIndividually(saved, 200, 6000))
  expect(resumed.right - saved.right).toBe(5800)
  expect(resumed.spacing).toBe(8)
})

it('keeps filling until the same candle reaches the playback anchor, then follows', () => {
  const saved = atPosition(50, 0.408, { mode: 'filling' })
  expect(advancePlaybackViewport(saved, 100, 1000)).toEqual(saved)
  const resumed = advancePlaybackViewport(saved, 180, 1000)
  expect(resumed).toEqual(advanceIndividually(saved, 50, 180))
  expect(resumed.policy).toEqual({ mode: 'following', position: PLAYBACK_VIEWPORT_POSITION })
})

it('retains detached historical coordinates even after thousands of hidden candles', () => {
  const saved = atPosition(200, 1.5, { mode: 'detached' })
  expect(advancePlaybackViewport(saved, 6000, 1000)).toEqual(saved)
  expect(advancePlaybackViewport(saved, 6000, 1000)).toEqual(advanceIndividually(saved, 200, 6000))
})

it('does not resume business following while an evidence selection owns the viewport', () => {
  const saved = atPosition(200, 0.98, { mode: 'following', position: 0.98 })
  expect(advancePlaybackViewport(saved, 500, 1000, { follow: false })).toEqual(saved)
})

it('reconstructs a desktop seek followed by playback without replaying intermediate views', () => {
  for (const seekIndex of [0, 40, 200]) {
    const position = playbackViewportPosition(seekIndex, 1000, 8)
    const saved = atPosition(
      seekIndex,
      position,
      position < PLAYBACK_VIEWPORT_POSITION
        ? { mode: 'filling' }
        : { mode: 'following', position: PLAYBACK_VIEWPORT_POSITION },
    )
    for (const latest of [seekIndex + 5, seekIndex + 500]) {
      const final = advancePlaybackViewport(saved, latest, 1000)
      expect(final.right).toBeCloseTo(
        playbackViewportRight(latest, 1000, 8, playbackViewportPosition(latest, 1000, 8)),
      )
      expect(final).toEqual(advanceIndividually(saved, seekIndex, latest))
    }
  }
})

it('preserves native touch shifting even when a short prefix is still filling', () => {
  const saved = atPosition(40, playbackViewportPosition(40, 1000, 8), { mode: 'filling' })
  const resumed = advancePlaybackViewport(saved, 300, 1000, {
    previousIndex: 40,
    shiftVisibleRangeOnNewBar: true,
  })
  expect(resumed).toEqual(advanceIndividually(saved, 40, 300, true))
  expect(resumed.policy).toEqual({ mode: 'filling' })
  expect(resumed.right - saved.right).toBe(260)
})

it('starts native shifting only when off-screen left candles enter the visible range', () => {
  const saved = atPosition(40, -0.2, { mode: 'filling' })
  for (const latest of [45, 70, 1000])
    expect(
      advancePlaybackViewport(saved, latest, 1000, {
        previousIndex: 40,
        shiftVisibleRangeOnNewBar: true,
      }),
    ).toEqual(advanceIndividually(saved, 40, latest, true))
})

it('keeps touch detachment and evidence following consistent with individual updates', () => {
  for (const saved of [
    atPosition(200, 1.5, { mode: 'detached' }),
    atPosition(200, 0.8, { mode: 'following', position: 0.98 }),
  ])
    expect(
      advancePlaybackViewport(saved, 1000, 1000, {
        previousIndex: 200,
        shiftVisibleRangeOnNewBar: true,
        follow: false,
      }),
    ).toEqual(advanceIndividually(saved, 200, 1000, true, false))
})
