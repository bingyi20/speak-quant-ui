import type { Page } from '@playwright/test'

export const billingCatalog = {
  currency: 'USD',
  billing_interval: 'month',
  auto_renew: true,
  plans: [
    {
      code: 'basic',
      version: 'test-server-pricing',
      price_usd: '12.75',
      monthly_credits: '8400',
      rank: 1,
    },
    {
      code: 'pro',
      version: 'test-server-pricing',
      price_usd: '32.50',
      monthly_credits: '31000',
      rank: 2,
    },
    {
      code: 'max',
      version: 'test-server-pricing',
      price_usd: '102.25',
      monthly_credits: '132000',
      rank: 3,
    },
  ],
  signup_credits: '3500',
  recurring_free_credits: '0',
  cost_coefficient: '2.5',
  topup_markup_bps: '2000',
  topup_min_usd: '5.25',
  topup_max_usd: '250.50',
  monthly_credits_rollover: false,
  signup_and_topup_expire: false,
}

export function billingSubscription(planCode = 'basic') {
  const plan = billingCatalog.plans.find((item) => item.code === planCode)!
  return {
    id: '01M4T000000000000000000003',
    plan_code: plan.code,
    plan_version: plan.version,
    status: 'active',
    monthly_price_usd: plan.price_usd,
    monthly_credits: plan.monthly_credits,
    current_period_start: '2026-10-13T08:00:00Z',
    current_period_end: '2099-11-13T08:00:00Z',
    cancel_at_period_end: false,
    auto_renew: true,
    pending_order_id: null as string | null,
    provider: 'stripe',
    revision: '1',
  }
}

export function billingAccount(planCode: string | null = null) {
  return {
    subscription: planCode ? billingSubscription(planCode) : null,
    topup_eligible: !!planCode,
    pending_order_id: null as string | null,
    risk_debt_credits: '0',
    blocked_reason: null as string | null,
  }
}

export function billingBalance(available = '2750') {
  return {
    available_credits: available,
    by_kind: { signup: available },
    grants: [
      {
        id: '01M4T000000000000000000102',
        kind: 'signup',
        status: 'active',
        available_credits: available,
        expires_at: null,
      },
    ],
  }
}

export function billingPaymentAction() {
  return {
    payment_id: 'cs_test_billing_e2e',
    status: 'requires_action',
    url: 'https://checkout.stripe.com/c/pay/cs_test_billing_e2e',
    customer_id: 'cus_test_billing_e2e',
    subscription_id: null as string | null,
    invoice_id: null as string | null,
    expires_at: '2099-10-14T08:00:00',
    action_type: 'redirect',
  }
}

export function billingOrder(kind = 'subscription', planCode = 'basic') {
  const plan = billingCatalog.plans.find((item) => item.code === planCode)!
  return {
    id: '01M4T000000000000000000001',
    kind,
    plan_code: plan.code,
    plan_version: plan.version,
    amount_usd: plan.price_usd,
    currency: 'USD',
    credits: plan.monthly_credits,
    payment_status: 'requires_action',
    fulfillment_status: 'pending',
    payment_action: billingPaymentAction(),
    subscription_id: null as string | null,
    created_at: '2026-10-13T08:00:00Z',
    paid_at: null as string | null,
    fulfilled_at: null as string | null,
    provider: 'stripe',
    refunded_amount_usd: '0',
  }
}

export function billingQuote(kind = 'topup', planCode = 'basic', amount = '10.25') {
  const plan = billingCatalog.plans.find((item) => item.code === planCode)!
  const common = {
    quote_id: '01M4T000000000000000000002',
    kind,
    plan_code: plan.code,
    plan_version: plan.version,
    amount_usd: kind === 'upgrade' ? plan.price_usd : amount,
    currency: 'USD',
    // Deliberately not calculated locally: the UI must display this frozen server result.
    credits: kind === 'upgrade' ? plan.monthly_credits : '6789',
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  }
  return kind === 'upgrade'
    ? {
        ...common,
        rank: plan.rank,
        old_plan_code: 'basic',
        old_monthly_credits_will_expire: true,
        reset_billing_cycle: true,
        signup_and_topup_preserved: true,
      }
    : {
        ...common,
        markup_bps: '2000',
        monthly_price_cents: '1275',
        monthly_credits: plan.monthly_credits,
      }
}

export async function stubBilling(
  page: Page,
  options: { plan?: string | null; available?: string; anonymous?: boolean } = {},
) {
  const state = {
    catalog: structuredClone(billingCatalog),
    account: billingAccount(options.plan),
    balance: billingBalance(options.available),
    order: null as ReturnType<typeof billingOrder> | null,
    quote: null as ReturnType<typeof billingQuote> | null,
    requests: [] as {
      method: string
      path: string
      body: Record<string, string> | null
      key: string | undefined
    }[],
    failNext: new Map<string, number>(),
    loseResponseNext: new Set<string>(),
    immediateFulfillment: false,
  }
  const operations = new Map<string, unknown>()
  const envelope = (data: unknown) => ({ code: 0, message: 'ok', data })
  await page.context().route('https://checkout.stripe.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<title>Mock Stripe Checkout</title>
        <h1>Stripe checkout fixture</h1>
        <a href="http://localhost:6002/billing/payment-return?order_id=${state.order?.id}">Return after payment</a>
        <a href="http://localhost:6002/pricing?payment_cancelled=true&amp;order_id=${state.order?.id}">Back to pricing</a>`,
    }),
  )
  await page.route(/\/api\/(?:billing|credits)\//, async (route) => {
    const request = route.request()
    const method = request.method()
    const path = new URL(request.url()).pathname
    const body = request.postData() ? (request.postDataJSON() as Record<string, string>) : null
    const key = request.headers()['idempotency-key']
    state.requests.push({ method, path, body, key })
    if (options.anonymous && path !== '/api/billing/plans') {
      await route.fulfill({ status: 401, json: { code: 40101, error: { key: 'AUTH_REQUIRED' } } })
      return
    }
    const failures = state.failNext.get(path) ?? 0
    if (failures > 0) {
      state.failNext.set(path, failures - 1)
      await route.fulfill({
        status: 503,
        json: {
          code: 50340,
          message: 'Temporary billing outage',
          data: null,
          error: { key: 'BILLING_NOT_CONFIGURED' },
        },
      })
      return
    }
    if (method === 'POST' && !key) {
      await route.fulfill({
        status: 400,
        json: { code: 40001, error: { key: 'IDEMPOTENCY_KEY_REQUIRED' } },
      })
      return
    }
    if (method === 'POST' && key && operations.has(key)) {
      await route.fulfill({ json: envelope(operations.get(key)) })
      return
    }
    let data: unknown
    if (path === '/api/billing/plans') data = state.catalog
    else if (path === '/api/billing/account') data = state.account
    else if (path === '/api/credits/balance') data = state.balance
    else if (path === '/api/credits/ledger') {
      const query = new URL(request.url()).searchParams
      data = {
        items: [],
        page: Number(query.get('page') ?? 1),
        size: Number(query.get('size') ?? 20),
        total: 0,
        total_pages: 0,
      }
    } else if (path === '/api/billing/orders') {
      data = {
        items: state.order ? [state.order] : [],
        page: 1,
        size: 20,
        total: state.order ? 1 : 0,
        total_pages: state.order ? 1 : 0,
      }
    } else if (path.startsWith('/api/billing/orders/')) {
      if (!state.order || !path.endsWith(state.order.id)) {
        await route.fulfill({
          status: 404,
          json: { code: 40400, data: null, error: { key: 'RESOURCE_NOT_FOUND' } },
        })
        return
      }
      data = state.order
    } else if (path === '/api/billing/topup-quotes') {
      state.quote = billingQuote('topup', state.account.subscription?.plan_code, body?.amount_usd)
      data = state.quote
    } else if (path === '/api/billing/subscription/upgrade-preview') {
      state.quote = billingQuote('upgrade', body?.plan_code)
      data = state.quote
    } else if (
      path === '/api/billing/checkouts/subscription' ||
      path === '/api/billing/checkouts/topup' ||
      path === '/api/billing/subscription/upgrade'
    ) {
      const kind = path.endsWith('subscription')
        ? 'subscription'
        : path.endsWith('topup')
          ? 'topup'
          : 'upgrade'
      state.order = billingOrder(
        kind,
        kind === 'subscription' ? body?.plan_code : state.quote?.plan_code,
      )
      if (kind !== 'subscription' && state.quote) {
        state.order.amount_usd = state.quote.amount_usd
        state.order.credits = state.quote.credits
      }
      if (kind !== 'topup') {
        state.account.pending_order_id = state.order.id
        state.account.topup_eligible = false
      }
      if (state.immediateFulfillment) {
        state.order.payment_status = 'paid'
        state.order.fulfillment_status = 'fulfilled'
        state.order.payment_action.action_type = 'none'
        state.account = billingAccount(state.order.plan_code)
        state.balance = billingBalance(state.order.credits)
      }
      data = state.order
    } else if (
      path === '/api/billing/subscription/cancel' ||
      path === '/api/billing/subscription/resume'
    ) {
      const subscription = state.account.subscription!
      subscription.cancel_at_period_end = path.endsWith('/cancel')
      subscription.auto_renew = !subscription.cancel_at_period_end
      subscription.revision = String(Number(subscription.revision) + 1)
      data = { subscription }
    } else if (path === '/api/billing/portal-sessions') {
      data = {
        payment_action: {
          ...billingPaymentAction(),
          payment_id: 'bps_fixture',
          url: 'https://billing.stripe.com/p/session/fixture',
        },
      }
    } else {
      await route.fulfill({
        status: 404,
        json: { code: 40400, data: null, error: { key: 'RESOURCE_NOT_FOUND' } },
      })
      return
    }
    if (method === 'POST' && key) operations.set(key, structuredClone(data))
    if (state.loseResponseNext.delete(path)) {
      await route.abort('failed')
      return
    }
    await route.fulfill({ json: envelope(data) })
  })
  return state
}
