export interface ChartTheme {
  background: string
  text: string
  grid: string
  up: string
  down: string
}
export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
}
export interface ChartAdapter {
  setData(candles: readonly Candle[]): void
  appendData(candles: readonly Candle[]): void
  seek(time: number): void
  setMarkers(markers: readonly { time: number; label: string }[]): void
  applyTheme(theme: ChartTheme): void
  resize(width: number, height: number): void
  onRangeChange(handler: (range: { from: number; to: number }) => void): () => void
  destroy(): void
}
// SDK implementation is deliberately deferred until chart-library selection.
export type ChartFactory = (element: HTMLElement, theme: ChartTheme) => ChartAdapter
