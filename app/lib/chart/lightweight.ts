import { DEFAULT_CHART_VIEWPORT } from './viewport'
import { formatDateTime } from '~/lib/format'
import { TradeTags } from './trade-tags'
import { TimeLabel } from './time-label'
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineStyle,
  TickMarkType,
  createChart,
  type IPriceLine,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type {
  Candle,
  ChartAdapter,
  ChartMarker,
  ChartRange,
  ChartSelection,
  ChartTheme,
} from './adapter'

export function createLightweightChart(
  element: HTMLElement,
  initialTheme: ChartTheme,
): ChartAdapter {
  let theme = initialTheme,
    rows: readonly Candle[] = [],
    plotted: readonly Candle[] = [],
    currentMarkers: readonly ChartMarker[] = [],
    selection: ChartSelection | null = null
  const desktop = () => window.matchMedia('(min-width: 761px)').matches
  const chart = createChart(element, {
    width: Math.max(1, element.clientWidth),
    height: Math.max(1, element.clientHeight),
    layout: {
      background: { type: ColorType.Solid, color: theme.background },
      textColor: theme.text,
      fontSize: 12,
      attributionLogo: false,
    },
    localization: desktop()
      ? { timeFormatter: (time: Time) => formatDateTime(Number(time) * 1000) }
      : undefined,
    grid: { vertLines: { visible: false }, horzLines: { color: theme.grid } },
    rightPriceScale: { borderVisible: false, minimumWidth: 68 },
    timeScale: {
      borderColor: theme.grid,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: DEFAULT_CHART_VIEWPORT.right,
      shiftVisibleRangeOnNewBar: !desktop(),
      tickMarkFormatter: desktop()
        ? (time: Time, type: TickMarkType) => {
            const text = formatDateTime(Number(time) * 1000)
            return type >= TickMarkType.Time ? text.slice(11) : text.slice(0, 10)
          }
        : undefined,
    },
    crosshair: { mode: 0, vertLine: { labelVisible: !desktop() } },
    handleScroll: { vertTouchDrag: false },
  })
  const series = chart.addSeries(CandlestickSeries, {
    upColor: theme.up,
    downColor: theme.down,
    wickUpColor: theme.up,
    wickDownColor: theme.down,
    borderVisible: false,
    priceLineVisible: false,
  })
  const volume = chart.addSeries(HistogramSeries, {
    priceScaleId: 'volume',
    priceFormat: { type: 'volume' },
    visible: false,
    lastValueVisible: false,
    priceLineVisible: false,
  })
  volume.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } })
  let volumeVisible = false
  function updateMargins(height = element.clientHeight) {
    // Reserve quote + tag headroom in price coordinates, leaving the canvas/grid intact.
    series.priceScale().applyOptions({
      scaleMargins: {
        top: desktop() ? Math.min(0.4, Math.max(0.08, 80 / Math.max(1, height - 28))) : 0.08,
        bottom: volumeVisible ? 0.2 : 0.08,
      },
    })
  }
  const markers = new TradeTags(theme)
  series.attachPrimitive(markers)
  const timeLabelColors = () => {
    const css = getComputedStyle(element)
    return {
      background: css.getPropertyValue('--color-chart-time-label-bg').trim(),
      text: css.getPropertyValue('--color-chart-time-label-text').trim(),
    }
  }
  const timeLabel = desktop() ? new TimeLabel(timeLabelColors()) : null
  if (timeLabel) series.attachPrimitive(timeLabel)
  const shade = document.createElement('div')
  shade.className = 'replay-evidence-shade'
  shade.setAttribute('aria-hidden', 'true')
  element.append(shade)
  let priceLines: IPriceLine[] = []
  let movingWindow = false,
    windowFrame = 0,
    anchorFrame = 0,
    destroyed = false
  function cancelAnchoredZoom() {
    cancelAnimationFrame(anchorFrame)
  }
  element.addEventListener('pointerdown', cancelAnchoredZoom, { passive: true })
  element.addEventListener('wheel', cancelAnchoredZoom, { passive: true })
  const MAX_VISIBLE = 4000,
    BUFFER = 500
  const rangeHandlers = new Set<(r: ChartRange) => void>(),
    selectHandlers = new Set<(time: number, id?: string) => void>(),
    crosshairHandlers = new Set<
      (time: number | null, marker?: import('./adapter').ChartMarkerHit) => void
    >()
  const candle = (c: Candle) => ({
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  })
  const vol = (c: Candle) => ({
    time: c.time as UTCTimestamp,
    value: c.volume ?? 0,
    color: c.close >= c.open ? (theme.volumeUp ?? theme.up) : (theme.volumeDown ?? theme.down),
  })
  function lowerBound(data: readonly Candle[], time: number) {
    let lo = 0,
      hi = data.length - 1
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2)
      if (data[mid]!.time < time) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  function view() {
    const r = chart.timeScale().getVisibleRange()
    return r && typeof r.from === 'number' && typeof r.to === 'number'
      ? { from: r.from, to: r.to }
      : null
  }
  function renderWindow(requested?: ChartRange | null) {
    if (!rows.length) {
      plotted = []
      markers.setMarkers([])
      series.setData([])
      volume.setData([])
      return null
    }
    let range = requested ?? {
      from: rows[Math.max(0, rows.length - 200)]!.time,
      to: rows.at(-1)!.time,
    }
    let low = lowerBound(rows, range.from)
    const high = lowerBound(rows, range.to)
    // A readable viewport has a bounded number of real candles. The fixed timeline
    // and canonical IDs still cover the entire history, without synthetic OHLC.
    if (high - low > MAX_VISIBLE) {
      low = high - MAX_VISIBLE
      range = { from: rows[low]!.time, to: rows[high]!.time }
    }
    const first = Math.max(0, low - BUFFER),
      last = Math.min(rows.length, high + BUFFER + 1)
    const next = rows.slice(first, last)
    if (
      plotted.length !== next.length ||
      plotted[0]?.time !== next[0]?.time ||
      plotted.at(-1)?.time !== next.at(-1)?.time
    ) {
      movingWindow = true
      plotted = next
      markers.setMarkers([])
      series.setData(plotted.map(candle))
      volume.setData(plotted.map(vol))
      setMarkers(currentMarkers)
      movingWindow = false
    }
    return range
  }
  function projectTime(time: number) {
    if (!plotted.length) return null
    return chart
      .timeScale()
      .timeToCoordinate(plotted[lowerBound(plotted, time)]!.time as UTCTimestamp)
  }
  function updateShade() {
    const from = selection?.range ? projectTime(selection.range.from) : null,
      to = selection?.range ? projectTime(selection.range.to) : null
    const width = chart.timeScale().width()
    const left = from === null ? 0 : Math.max(0, from),
      right = to === null ? 0 : Math.min(width, to)
    shade.hidden = from === null || to === null || right < left
    shade.style.left = `${left}px`
    shade.style.width = `${Math.max(2, right - left)}px`
  }
  function setMarkers(value: readonly ChartMarker[]) {
    currentMarkers = value
    markers.setMarkers(
      value.filter(
        (marker) =>
          plotted.length && marker.time >= plotted[0]!.time && marker.time <= plotted.at(-1)!.time,
      ),
    )
  }

  function setSelection(value: ChartSelection | null) {
    selection = value
    priceLines.forEach((line) => series.removePriceLine(line))
    priceLines = []
    for (const line of value?.prices ?? [])
      if (Number.isFinite(line.price))
        priceLines.push(
          series.createPriceLine({
            price: line.price,
            title: line.label,
            color: theme.accent ?? theme.text,
            lineStyle: LineStyle.Dashed,
            lineWidth: 1,
            axisLabelVisible: false,
          }),
        )
    updateShade()
  }
  // Time ranges round to candle boundaries; logical ranges also track fractional pans.
  chart.timeScale().subscribeVisibleLogicalRangeChange(updateShade)
  chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
    if (
      movingWindow ||
      destroyed ||
      !range ||
      typeof range.from !== 'number' ||
      typeof range.to !== 'number'
    )
      return
    const value = { from: range.from as number, to: range.to as number }
    rangeHandlers.forEach((h) => h(value))
    if (!rows.length || !plotted.length) return
    const from = lowerBound(rows, value.from),
      to = lowerBound(rows, value.to)
    const left = lowerBound(rows, plotted[0]!.time),
      right = lowerBound(rows, plotted.at(-1)!.time)
    if (
      (left > 0 && from - left < 100) ||
      (right < rows.length - 1 && right - to < 100) ||
      to - from > MAX_VISIBLE
    ) {
      cancelAnimationFrame(windowFrame)
      windowFrame = requestAnimationFrame(() => {
        if (!destroyed) setVisibleRange(value)
      })
    }
  })
  chart.subscribeClick((event) => {
    const hit = event.point ? markers.markerAt(event.point.x, event.point.y) : undefined
    const markerId =
      hit?.id ?? (typeof event.hoveredObjectId === 'string' ? event.hoveredObjectId : undefined)
    const marker = currentMarkers.find((item) => item.id === markerId)
    if (typeof event.time === 'number' || marker)
      selectHandlers.forEach((h) => h(marker?.time ?? (event.time as number), markerId))
  })
  chart.subscribeCrosshairMove((event) => {
    const time = typeof event.time === 'number' ? event.time : null
    timeLabel?.setTime(time)
    const hit = event.point ? markers.markerAt(event.point.x, event.point.y) : undefined
    crosshairHandlers.forEach((h) => h(time, hit))
  })
  function setVisibleRange(requested: ChartRange) {
    cancelAnchoredZoom()
    if (!rows.length || requested.from >= requested.to) return
    const range = renderWindow(requested)
    if (range && range.to > range.from)
      chart
        .timeScale()
        .setVisibleRange({ from: range.from as UTCTimestamp, to: range.to as UTCTimestamp })
    updateShade()
  }
  function focusDefaultViewport(time: number) {
    cancelAnchoredZoom()
    if (!rows.length) return
    const index = lowerBound(rows, time)
    renderWindow({
      from: rows[Math.max(0, index - DEFAULT_CHART_VIEWPORT.history)]!.time,
      to: rows[Math.min(rows.length - 1, index + DEFAULT_CHART_VIEWPORT.right)]!.time,
    })
    const target = lowerBound(plotted, time)
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(-1, target - DEFAULT_CHART_VIEWPORT.history),
      to: target + (desktop() ? DEFAULT_CHART_VIEWPORT.right : 30),
    })
    updateShade()
  }
  function zoomAroundTime(requested: ChartRange, time: number) {
    if (!rows.length || requested.from >= requested.to) return
    cancelAnchoredZoom()
    cancelAnimationFrame(windowFrame)
    const scale = chart.timeScale()
    const x = scale.timeToCoordinate(time as UTCTimestamp)
    if (x === null || !scale.width()) return
    const fraction = Math.max(0, Math.min(1, x / scale.width()))
    const span = Math.max(
      1,
      Math.min(MAX_VISIBLE, lowerBound(rows, requested.to) - lowerBound(rows, requested.from)),
    )
    const index = lowerBound(rows, time)
    // Load the viewport around the anchor, allowing evidence to extend off screen.
    renderWindow({
      from: rows[Math.max(0, Math.floor(index - fraction * span))]!.time,
      to: rows[Math.min(rows.length - 1, Math.ceil(index + (1 - fraction) * span))]!.time,
    })
    const anchor = scale.timeToIndex(time as UTCTimestamp)
    if (anchor === null) return
    // Logical endpoints include both edge bars. Match the SDK's half-bar center
    // and 1px axis inset; range setters are deferred, so do not read back yet.
    const position = () => {
      const from = anchor + 0.5 - ((x + 1) / scale.width()) * (span + 1)
      scale.setVisibleLogicalRange({ from, to: from + span })
    }
    position()
    // Autoscale may change price-label width during the next paint. Preserve
    // the absolute x coordinate once that layout settles, not its old ratio.
    const settle = (previousWidth: number, remaining: number) => {
      anchorFrame = requestAnimationFrame(() => {
        if (destroyed || scale.width() === previousWidth) return
        position()
        if (remaining > 0) settle(scale.width(), remaining - 1)
      })
    }
    settle(scale.width(), 2)
  }
  return {
    setData(value) {
      const saved = view()
      rows = value
      const price = value[0]?.close
      if (price && price > 0) {
        const precision = Math.max(2, Math.min(8, Math.ceil(-Math.log10(price)) + 4))
        series.applyOptions({
          priceFormat: { type: 'price', precision, minMove: 10 ** -precision },
        })
      }
      renderWindow(saved)
      updateShade()
    },
    appendData(value) {
      if (!value.length) return
      const last = rows.at(-1)?.time
      rows = [...rows, ...value]
      if (
        plotted.at(-1)?.time === last &&
        plotted.length + value.length < MAX_VISIBLE + BUFFER * 2
      ) {
        plotted = [...plotted, ...value]
        for (const c of value) {
          series.update(candle(c))
          volume.update(vol(c))
        }
      }
      updateShade()
    },
    seek(time) {
      if (desktop()) return focusDefaultViewport(time)
      const range = chart.timeScale().getVisibleRange()
      const span =
        range && typeof range.from === 'number' && typeof range.to === 'number'
          ? range.to - range.from
          : 3600 * 100
      setVisibleRange({ from: time - span / 2, to: time + span / 2 })
    },
    follow() {
      const latest = rows.at(-1)
      if (latest) focusDefaultViewport(latest.time)
    },
    setVisibleRange,
    zoomAroundTime,
    getViewState: view,
    setMarkers,
    setSelection,
    setVolume(visible) {
      volume.applyOptions({ visible })
      volumeVisible = visible
      updateMargins()
    },
    applyTheme(value) {
      theme = value
      markers.setTheme(value)
      timeLabel?.setColors(timeLabelColors())
      chart.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: theme.background },
          textColor: theme.text,
        },
        grid: { horzLines: { color: theme.grid } },
        timeScale: { borderColor: theme.grid },
      })
      series.applyOptions({
        upColor: theme.up,
        downColor: theme.down,
        wickUpColor: theme.up,
        wickDownColor: theme.down,
      })
      volume.setData(plotted.map(vol))
      setMarkers(currentMarkers)
      setSelection(selection)
    },
    resize(width, height) {
      if (width > 0 && height > 0) {
        chart.resize(Math.floor(width), Math.floor(height))
        updateMargins(height)
        updateShade()
      }
    },
    onRangeChange(handler) {
      rangeHandlers.add(handler)
      return () => {
        rangeHandlers.delete(handler)
      }
    },
    onSelect(handler) {
      selectHandlers.add(handler)
      return () => {
        selectHandlers.delete(handler)
      }
    },
    onCrosshair(handler) {
      crosshairHandlers.add(handler)
      return () => {
        crosshairHandlers.delete(handler)
      }
    },
    destroy() {
      destroyed = true
      cancelAnimationFrame(windowFrame)
      cancelAnchoredZoom()
      element.removeEventListener('pointerdown', cancelAnchoredZoom)
      element.removeEventListener('wheel', cancelAnchoredZoom)
      rangeHandlers.clear()
      selectHandlers.clear()
      crosshairHandlers.clear()
      series.detachPrimitive(markers)
      if (timeLabel) series.detachPrimitive(timeLabel)
      shade.remove()
      chart.remove()
    },
  }
}
