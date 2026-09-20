import { expect, it } from 'vitest'
import {
  canReturnToLatest,
  playbackViewportPolicy,
  playbackViewportPosition,
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
