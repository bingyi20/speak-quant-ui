import { describe, expect, it, vi } from 'vitest'
import { validateTopUpAmount } from '~/features/billing/catalog'
import { createBillingApi } from '~/features/billing/api'
import {
  clearPaymentReturn,
  readPaymentReturn,
  savePaymentReturn,
  type PaymentReturnContext,
} from '~/features/billing/return-context'
import {
  isOrderSettled,
  isOrderTerminal,
  paymentUrl,
  providerDate,
} from '~/features/billing/payment'
import { createHttpClient } from '~/lib/http/client'
import type { BillingOrder, PaymentAction } from '~/features/billing/types'

function order(payment = 'requires_action', fulfillment = 'pending') {
  return { payment_status: payment, fulfillment_status: fulfillment } as BillingOrder
}
function action(patch: Partial<PaymentAction> = {}): PaymentAction {
  return {
    payment_id: 'cs_provider_reference',
    status: 'requires_action',
    url: 'https://checkout.stripe.com/c/pay/cs_provider_reference',
    customer_id: null,
    subscription_id: null,
    invoice_id: null,
    expires_at: null,
    action_type: 'redirect',
    ...patch,
  }
}

describe('USD input with a $5 minimum and no upper limit', () => {
  it.each([
    '5',
    '5.00',
    '5.24',
    '5.25',
    '10.25',
    '20',
    '20.0',
    '20.00',
    '250.50',
    '250.51',
    '500',
    '1000.25',
    '999999999999999999',
  ])('accepts valid amounts at or above the minimum: %s', (input) => {
    expect(validateTopUpAmount(input)).toBeTruthy()
  })
  it.each(['', ' ', '0', '-20', '4.99', '20.123', '1e2', 'Infinity', 'NaN', 'abc', '$100'])(
    'rejects invalid input or amounts below $5: %s',
    (input) => {
      expect(validateTopUpAmount(input)).toBeFalsy()
    },
  )
  it('preserves cents without rounding, including amounts above the former upper limit', () => {
    expect(validateTopUpAmount('5')).toBe('5.00')
    expect(validateTopUpAmount('1000.25')).toBe('1000.25')
    expect(validateTopUpAmount('999999999999999999.99')).toBe('999999999999999999.99')
  })
})

describe('authoritative payment and fulfillment states', () => {
  it('requires both confirmed payment and fulfilled entitlements', () => {
    expect(isOrderSettled(order('paid', 'fulfilled'))).toBe(true)
    for (const pending of [
      order('paid'),
      order('processing'),
      order('unknown'),
      order('requires_action'),
    ]) {
      expect(isOrderSettled(pending)).toBe(false)
      expect(isOrderTerminal(pending)).toBe(false)
    }
  })
  it.each(['failed', 'expired', 'canceled', 'refunded', 'partially_refunded', 'disputed'])(
    'ends return confirmation for %s without declaring new credit success',
    (status) => {
      const historical = order(status, 'fulfilled')
      expect(isOrderSettled(historical)).toBe(false)
      expect(isOrderTerminal(historical)).toBe(true)
    },
  )
  it.each(['closed', 'superseded'])(
    'ends return confirmation for %s fulfillment without declaring credit success',
    (fulfillment) => {
      expect(isOrderSettled(order('paid', fulfillment))).toBe(false)
      expect(isOrderTerminal(order('paid', fulfillment))).toBe(true)
    },
  )
})

describe('provider payment actions', () => {
  it('treats no-offset provider expiry timestamps as UTC', () => {
    expect(providerDate('2026-10-14T08:00:00')).toBe(Date.parse('2026-10-14T08:00:00Z'))
    expect(providerDate('2026-10-14T08:00:00+08:00')).toBe(Date.parse('2026-10-14T00:00:00Z'))
  })
  it('accepts only valid, unexpired redirect actions', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-14T08:00:00Z'))
    expect(paymentUrl(action({ expires_at: '2026-10-14T08:00:01' }))).toContain(
      'https://checkout.stripe.com/',
    )
    expect(paymentUrl(action({ expires_at: '2026-10-14T08:00:00' }))).toBeNull()
    expect(paymentUrl(action({ action_type: 'none' }))).toBeNull()
    expect(paymentUrl(action({ url: null }))).toBeNull()
    expect(paymentUrl(null)).toBeNull()
    for (const url of [
      'javascript:alert(1)',
      'http://checkout.stripe.com/',
      'https://user:secret@checkout.stripe.com/',
      '/relative',
    ]) {
      expect(paymentUrl(action({ url }))).toBeNull()
    }
  })
})

it('billing transport reads public catalog without auth and uses the exact account, credit and order paths', async () => {
  const calls: { url: string; headers: Headers }[] = []
  const session = {
    ensureReady: vi.fn().mockResolvedValue(undefined),
    getToken: () => 'memory-only-test-access',
    refresh: vi.fn(),
    clear: vi.fn(),
  }
  const fetch = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(options?.headers) })
    return new Response(JSON.stringify({ code: 0, data: {} }), { status: 200 })
  }) as typeof globalThis.fetch
  const api = createBillingApi(
    createHttpClient({ baseURL: 'http://localhost:6001/api', fetch, session }),
  )
  await api.plans()
  await api.account()
  await api.balance()
  await api.ledger(2, 20)
  await api.charge('01M4T000000000000000000105')
  await api.order('01M4T000000000000000000001')
  await api.orders()
  expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
    '/api/billing/plans',
    '/api/billing/account',
    '/api/credits/balance',
    '/api/credits/ledger',
    '/api/credits/charges/01M4T000000000000000000105',
    '/api/billing/orders/01M4T000000000000000000001',
    '/api/billing/orders',
  ])
  expect(calls[0]!.headers.has('Authorization')).toBe(false)
  expect(calls[1]!.headers.get('Authorization')).toBe('Bearer memory-only-test-access')
  expect(new URL(calls[3]!.url).searchParams.get('page')).toBe('2')
  expect(new URL(calls[3]!.url).searchParams.get('size')).toBe('20')
  expect(calls[3]!.headers.get('Authorization')).toBe('Bearer memory-only-test-access')
  expect(calls[4]!.headers.get('Authorization')).toBe('Bearer memory-only-test-access')
  expect(new URL(calls[6]!.url).searchParams.get('page')).toBe('1')
  expect(new URL(calls[6]!.url).searchParams.get('size')).toBe('20')
})

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
  }
}

it('top-up previews send the exact USD amount and a quote key without creating checkout', async () => {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ code: 0, data: { kind: 'topup', credits: '6789' } }), {
        status: 200,
      }),
  ) as unknown as typeof globalThis.fetch
  const session = {
    ensureReady: vi.fn().mockResolvedValue(undefined),
    getToken: () => 'memory-only-test-access',
    refresh: vi.fn(),
    clear: vi.fn(),
  }
  const api = createBillingApi(
    createHttpClient({ baseURL: 'http://localhost:6001/api', fetch, session }),
  )
  const result = await api.topUpQuote('10.25', 'topup-preview-key')
  expect(result.credits).toBe('6789')
  expect(fetch).toHaveBeenCalledTimes(1)
  const [url, options] = vi.mocked(fetch).mock.calls[0]!
  expect(String(url)).toBe('http://localhost:6001/api/billing/topup-quotes')
  expect(options?.method).toBe('POST')
  expect(JSON.parse(options!.body as string)).toEqual({ amount_usd: '10.25' })
  const headers = new Headers(options?.headers)
  expect(headers.get('Idempotency-Key')).toBe('topup-preview-key')
  expect(headers.get('Authorization')).toBe('Bearer memory-only-test-access')
})

const returnContext: PaymentReturnContext = {
  owner: 'test-user',
  orderId: 'test-order',
  path: '/zh-CN/pricing?source=account#credits',
}

describe('same-tab payment return context', () => {
  it('restores only the same user and order, preserving the original URL', () => {
    const storage = memoryStorage()
    savePaymentReturn(storage, returnContext)
    expect(readPaymentReturn(storage, 'test-user', 'test-order')).toEqual(returnContext)
    expect(readPaymentReturn(storage, 'test-user', 'another-order')).toBeNull()
    expect(readPaymentReturn(storage, 'another-user', 'test-order')).toBeNull()
    storage.setItem('speakquant-payment-return:another-user', JSON.stringify(returnContext))
    expect(readPaymentReturn(storage, 'another-user', 'test-order')).toBeNull()
  })

  it.each([
    'https://attacker.example/checkout',
    '//attacker.example/checkout',
    '/billing/payment-return?order_id=test-order',
    '/login?returnTo=/pricing',
    '/pricing\\outside',
    '/pricing\n',
  ])('rejects an unsafe or recursive return route: %s', (path) => {
    const storage = memoryStorage()
    savePaymentReturn(storage, { ...returnContext, path })
    expect(readPaymentReturn(storage, returnContext.owner, returnContext.orderId)).toBeNull()
  })

  it('ignores legacy dialog, settings and selected-tab state', () => {
    const storage = memoryStorage()
    storage.setItem(
      `speakquant-payment-return:${returnContext.owner}`,
      JSON.stringify({
        ...returnContext,
        tab: 'credits',
        settings: true,
        createdAt: Date.now(),
      }),
    )
    expect(readPaymentReturn(storage, returnContext.owner, returnContext.orderId)).toEqual(
      returnContext,
    )
  })

  it('clears payment context without clearing drafts or another user context', () => {
    const storage = memoryStorage()
    storage.setItem('trade-research-draft:test-user', 'preserved research draft')
    savePaymentReturn(storage, returnContext)
    savePaymentReturn(storage, { ...returnContext, owner: 'another-user' })
    clearPaymentReturn(storage, returnContext.owner)
    expect(readPaymentReturn(storage, returnContext.owner, returnContext.orderId)).toBeNull()
    expect(readPaymentReturn(storage, 'another-user', returnContext.orderId)).toBeTruthy()
    expect(storage.getItem('trade-research-draft:test-user')).toBe('preserved research draft')
  })

  it('ignores malformed storage instead of treating it as a payment result', () => {
    const storage = memoryStorage()
    const key = `speakquant-payment-return:${returnContext.owner}`
    for (const value of [
      'broken json',
      'null',
      '{}',
      JSON.stringify({ ...returnContext, path: null }),
      JSON.stringify({ ...returnContext, owner: null }),
      JSON.stringify({ ...returnContext, orderId: null }),
    ]) {
      storage.setItem(key, value)
      expect(readPaymentReturn(storage, returnContext.owner, returnContext.orderId)).toBeNull()
    }
  })
})
