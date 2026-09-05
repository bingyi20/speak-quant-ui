import { cancellationError } from './error'
/** Cancel this caller's wait without aborting a refresh shared by other callers. */
export function waitWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(cancellationError())
      return
    }
    const abort = () => reject(cancellationError())
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
