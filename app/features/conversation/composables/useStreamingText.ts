import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

/** Presentation only: the authoritative message always receives every SSE delta immediately. */
export function useStreamingText(
  content: () => string,
  status: () => string,
  snapshot: () => object | undefined,
) {
  // Existing history and reconnect snapshots render immediately on mount.
  const rendered = ref(status() === 'streaming' && !snapshot() ? '' : content())
  let segmenter: Intl.Segmenter | undefined
  let frame = 0
  let lastTime = 0
  let budget = 0
  let cursor = 0
  let suffix: string[] = []
  let streaming = status() === 'streaming'
  let motion: MediaQueryList | undefined

  function flush() {
    cancelAnimationFrame(frame)
    frame = 0
    rendered.value = content()
    suffix = []
    cursor = budget = 0
  }
  function tick(now: number) {
    frame = 0
    const remaining = suffix.length - cursor
    // Limit the reveal rate, not its total duration: large SSE chunks must not become large frames.
    const rate = Math.min(180, Math.max(60, remaining / 2))
    budget = Math.min(4, budget + (Math.min(32, now - lastTime) * rate) / 1000)
    lastTime = now
    const count = Math.min(4, remaining, Math.floor(budget))
    if (count > 0) {
      rendered.value += suffix.slice(cursor, cursor + count).join('')
      cursor += count
      budget -= count
    }
    if (cursor < suffix.length) frame = requestAnimationFrame(tick)
    else {
      suffix = []
      cursor = budget = 0
    }
  }
  function update(text: string, nextStatus: string, previousText: string, snapshotChanged = false) {
    streaming ||= nextStatus === 'streaming'
    if (
      !streaming ||
      motion?.matches ||
      document.hidden ||
      snapshotChanged ||
      nextStatus === 'failed' ||
      nextStatus === 'cancelled' ||
      !text.startsWith(previousText) ||
      !text.startsWith(rendered.value)
    ) {
      flush()
      return
    }
    // A completed Run drains the same queue without dumping its remaining text at once.
    if (text === previousText && (frame || text === rendered.value)) return
    segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    suffix = Array.from(
      segmenter.segment(text.slice(rendered.value.length)),
      (part) => part.segment,
    )
    cursor = 0
    // New packets extend the queue without restarting its clock.
    if (!frame && suffix.length) {
      lastTime = performance.now()
      budget = 0
      frame = requestAnimationFrame(tick)
    }
  }
  watch(
    [content, status, snapshot],
    ([text, nextStatus, currentSnapshot], [previousText, , previousSnapshot]) => {
      update(
        text,
        nextStatus,
        previousText,
        !!currentSnapshot && currentSnapshot !== previousSnapshot,
      )
    },
  )
  function visibilityChanged() {
    if (document.hidden) flush()
  }
  function motionChanged() {
    if (motion?.matches) flush()
  }
  onMounted(() => {
    motion = matchMedia('(prefers-reduced-motion: reduce)')
    motion.addEventListener('change', motionChanged)
    document.addEventListener('visibilitychange', visibilityChanged)
    update(content(), status(), content())
  })
  onBeforeUnmount(() => {
    cancelAnimationFrame(frame)
    motion?.removeEventListener('change', motionChanged)
    document.removeEventListener('visibilitychange', visibilityChanged)
  })
  return rendered
}
