interface PanelState {
  view: 'assets' | 'strategy' | 'replay'
  open: boolean
  fullscreen: boolean
  position: number
}
export function useWorkspace() {
  const panel = reactive<PanelState>({
    view: 'assets',
    open: false,
    fullscreen: false,
    position: 0,
  })
  function show(view: PanelState['view']) {
    panel.view = view
    panel.open = true
  }
  function close() {
    panel.open = false
    panel.fullscreen = false
  }
  function reset() {
    close()
    panel.view = 'assets'
    panel.position = 0
  }
  return { panel, show, close, reset }
}
