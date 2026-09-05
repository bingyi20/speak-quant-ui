/** Resources belong to a component/effect scope, never a module-global singleton. */
export function useDisposableScope() {
  const controller = new AbortController()
  const disposers: Array<() => void> = []
  onScopeDispose(() => {
    controller.abort()
    for (const dispose of disposers.splice(0)) dispose()
  })
  return {
    signal: controller.signal,
    add: (dispose: () => void) => {
      disposers.push(dispose)
    },
  }
}
