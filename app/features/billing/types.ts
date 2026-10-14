export type PlanCode = 'basic' | 'pro' | 'max'
export interface Plan {
  code: PlanCode
  version: string
  price_usd: string
  monthly_credits: string
  rank: number
}
export interface PlanCatalog {
  currency: string
  billing_interval: string
  auto_renew: boolean
  plans: Plan[]
  signup_credits: string
  recurring_free_credits: string
  cost_coefficient: string
  topup_markup_bps: string
  topup_min_usd: string
  topup_max_usd?: string | null
  monthly_credits_rollover: boolean
  signup_and_topup_expire: boolean
}
export interface Subscription {
  id: string
  plan_code: PlanCode
  plan_version: string
  status: string
  monthly_price_usd: string
  monthly_credits: string
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: boolean
  auto_renew: boolean
  pending_order_id: string | null
  provider: string
  revision: string
}
export interface BillingAccount {
  subscription: Subscription | null
  topup_eligible: boolean
  pending_order_id: string | null
  risk_debt_credits: string
  blocked_reason: string | null
}
export interface CreditBalance {
  available_credits: string
  by_kind: Record<string, string>
  grants: {
    id: string
    kind: string
    status: string
    available_credits: string
    expires_at: string | null
  }[]
}
export interface CreditLedgerEntry {
  id: string
  grant_id: string
  charge_id: string | null
  attempt_key: string | null
  action: string
  credits_delta: string
  reserved_delta: string
  balance_after: string
  reserved_after: string
  metadata: Record<string, unknown>
  created_at: string
}
export interface CreditLedgerPage {
  items: CreditLedgerEntry[]
  page: number
  size: number
  total: number
  total_pages: number
}
export interface CreditUsage {
  provider: string | null
  model: string | null
  input_tokens: string
  output_tokens: string
  cached_tokens: string
  cache_write_tokens: string
  complete: boolean
  cost_source: string | null
  price_version: string | null
  settlement_status: string
}
export interface CreditChargeAttempt {
  id: string
  attempt_key: string
  purpose: string | null
  status: string
  budget_credits: string
  settled_credits: string
  cost_usd: string | null
  provider_request_id: string | null
  deadline_at: string | null
  settled_at: string | null
  resolution_reason: string | null
  usage: CreditUsage | null
}
export interface CreditCharge {
  id: string
  run_id: string | null
  status: string
  coefficient: string
  credits_per_usd: string
  pricing_version: string
  total_cost_usd: string
  charged_credits: string
  created_at: string
  finalized_at: string | null
  attempts: CreditChargeAttempt[]
}
export interface PaymentAction {
  payment_id: string
  status: string
  url: string | null
  customer_id: string | null
  subscription_id: string | null
  invoice_id: string | null
  expires_at: string | null
  action_type: string
}
export interface BillingOrder {
  id: string
  kind: string
  plan_code: PlanCode | null
  plan_version: string | null
  amount_usd: string
  currency: string
  credits: string
  payment_status: string
  fulfillment_status: string
  payment_action: PaymentAction | null
  subscription_id: string | null
  created_at: string
  paid_at: string | null
  fulfilled_at: string | null
  provider: string
  refunded_amount_usd: string
}
export interface BillingQuote {
  quote_id: string
  kind: 'topup' | 'upgrade'
  plan_code: PlanCode
  plan_version: string
  amount_usd: string
  currency: string
  credits: string
  expires_at: string
  markup_bps?: string
  monthly_price_cents?: string
  monthly_credits?: string
  rank?: number
  old_plan_code?: PlanCode
  old_monthly_credits_will_expire?: boolean
  reset_billing_cycle?: boolean
  signup_and_topup_preserved?: boolean
}
export interface OrderPage {
  items: BillingOrder[]
  page: number
  size: number
  total: number
  total_pages: number
}
