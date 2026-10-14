import type { HttpClient } from '~/lib/http/client'
import type {
  BillingAccount,
  BillingOrder,
  BillingQuote,
  CreditBalance,
  CreditCharge,
  CreditLedgerPage,
  OrderPage,
  PlanCatalog,
} from './types'

export function createBillingApi(http: HttpClient) {
  return {
    plans: (signal?: AbortSignal) =>
      http.requestJson<PlanCatalog>('/billing/plans', { auth: false, signal }),
    account: (signal?: AbortSignal) =>
      http.requestJson<BillingAccount>('/billing/account', { signal }),
    balance: (signal?: AbortSignal) =>
      http.requestJson<CreditBalance>('/credits/balance', { signal }),
    ledger: (page = 1, size = 20, signal?: AbortSignal) =>
      http.requestJson<CreditLedgerPage>('/credits/ledger', { query: { page, size }, signal }),
    charge: (id: string, signal?: AbortSignal) =>
      http.requestJson<CreditCharge>(`/credits/charges/${encodeURIComponent(id)}`, { signal }),
    order: (id: string, signal?: AbortSignal) =>
      http.requestJson<BillingOrder>(`/billing/orders/${encodeURIComponent(id)}`, { signal }),
    orders: (signal?: AbortSignal) =>
      http.requestJson<OrderPage>('/billing/orders', { query: { page: 1, size: 20 }, signal }),
    topUpQuote: (amount: string, key: string, signal?: AbortSignal) =>
      http.requestJson<BillingQuote>('/billing/topup-quotes', {
        method: 'POST',
        body: { amount_usd: amount },
        idempotencyKey: key,
        signal,
      }),
  }
}
