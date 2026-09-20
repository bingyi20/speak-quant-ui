import { computed, nextTick, onScopeDispose, ref, watch, type Ref } from 'vue'

const CARD_WIDTH = 168
const GAP = 10
const STEP = CARD_WIDTH + GAP
const EDGE_TOLERANCE = 2

/** Horizontal review position is independent of the replay clock and chart viewport. */
export function useReplayTradeStrip(
  element: Ref<HTMLElement | null>,
  count: () => number,
  replayId: () => string | undefined,
) {
  const following = ref(true)
  const left = ref(0)
  const width = ref(0)
  let returning = false
  let returnFrame = 0
  const totalWidth = computed(() => Math.max(0, count() * STEP - GAP))
  const windowSize = computed(() => Math.max(20, Math.ceil(width.value / STEP) + 4))
  const start = computed(() =>
    Math.max(0, Math.min(count() - windowSize.value, Math.floor(left.value / STEP) - 2)),
  )
  const end = computed(() => Math.min(count(), start.value + windowSize.value))
  const trackStyle = computed(() => ({
    width: `${totalWidth.value}px`,
    paddingLeft: `${start.value * STEP}px`,
    paddingRight: `${(count() - end.value) * STEP}px`,
    '--trade-card-width': `${CARD_WIDTH}px`,
    '--trade-card-gap': `${GAP}px`,
  }))
  const canReturn = computed(() => !following.value && totalWidth.value > width.value)

  function onScroll() {
    const strip = element.value
    if (!strip) return
    left.value = strip.scrollLeft
    const atRight = strip.scrollWidth - strip.clientWidth - strip.scrollLeft <= EDGE_TOLERANCE
    if (!returning) following.value = atRight
  }
  function scrollToRight() {
    const strip = element.value
    if (!strip) return
    const target = Math.max(0, strip.scrollWidth - strip.clientWidth)
    strip.scrollTo({ left: target, behavior: 'instant' })
    // Instant movement may not dispatch scroll when the strip already fits.
    onScroll()
  }
  function returnToLatest() {
    interruptReturn()
    following.value = true
    const strip = element.value
    if (!strip) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      scrollToRight()
      return
    }
    const from = strip.scrollLeft
    const started = performance.now()
    returning = true
    const frame = (now: number) => {
      const progress = Math.min(1, (now - started) / 260)
      // Retarget within the same animation when playback reveals another trade.
      const target = Math.max(0, strip.scrollWidth - strip.clientWidth)
      strip.scrollTo({
        left: from + (target - from) * (1 - (1 - progress) ** 3),
        behavior: 'instant',
      })
      left.value = strip.scrollLeft
      if (progress < 1) returnFrame = requestAnimationFrame(frame)
      else {
        returning = false
        returnFrame = 0
        onScroll()
      }
    }
    returnFrame = requestAnimationFrame(frame)
  }
  function interruptReturn() {
    if (!returning) return
    returning = false
    cancelAnimationFrame(returnFrame)
    returnFrame = 0
    if (element.value)
      element.value.scrollTo({ left: element.value.scrollLeft, behavior: 'instant' })
    onScroll()
  }
  function sync() {
    const strip = element.value
    if (!strip) return
    width.value = strip.clientWidth
    if (returning) return
    if (following.value) scrollToRight()
    else onScroll()
  }
  function reveal(index: number) {
    const strip = element.value
    if (!strip || index < 0 || index >= count()) return
    const from = index * STEP
    const to = from + CARD_WIDTH
    if (from >= strip.scrollLeft && to <= strip.scrollLeft + strip.clientWidth) return
    interruptReturn()
    following.value = false
    // Reveal selected evidence locally; never scroll the page or replay timeline.
    strip.scrollTo({
      left: from < strip.scrollLeft ? from : to - strip.clientWidth,
      behavior: 'instant',
    })
    onScroll()
  }
  watch(replayId, () => {
    interruptReturn()
    following.value = true
  })
  // Measure the updated virtual window after Vue has applied its logical width.
  watch(
    count,
    async () => {
      await nextTick()
      sync()
    },
    { flush: 'post' },
  )
  watch(
    element,
    (strip, _, cleanup) => {
      if (!strip) return
      sync()
      const observer = new ResizeObserver(sync)
      observer.observe(strip)
      cleanup(() => {
        observer.disconnect()
        interruptReturn()
      })
    },
    { flush: 'post' },
  )
  onScopeDispose(() => cancelAnimationFrame(returnFrame))
  return { start, end, trackStyle, canReturn, onScroll, returnToLatest, interruptReturn, reveal }
}
