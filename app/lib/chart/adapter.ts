export interface ChartTheme {
  background: string
  text: string
  grid: string
  up: string
  down: string
  buy: string
  sell: string
  insight?: string
  tagText: string
  accent?: string
  volumeUp?: string
  volumeDown?: string
}
export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}
export interface ChartMarker {
  id: string
  time: number
  label: string
  side: 'buy' | 'sell' | 'insight'
  active?: boolean
  price: number
  edgePrice: number
}
export interface ChartMarkerHit {
  id: string
  left: number
  top: number
  width: number
  height: number
}
export interface ChartRange {
  from: number
  to: number
}
export type ChartViewportRequest =
  | (ChartRange & {
      /** Set for single-candle/default positioning; omitted to fit an evidence interval. */
      focusTime?: number
    })
  /** Reveal an off-screen endpoint without changing the user's candle spacing. */
  | { revealTime: number }
  /** Move the historical cutoff to the playback anchor, preserving candle spacing. */
  | { seekTime: number }
export interface ChartSelection {
  range?: ChartRange
  prices?: Array<{ price: number; label: string }>
}
export interface ChartAdapter {
  setData(candles: readonly Candle[]): void
  appendData(candles: readonly Candle[]): void
  seek(time: number): void
  follow(animated?: boolean): void
  resetView(time?: number): void
  setVisibleRange(range: ChartRange): void
  revealTime(time: number): void
  getViewState(): ChartRange | null
  setMarkers(markers: readonly ChartMarker[]): void
  setSelection(selection: ChartSelection | null): void
  setVolume(visible: boolean): void
  applyTheme(theme: ChartTheme): void
  resize(width: number, height: number): void
  onReturnVisibilityChange(handler: (visible: boolean) => void): () => void
  onRangeChange(handler: (range: ChartRange) => void): () => void
  onSelect(handler: (time: number, markerId?: string) => void): () => void
  onCrosshair(handler: (time: number | null, marker?: ChartMarkerHit) => void): () => void
  destroy(): void
}
export type ChartFactory = (element: HTMLElement, theme: ChartTheme) => ChartAdapter
