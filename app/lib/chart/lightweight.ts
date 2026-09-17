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
      rightOffset: 8,
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
    destroyed = false
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
    const marker = currentMarkers.find((item) => item.id === event.hoveredObjectId)
    if (typeof event.time === 'number' || marker)
      selectHandlers.forEach((h) =>
        h(
          marker?.time ?? (event.time as number),
          typeof event.hoveredObjectId === 'string' ? event.hoveredObjectId : undefined,
        ),
      )
  })
  chart.subscribeCrosshairMove((event) => {
    const time = typeof event.time === 'number' ? event.time : null
    timeLabel?.setTime(time)
    const hit = event.point ? markers.markerAt(event.point.x, event.point.y) : undefined
    crosshairHandlers.forEach((h) => h(time, hit))
  })
  function setVisibleRange(requested: ChartRange) {
    if (!rows.length || requested.from >= requested.to) return
    const range = renderWindow(requested)
    if (range && range.to > range.from)
      chart
        .timeScale()
        .setVisibleRange({ from: range.from as UTCTimestamp, to: range.to as UTCTimestamp })
    updateShade()
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
      const range = chart.timeScale().getVisibleRange()
      const span =
        range && typeof range.from === 'number' && typeof range.to === 'number'
          ? range.to - range.from
          : 3600 * 100
      setVisibleRange({ from: time - span / 2, to: time + span / 2 })
    },
    follow() {
      if (!rows.length) return
      renderWindow({ from: rows[Math.max(0, rows.length - 101)]!.time, to: rows.at(-1)!.time })
      const to = plotted.length - 1,
        from = Math.max(-1, to - 100)
      chart.timeScale().setVisibleLogicalRange({ from, to: to + 30 })
      updateShade()
    },
    setVisibleRange,
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
