import {
  canReturnToLatest,
  playbackViewportPolicy,
  playbackViewportPosition,
  type PlaybackViewportPolicy,
  DEFAULT_CHART_VIEWPORT,
  EVIDENCE_REVEAL_POSITION,
  PLAYBACK_VIEWPORT_POSITION,
} from './viewport'
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
  type Logical,
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
    positionFrame = 0,
    followFrame = 0,
    gestureFrame = 0,
    destroyed = false
  let policy: PlaybackViewportPolicy = { mode: 'following', position: PLAYBACK_VIEWPORT_POSITION }
  let gesturing = false
  let gestureStart: { right: number; spacing: number } | null = null
  let gestureTimer: ReturnType<typeof setTimeout> | undefined
  const returnHandlers = new Set<(visible: boolean) => void>()
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
  function geometry() {
    if (!rows.length || !plotted.length) return null
    const scale = chart.timeScale()
    const width = scale.width(),
      spacing = scale.options().barSpacing
    const first = lowerBound(rows, plotted[0]!.time)
    const x = scale.logicalToCoordinate((rows.length - 1 - first) as Logical)
    if (x === null || width <= 0) return null
    return { x, width, spacing, right: first + plotted.length - 1 + scale.scrollPosition() }
  }
  function publishReturnVisibility() {
    const g = geometry()
    const visible =
      !!g && !followFrame && canReturnToLatest(g.x, g.width, g.spacing, rows.length - 1)
    returnHandlers.forEach((handler) => handler(visible))
  }
  function adoptGesture() {
    const g = geometry()
    if (
      g &&
      gestureStart &&
      (Math.abs(g.right - gestureStart.right) > 1e-6 ||
        Math.abs(g.spacing - gestureStart.spacing) > 1e-6)
    )
      policy = playbackViewportPolicy(g.x, g.width, g.spacing)
  }
  function beginGesture() {
    cancelMovement()
    cancelAnimationFrame(gestureFrame)
    clearTimeout(gestureTimer)
    if (!gesturing) gestureStart = geometry()
    gesturing = true
  }
  function endGesture() {
    if (!gesturing) return
    cancelAnimationFrame(gestureFrame)
    gestureFrame = requestAnimationFrame(() => {
      adoptGesture()
      gesturing = false
      gestureStart = null
      publishReturnVisibility()
    })
  }
  function wheelGesture() {
    beginGesture()
    gestureTimer = setTimeout(endGesture, 120)
  }
  function cancelGesture() {
    clearTimeout(gestureTimer)
    cancelAnimationFrame(gestureFrame)
    gesturing = false
    gestureStart = null
  }
  // Logical ranges include fractional pans; button visibility follows geometry,
  // not pointer-down, hover, or the playback/evidence selection state.
  chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
    updateShade()
    if (gesturing && !movingWindow) adoptGesture()
    publishReturnVisibility()
  })
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
    if (!rows.length || !plotted.length || followFrame) return
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
    cancelMovement()
    policy = { mode: 'detached' }
    if (!rows.length || requested.from >= requested.to) return
    const range = renderWindow(requested)
    if (range && range.to > range.from)
      chart
        .timeScale()
        .setVisibleRange({ from: range.from as UTCTimestamp, to: range.to as UTCTimestamp })
    updateShade()
    positionFrame = requestAnimationFrame(() => {
      const g = geometry()
      if (g) policy = playbackViewportPolicy(g.x, g.width, g.spacing)
      publishReturnVisibility()
    })
  }
  function focusDefaultViewport(time: number) {
    cancelMovement()
    if (!rows.length) return
    const index = lowerBound(rows, time)
    renderWindow({
      from: rows[Math.max(0, index - DEFAULT_CHART_VIEWPORT.history)]!.time,
      to: rows[Math.min(rows.length - 1, index + DEFAULT_CHART_VIEWPORT.right)]!.time,
    })
    const target = lowerBound(plotted, time)
    const scale = chart.timeScale()
    const span =
      DEFAULT_CHART_VIEWPORT.history + (desktop() ? DEFAULT_CHART_VIEWPORT.right : 30) + 1
    const spacing = scale.width() / span
    const position = desktop()
      ? playbackViewportPosition(index, scale.width(), spacing)
      : PLAYBACK_VIEWPORT_POSITION
    policy =
      position < PLAYBACK_VIEWPORT_POSITION
        ? { mode: 'filling' }
        : { mode: 'following', position: PLAYBACK_VIEWPORT_POSITION }
    const right = target - 0.5 + (scale.width() * (1 - position) - 1) / spacing
    scale.setVisibleLogicalRange({ from: right - span + 1, to: right })
    positionFrame = requestAnimationFrame(() => {
      positionTime(time, desktop() ? 'playback' : PLAYBACK_VIEWPORT_POSITION)
    })
    updateShade()
  }
  function positionTime(time: number, position: number | 'playback', onlyIfHidden = false) {
    cancelMovement()
    if (!rows.length || !plotted.length) return
    const scale = chart.timeScale()
    const width = scale.width()
    const first = lowerBound(rows, plotted[0]!.time)
    const index = lowerBound(rows, time)
    const x = scale.logicalToCoordinate((index - first) as Logical)
    // Use candle positions within the actual plot bounds, excluding the price axis.
    // Evidence inspection leaves visible endpoints alone; playback navigation
    // uses the revealed history length and the user's current candle spacing.
    if (x === null || !width || (onlyIfHidden && x >= 0 && x < width)) return
    cancelAnimationFrame(windowFrame)
    const barSpacing = scale.options().barSpacing
    const anchor =
      position === 'playback' ? playbackViewportPosition(index, width, barSpacing) : position
    if (position === 'playback')
      policy =
        anchor < PLAYBACK_VIEWPORT_POSITION
          ? { mode: 'filling' }
          : { mode: 'following', position: PLAYBACK_VIEWPORT_POSITION }
    const destination = width * anchor
    const right =
      first + plotted.length - 1 + scale.scrollPosition() + (x - destination) / barSpacing
    const offset = moveRight(right, barSpacing)
    // New prices can resize the price axis on the next draw. Align once that
    // layout settles, unless another gesture has already changed the viewport.
    positionFrame = requestAnimationFrame(() => {
      if (
        !destroyed &&
        scale.width() !== width &&
        Math.abs(scale.scrollPosition() - offset) < 1e-6 &&
        Math.abs(scale.options().barSpacing - barSpacing) < 1e-6
      )
        positionTime(time, position)
      publishReturnVisibility()
    })
    updateShade()
  }
  function cancelMovement() {
    cancelAnimationFrame(windowFrame)
    cancelAnimationFrame(followFrame)
    cancelAnimationFrame(positionFrame)
    followFrame = 0
  }
  // Translate in global logical indices so a long pan can cross data buffers
  // without resetting the user's candle spacing.
  function moveRight(right: number, barSpacing: number) {
    const scale = chart.timeScale()
    const at = (index: number) => rows[Math.max(0, Math.min(rows.length - 1, index))]!.time
    renderWindow({
      from: at(Math.floor(right - scale.width() / barSpacing)),
      to: at(Math.ceil(right)),
    })
    scale.applyOptions({ barSpacing })
    const offset = right - lowerBound(rows, plotted.at(-1)!.time)
    scale.scrollToPosition(offset, false)
    return offset
  }
  function follow(animated = false) {
    if (!rows.length || !plotted.length || (!animated && (followFrame || gesturing))) return
    const latest = () => rows.at(-1)!.time
    if (!animated) {
      const g = geometry()
      if (policy.mode === 'filling' && g && g.x >= g.width * PLAYBACK_VIEWPORT_POSITION)
        policy = { mode: 'following', position: PLAYBACK_VIEWPORT_POSITION }
      if (policy.mode === 'following') positionTime(latest(), policy.position)
      publishReturnVisibility()
      return
    }
    cancelGesture()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      positionTime(latest(), 'playback')
      return
    }
    cancelMovement()
    cancelAnimationFrame(windowFrame)
    const scale = chart.timeScale()
    const barSpacing = scale.options().barSpacing
    const startRight = lowerBound(rows, plotted.at(-1)!.time) + scale.scrollPosition()
    const start = performance.now()
    const step = (now: number) => {
      if (destroyed) return
      const progress = Math.min(1, (now - start) / 260)
      if (progress === 1) {
        positionTime(latest(), 'playback')
        return
      }
      // Playback may append bars during the animation. Retarget to its current
      // cutoff, never to unrevealed history, without restarting the transition.
      const position = playbackViewportPosition(rows.length - 1, scale.width(), barSpacing)
      const target = rows.length - 1 + (scale.width() * (1 - position) - 1) / barSpacing - 0.5
      moveRight(startRight + (target - startRight) * (1 - (1 - progress) ** 3), barSpacing)
      followFrame = requestAnimationFrame(step)
    }
    followFrame = requestAnimationFrame(step)
    publishReturnVisibility()
  }
  // A manual gesture takes ownership immediately; no pending pan can snap back.
  element.addEventListener('pointerdown', beginGesture, { capture: true })
  element.addEventListener('wheel', wheelGesture, { capture: true, passive: true })
  window.addEventListener('pointerup', endGesture)
  window.addEventListener('pointercancel', endGesture)
  return {
    setData(value) {
      cancelMovement()
      cancelGesture()
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
      publishReturnVisibility()
    },
    seek(time) {
      cancelGesture()
      positionTime(time, 'playback')
    },
    follow,
    resetView(time = rows.at(-1)?.time) {
      if (time !== undefined) focusDefaultViewport(time)
    },
    setVisibleRange,
    revealTime: (time) => positionTime(time, EVIDENCE_REVEAL_POSITION, true),
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
    onReturnVisibilityChange(handler) {
      returnHandlers.add(handler)
      publishReturnVisibility()
      return () => {
        returnHandlers.delete(handler)
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
      cancelMovement()
      cancelGesture()
      element.removeEventListener('pointerdown', beginGesture, true)
      element.removeEventListener('wheel', wheelGesture, true)
      window.removeEventListener('pointerup', endGesture)
      window.removeEventListener('pointercancel', endGesture)
      returnHandlers.clear()
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
