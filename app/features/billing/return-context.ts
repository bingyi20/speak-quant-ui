import { readStorage, safeReturnPath, writeStorage } from '~/lib/storage/safe-storage'

export interface PaymentReturnContext {
  owner: string
  orderId: string
  path: string
}
const key = (owner: string) => `speakquant-payment-return:${owner}`
export function savePaymentReturn(storage: Storage, context: PaymentReturnContext) {
  writeStorage(storage, key(context.owner), {
    owner: context.owner,
    orderId: context.orderId,
    path: context.path,
  })
}
export function readPaymentReturn(storage: Storage, owner: string, orderId: string) {
  const context = readStorage(storage, key(owner), (value): value is PaymentReturnContext => {
    if (!value || typeof value !== 'object') return false
    const context = value as PaymentReturnContext
    return (
      context.owner === owner &&
      context.orderId === orderId &&
      typeof context.path === 'string' &&
      safeReturnPath(context.path, '') === context.path &&
      !context.path.startsWith('/billing/')
    )
  })
  // Legacy entries may contain UI state; only the original address is restored.
  return context ? { owner: context.owner, orderId: context.orderId, path: context.path } : null
}
export function clearPaymentReturn(storage: Storage, owner: string) {
  writeStorage(storage, key(owner), null)
}
