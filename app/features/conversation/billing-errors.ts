/** Billing failures are identified by stable API keys, never provider or translated messages. */
export function conversationBillingError(key?: string | null): string | null {
  switch (key) {
    case 'CREDITS_INSUFFICIENT':
      return 'chat.creditsInsufficient'
    case 'CREDITS_RISK_BLOCKED':
      return 'chat.creditsRiskBlocked'
    case 'BILLING_RECONCILIATION_PENDING':
      return 'chat.billingReconciliationPending'
    case 'LLM_PRICE_NOT_CONFIGURED':
      return 'chat.llmPriceNotConfigured'
    default:
      return null
  }
}
