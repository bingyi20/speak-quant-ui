import type { Page } from '@playwright/test'
import { envelope } from './auth-fixtures'

export function creditLedgerRow(
  action = 'consume',
  overrides: Partial<ReturnType<typeof baseLedgerRow>> = {},
) {
  return { ...baseLedgerRow(), action, ...overrides }
}

function baseLedgerRow() {
  return {
    id: 'ledger-consume',
    grant_id: 'internal-grant-1',
    charge_id: 'charge-pending' as string | null,
    attempt_key: 'internal-attempt-1' as string | null,
    action: 'consume',
    credits_delta: '-37.25',
    reserved_delta: '-37.25',
    balance_after: '2962.75',
    reserved_after: '600',
    metadata: {},
    created_at: '2026-10-13T10:01:00Z',
  }
}

export function creditLedgerPage() {
  const definitions: [string, string, string, string | null][] = [
    ['consume', '-37.25', '-37.25', 'charge-pending'],
    ['signup_bonus', '3000', '0', null],
    ['topup', '6666', '0', null],
    ['subscription_basic', '8000', '0', null],
    ['subscription_pro', '30000', '0', null],
    ['subscription_max', '130000', '0', null],
    ['compensation', '250', '0', null],
    ['grant', '500', '0', null],
    ['release_expired', '-40', '-40', 'charge-released'],
    ['expired', '-500', '0', null],
    ['superseded', '-200', '0', null],
    ['revoke', '-100', '0', null],
    ['restore', '100', '0', null],
  ]
  return Array.from({ length: 20 }, (_, index) => {
    const [action, credits_delta, reserved_delta, charge_id] =
      definitions[index % definitions.length]!
    return creditLedgerRow(action, {
      id: `ledger-${index}`,
      grant_id: `internal-grant-${index}`,
      credits_delta,
      reserved_delta,
      charge_id,
      attempt_key: charge_id ? `internal-attempt-${index}` : null,
      created_at: new Date(Date.UTC(2026, 9, 13, 10, 1, 20 - index)).toISOString(),
    })
  })
}

/** Test-only HTTP boundary; all application reads still go through its API client. */
export async function stubCreditHistory(page: Page) {
  const state = {
    pages: [
      creditLedgerPage(),
      [
        creditLedgerRow('consume', { id: 'ledger-second-page', charge_id: 'charge-second' }),
        creditLedgerRow('grant', {
          id: 'ledger-last',
          charge_id: null,
          credits_delta: '500',
          reserved_delta: '0',
        }),
      ],
    ],
    requests: [] as { method: string; path: string; query: [string, string][] }[],
    ledgerFailures: 0,
    ledgerDelays: new Map<number, Promise<void>>(),
  }
  await page.route(/\/api\/credits\/(?:ledger(?:\?.*)?|charges\/[^/?]+)$/, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    state.requests.push({
      method: request.method(),
      path: url.pathname,
      query: [...url.searchParams.entries()],
    })
    if (request.method() !== 'GET') throw new Error('Credit history must remain read-only')
    if (url.pathname.endsWith('/ledger')) {
      if (state.ledgerFailures-- > 0) {
        await route.fulfill({ status: 503, json: { code: 50300, message: 'Temporary outage' } })
        return
      }
      const pageNumber = Number(url.searchParams.get('page'))
      const items = structuredClone(state.pages[pageNumber - 1] ?? [])
      await state.ledgerDelays.get(pageNumber)
      await route.fulfill({
        json: envelope({
          items,
          page: pageNumber,
          size: Number(url.searchParams.get('size')),
          total: state.pages.reduce((total, items) => total + items.length, 0),
          total_pages: state.pages.length,
        }),
      })
      return
    }
    throw new Error('The simplified credit history must not request charge details')
  })
  return state
}
