import type { BillingOrder, PaymentAction } from './types'

export function isOrderSettled(order: BillingOrder) {
  return order.payment_status === 'paid' && order.fulfillment_status === 'fulfilled'
}
export function isOrderTerminal(order: BillingOrder) {
  return (
    ['failed', 'expired', 'canceled', 'refunded', 'partially_refunded', 'disputed'].includes(
      order.payment_status,
    ) ||
    ['closed', 'superseded'].includes(order.fulfillment_status) ||
    isOrderSettled(order)
  )
}
/** Provider dates lacking an offset are UTC, never browser local time. */
export function providerDate(value: string) {
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`)
}
export function paymentUrl(action: PaymentAction | null): string | null {
  if (action?.action_type !== 'redirect' || !action.url) return null
  if (action.expires_at) {
    const expiry = providerDate(action.expires_at)
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return null
  }
  try {
    const url = new URL(action.url)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}

/** A saved action never overrides the order's authoritative payment/fulfillment state. */
export function orderPaymentUrl(order: BillingOrder): string | null {
  if (
    order.payment_status === 'paid' ||
    order.fulfillment_status !== 'pending' ||
    isOrderTerminal(order)
  )
    return null
  return paymentUrl(order.payment_action)
}

/** Hosted upgrade pages are renewed by order ID, even when the previous URL is missing/expired. */
export function canResumeOrderPayment(order: BillingOrder): boolean {
  if (
    order.payment_status === 'paid' ||
    order.fulfillment_status !== 'pending' ||
    isOrderTerminal(order)
  )
    return false
  return (
    (order.kind === 'upgrade' && order.payment_mode === 'stripe_page') ||
    orderPaymentUrl(order) !== null
  )
}
