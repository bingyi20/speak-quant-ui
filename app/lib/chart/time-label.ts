import type {
  IPrimitivePaneRenderer,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import { formatDateTime } from '~/lib/format'

/** Use the time-axis tick baseline, without the SDK crosshair's extra glyph correction. */
export class TimeLabel implements ISeriesPrimitive<Time> {
  private owner?: SeriesAttachedParameter<Time>
  private time: number | null = null
  constructor(private colors: { background: string; text: string }) {}
  setColors(colors: { background: string; text: string }) {
    this.colors = colors
    this.owner?.requestUpdate()
  }
  attached(owner: SeriesAttachedParameter<Time>) {
    this.owner = owner
  }
  detached() {
    this.owner = undefined
  }
  setTime(time: number | null) {
    this.time = time
    this.owner?.requestUpdate()
  }
  private renderer: IPrimitivePaneRenderer = {
    draw: (target) => {
      const owner = this.owner
      if (!owner || this.time === null) return
      const x = owner.chart.timeScale().timeToCoordinate(this.time as UTCTimestamp)
      if (x === null) return
      const options = owner.chart.options()
      const { fontSize, fontFamily } = options.layout
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        if (x < 0 || x > mediaSize.width) return
        const text = formatDateTime(this.time! * 1000)
        context.font = `${fontSize}px ${fontFamily}`
        context.textAlign = 'left'
        context.textBaseline = 'middle'
        const padding = (9 * fontSize) / 12
        const metrics = context.measureText(text)
        const width = metrics.width + padding * 2
        const left = Math.max(0, Math.min(mediaSize.width - width, x - width / 2))
        // Lightweight Charts 5.2 time-axis ticks: 1px border, 5px tick, fontSize/4 padding.
        const baseline = 1 + 5 + fontSize / 4 + fontSize / 2
        const ascent = metrics.actualBoundingBoxAscent
        const descent = metrics.actualBoundingBoxDescent
        const center = baseline + (descent - ascent) / 2
        const height = Math.min(
          ascent + descent + 8,
          2 * Math.min(center, mediaSize.height - center),
        )
        const top = center - height / 2
        context.fillStyle = this.colors.background
        context.beginPath()
        context.roundRect(left, top, width, height, 5)
        context.fill()
        context.fillStyle = this.colors.text
        context.fillText(text, left + padding, baseline)
      })
    },
  }
  private views = [{ zOrder: () => 'top' as const, renderer: () => this.renderer }]
  timeAxisPaneViews() {
    return this.views
  }
}
