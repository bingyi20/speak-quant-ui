import type { ChartAdapter, ChartFactory, ChartTheme } from '~/lib/chart/adapter'
export function useChart(host: Ref<HTMLElement | null>, factory: ChartFactory) {
  const { resolvedTheme } = useTheme()
  let adapter: ChartAdapter | undefined
  let observer: ResizeObserver | undefined
  function theme(): ChartTheme {
    const style = getComputedStyle(document.documentElement)
    const color = (name: string) => style.getPropertyValue(name).trim()
    return {
      background: color('--color-bg-surface'),
      text: color('--color-text-secondary'),
      grid: color('--color-chart-grid'),
      up: color('--color-chart-up'),
      down: color('--color-chart-down'),
      buy: color('--color-chart-buy'),
      sell: color('--color-chart-sell'),
      tagText: color('--color-chart-tag-text'),
    }
  }
  function dispose() {
    observer?.disconnect()
    adapter?.destroy()
    observer = undefined
    adapter = undefined
  }
  onMounted(() => {
    watch(
      host,
      (element) => {
        dispose()
        if (!element) return
        adapter = factory(element, theme())
        observer = new ResizeObserver((entries) => {
          const rect = entries[0]?.contentRect
          if (rect) adapter?.resize(rect.width, rect.height)
        })
        observer.observe(element)
      },
      { immediate: true, flush: 'post' },
    )
  })
  watch(
    resolvedTheme,
    () => {
      if (adapter) adapter.applyTheme(theme())
    },
    { flush: 'post' },
  )
  onScopeDispose(dispose)
  // Never expose SDK objects to serialized state. Components act through this callback.
  return {
    withChart: (action: (chart: ChartAdapter) => void) => {
      if (adapter) action(adapter)
    },
  }
}
