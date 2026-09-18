import type {
  IPrimitivePaneRenderer,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import type { ChartMarker, ChartTheme } from './adapter'

type Hit = { id: string; left: number; top: number; width: number; height: number }
/** A series primitive keeps tags anchored through pan, zoom, autoscale and resize. */
export class TradeTags implements ISeriesPrimitive<Time> {
  private attachedTo?: SeriesAttachedParameter<Time>
  private markers: readonly ChartMarker[] = []
  private hits: Hit[] = []
  constructor(private theme: ChartTheme) {}
  attached(parameters: SeriesAttachedParameter<Time>) {
    this.attachedTo = parameters
  }
  detached() {
    this.attachedTo = undefined
    this.hits = []
  }
  setMarkers(markers: readonly ChartMarker[]) {
    this.markers = markers
    this.attachedTo?.requestUpdate()
  }
  setTheme(theme: ChartTheme) {
    this.theme = theme
    this.attachedTo?.requestUpdate()
  }
  private renderer: IPrimitivePaneRenderer = {
    draw: (target) => {
      this.hits = []
      const attached = this.attachedTo
      if (!attached) return
      target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
        const topInset = window.matchMedia('(min-width: 761px)').matches ? 34 : 3
        ctx.font = '600 12px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        for (const marker of this.markers) {
          const x = attached.chart.timeScale().timeToCoordinate(marker.time as UTCTimestamp)
          if (marker.side === 'insight') {
            if (x === null || x < 0 || x > mediaSize.width) continue
            // Keep edge candles' insight controls visible and clickable after interval fitting.
            const centerX = Math.max(12, Math.min(mediaSize.width - 12, x))
            const y = mediaSize.height - 18
            const color = this.theme.insight ?? this.theme.accent ?? this.theme.text
            ctx.fillStyle = marker.active ? color : this.theme.background
            ctx.strokeStyle = color
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.arc(centerX, y, 8, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()
            ctx.save()
            ctx.fillStyle = marker.active ? this.theme.tagText : color
            if (marker.label) {
              ctx.font = '600 10px sans-serif'
              ctx.fillText(marker.label, centerX, y)
            } else {
              // A small bulb conveys an insight without resembling an alert or info badge.
              ctx.strokeStyle = ctx.fillStyle
              ctx.lineWidth = 1.1
              ctx.lineCap = 'round'
              ctx.lineJoin = 'round'
              ctx.beginPath()
              ctx.moveTo(centerX - 1.5, y + 2.5)
              ctx.lineTo(centerX - 1.5, y + 1.5)
              ctx.bezierCurveTo(centerX - 1.5, y + 0.5, centerX - 3, y, centerX - 3, y - 1.7)
              ctx.bezierCurveTo(centerX - 3, y - 5.5, centerX + 3, y - 5.5, centerX + 3, y - 1.7)
              ctx.bezierCurveTo(centerX + 3, y, centerX + 1.5, y + 0.5, centerX + 1.5, y + 1.5)
              ctx.lineTo(centerX + 1.5, y + 2.5)
              ctx.closePath()
              ctx.moveTo(centerX - 1, y + 4.5)
              ctx.lineTo(centerX + 1, y + 4.5)
              ctx.stroke()
            }
            ctx.restore()
            // Preserve the comfortable hit area while reducing the visible circle.
            this.hits.push({
              id: marker.id,
              left: centerX - 10,
              top: y - 10,
              width: 20,
              height: 20,
            })
            continue
          }
          const y = attached.series.priceToCoordinate(marker.price)
          const edge = attached.series.priceToCoordinate(marker.edgePrice)
          if (
            x === null ||
            y === null ||
            edge === null ||
            x < 0 ||
            x > mediaSize.width ||
            y < 0 ||
            y > mediaSize.height
          )
            continue
          const width = Math.max(24, ctx.measureText(marker.label).width + 12),
            height = 23
          const left = Math.max(1, Math.min(mediaSize.width - width - 1, x - width / 2))
          let top = Math.max(topInset, Math.min(y, edge) - height - 18)
          // Keep nearby tags apart without covering candle bodies whenever possible.
          for (let level = 0; level < 5; level++) {
            if (
              !this.hits.some(
                (hit) =>
                  left < hit.left + hit.width + 3 &&
                  left + width + 3 > hit.left &&
                  top < hit.top + hit.height + 6 &&
                  top + height + 6 > hit.top,
              )
            )
              break
            top =
              top > topInset + height + 12
                ? top - height - 10
                : Math.min(
                    mediaSize.height - height - 8,
                    Math.max(y, edge) + 18 + level * (height + 8),
                  )
          }
          top = Math.max(topInset, top)
          const color = marker.side === 'buy' ? this.theme.buy : this.theme.sell
          const below = top > y,
            tipY = below ? top - 5 : top + height + 5
          ctx.strokeStyle = color
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(left + width / 2, tipY)
          ctx.stroke()
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(x, y, 3, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = this.theme.background
          ctx.stroke()
          ctx.beginPath()
          ctx.roundRect(left, top, width, height, 4)
          ctx.fill()
          ctx.beginPath()
          ctx.moveTo(left + width / 2 - 5, below ? top : top + height)
          ctx.lineTo(left + width / 2, tipY)
          ctx.lineTo(left + width / 2 + 5, below ? top : top + height)
          ctx.fill()
          ctx.fillStyle = this.theme.tagText
          ctx.fillText(marker.label, left + width / 2, top + height / 2)
          this.hits.push({ id: marker.id, left, top, width, height })
        }
      })
    },
  }
  private views = [{ zOrder: () => 'top' as const, renderer: () => this.renderer }]
  paneViews() {
    return this.views
  }
  markerAt(x: number, y: number) {
    return this.hits.findLast(
      (item) =>
        x >= item.left - 3 &&
        x <= item.left + item.width + 3 &&
        y >= item.top - 3 &&
        y <= item.top + item.height + 5,
    )
  }
  hitTest(x: number, y: number) {
    const hit = this.markerAt(x, y)
    return hit
      ? {
          externalId: hit.id,
          zOrder: 'top' as const,
          cursorStyle: 'pointer',
          distance: 0,
          hitTestPriority: 2,
        }
      : null
  }
}
