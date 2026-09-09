import { nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export function useConversationScroll(
  viewport: Ref<HTMLElement | null>,
  content: Ref<HTMLElement | null>,
) {
  const following = ref(true)
  const showLatest = ref(false)
  function updateLatest() {
    const el = viewport.value
    if (!el) return
    const distance = Math.max(0, el.scrollHeight - el.clientHeight - el.scrollTop)
    // Separate visibility from following; two thresholds avoid flicker around the boundary.
    if (distance > 60) showLatest.value = true
    else if (distance < 10) showLatest.value = false
  }
  let observer: ResizeObserver | undefined
  let preserving = false
  let lastTop = 0
  let writtenTop: number | null = null
  function write(top: number) {
    const el = viewport.value
    if (!el) return
    el.scrollTop = top
    writtenTop = lastTop = el.scrollTop
    updateLatest()
  }
  function followGrowth() {
    const el = viewport.value
    if (!el || preserving) return
    if (!following.value) return updateLatest()
    // ResizeObserver runs after layout: follow the revealed text without a second animation.
    write(el.scrollHeight)
  }
  function bottom() {
    following.value = true
    const el = viewport.value
    if (el) write(el.scrollHeight)
  }
  function interrupt() {
    following.value = false
  }
  function onWheel(event: WheelEvent) {
    if (event.deltaY < 0) interrupt()
  }
  function onKeydown(event: KeyboardEvent) {
    if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) interrupt()
  }
  function onPointerDown(event: PointerEvent) {
    if (event.target === viewport.value) interrupt()
  }
  function onScroll() {
    if (preserving) return
    updateLatest()
    const el = viewport.value
    if (!el || (writtenTop !== null && Math.abs(el.scrollTop - writtenTop) < 1)) return
    const max = el.scrollHeight - el.clientHeight
    // Removing a waiting/tool row can clamp scrollTop; that is not an upward user gesture.
    if (following.value && max < lastTop && el.scrollTop >= max - 1) {
      writtenTop = lastTop = el.scrollTop
      return
    }
    writtenTop = null
    following.value =
      el.scrollTop >= lastTop && el.scrollHeight - el.clientHeight - el.scrollTop < 72
    lastTop = el.scrollTop
  }
  async function prepend(load: () => Promise<void>) {
    const el = viewport.value
    if (!el) return load()
    preserving = true
    const anchor = [...el.querySelectorAll<HTMLElement>('[data-message-id]')].find(
      (node) => node.getBoundingClientRect().bottom >= el.getBoundingClientRect().top,
    )
    const y = anchor?.getBoundingClientRect().top
    await load()
    await nextTick()
    if (anchor && y !== undefined) el.scrollTop += anchor.getBoundingClientRect().top - y
    preserving = false
    onScroll()
  }
  onMounted(() => {
    observer = new ResizeObserver(followGrowth)
    // Follow message growth, but ignore bottom padding changes from the floating composer.
    if (content.value) observer.observe(content.value, { box: 'content-box' })
    if (viewport.value) {
      observer.observe(viewport.value)
      viewport.value.addEventListener('wheel', onWheel, { passive: true })
      viewport.value.addEventListener('touchstart', interrupt, { passive: true })
      viewport.value.addEventListener('keydown', onKeydown)
      viewport.value.addEventListener('pointerdown', onPointerDown)
    }
  })
  onBeforeUnmount(() => {
    observer?.disconnect()
    viewport.value?.removeEventListener('wheel', onWheel)
    viewport.value?.removeEventListener('touchstart', interrupt)
    viewport.value?.removeEventListener('keydown', onKeydown)
    viewport.value?.removeEventListener('pointerdown', onPointerDown)
  })
  return { following, showLatest, bottom, onScroll, prepend }
}
