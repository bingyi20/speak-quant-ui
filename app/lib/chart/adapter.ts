export interface ChartTheme {
  background: string
  text: string
  grid: string
  up: string
  down: string
  buy: string
  sell: string
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
  side: 'buy' | 'sell'
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
export interface ChartSelection {
  range?: ChartRange
  prices?: Array<{ price: number; label: string }>
}
export interface ChartAdapter {
  setData(candles: readonly Candle[]): void
  appendData(candles: readonly Candle[]): void
  seek(time: number): void
  follow(): void
  setVisibleRange(range: ChartRange): void
  getViewState(): ChartRange | null
  setMarkers(markers: readonly ChartMarker[]): void
  setSelection(selection: ChartSelection | null): void
  setVolume(visible: boolean): void
  applyTheme(theme: ChartTheme): void
  resize(width: number, height: number): void
  onRangeChange(handler: (range: ChartRange) => void): () => void
  onSelect(handler: (time: number, markerId?: string) => void): () => void
  onCrosshair(handler: (time: number | null, marker?: ChartMarkerHit) => void): () => void
  destroy(): void
}
export type ChartFactory = (element: HTMLElement, theme: ChartTheme) => ChartAdapter
