export default defineNuxtPlugin((nuxtApp) => {
  const states = new Map<Element, { timer?: ReturnType<typeof setTimeout>; fade?: Animation }>()
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  function hide(
    element: Element,
    state: { timer?: ReturnType<typeof setTimeout>; fade?: Animation },
  ) {
    clearTimeout(state.timer)
    state.fade?.cancel()
    element.removeAttribute('data-scrollbar-visible')
    states.delete(element)
  }

  function reveal(event: Event) {
    const element = event.target === document ? document.scrollingElement : event.target
    if (!(element instanceof Element)) return

    const state = states.get(element) ?? {}
    clearTimeout(state.timer)
    state.fade?.cancel()
    state.fade = undefined
    element.setAttribute('data-scrollbar-visible', '')
    states.set(element, state)
    state.timer = setTimeout(() => {
      if (reducedMotion.matches) return hide(element, state)
      const fade = element.animate(
        { '--scrollbar-opacity': ['1', '0'] },
        { duration: 160, easing: 'ease-out', fill: 'forwards' },
      )
      state.fade = fade
      fade.onfinish = () => {
        if (state.fade === fade) hide(element, state)
      }
    }, 800)
  }

  // Scroll does not bubble. Capture also covers nested scrollers and body portals.
  document.addEventListener('scroll', reveal, { capture: true, passive: true })

  function dispose() {
    document.removeEventListener('scroll', reveal, true)
    for (const [element, state] of states) hide(element, state)
  }
  nuxtApp.vueApp.onUnmount(dispose)
  if (import.meta.hot) import.meta.hot.dispose(dispose)
})
