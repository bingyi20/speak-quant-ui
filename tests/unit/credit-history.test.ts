import { effectScope, reactive, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCreditHistory } from '~/features/billing/composables/useCreditHistory'
import type { CreditLedgerPage } from '~/features/billing/types'

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, user: { id: 'user-a' } as { id: string } | null },
  api: { ledger: vi.fn() },
}))
vi.mock('~/features/auth', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('~/features/billing/api', () => ({ createBillingApi: () => mocks.api }))

const scopes: EffectScope[] = []
function setup() {
  const scope = effectScope()
  scopes.push(scope)
  return { scope, history: scope.run(useCreditHistory)! }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { resolve, reject, promise }
}
function ledger(id: string, page = 1): CreditLedgerPage {
  return {
    page,
    size: 20,
    total: 1,
    total_pages: 1,
    items: [
      {
        id,
        grant_id: 'grant',
        charge_id: 'charge',
        attempt_key: null,
        action: 'consume',
        credits_delta: '-10',
        reserved_delta: '-10',
        balance_after: '100',
        reserved_after: '0',
        metadata: {},
        created_at: '2026-10-13T10:00:00Z',
      },
    ],
  }
}
beforeEach(() => {
  mocks.auth = reactive({ isAuthenticated: true, user: { id: 'user-a' } })
  mocks.api.ledger.mockReset().mockResolvedValue(ledger('current-owner'))
  vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
  vi.stubGlobal('useNuxtApp', () => ({ $http: {} }))
})
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.unstubAllGlobals()
})

describe('credit history private request lifecycle', () => {
  it('discards a previous owner ledger response even if transport ignores cancellation', async () => {
    const oldOwner = deferred<CreditLedgerPage>()
    const nextOwner = deferred<CreditLedgerPage>()
    mocks.api.ledger
      .mockReset()
      .mockReturnValueOnce(oldOwner.promise)
      .mockReturnValueOnce(nextOwner.promise)
    const { history } = setup()
    const oldSignal = mocks.api.ledger.mock.calls[0]![2] as AbortSignal
    mocks.auth.user = { id: 'user-b' }
    expect(oldSignal.aborted).toBe(true)
    nextOwner.resolve(ledger('user-b-private-row'))
    await nextOwner.promise
    expect(history.ledger.value?.items[0]?.id).toBe('user-b-private-row')
    oldOwner.resolve(ledger('user-a-private-row'))
    await oldOwner.promise
    expect(history.ledger.value?.items[0]?.id).toBe('user-b-private-row')
    expect(history.error.value).toBeNull()
  })

  it('keeps the newest ledger page when an earlier request completes late', async () => {
    const oldPage = deferred<CreditLedgerPage>()
    const nextPage = deferred<CreditLedgerPage>()
    mocks.api.ledger.mockReturnValueOnce(oldPage.promise).mockReturnValueOnce(nextPage.promise)
    const { history } = setup()
    const oldSignal = mocks.api.ledger.mock.calls[0]![2] as AbortSignal
    const nextRequest = history.loadPage(2)
    expect(oldSignal.aborted).toBe(true)
    nextPage.resolve(ledger('page-two', 2))
    await nextRequest
    oldPage.resolve(ledger('page-one'))
    await oldPage.promise
    expect(history.ledger.value?.page).toBe(2)
    expect(history.ledger.value?.items[0]?.id).toBe('page-two')
    expect(history.error.value).toBeNull()
    expect(history.loading.value).toBe(false)
  })

  it('clears private rows on logout and rejects late ledger errors from the former owner', async () => {
    const { history } = setup()
    await Promise.resolve()
    expect(history.ledger.value).not.toBeNull()
    const pending = deferred<CreditLedgerPage>()
    mocks.api.ledger.mockReturnValue(pending.promise)
    const request = history.loadPage(2)
    const signal = mocks.api.ledger.mock.calls[1]![2] as AbortSignal
    mocks.auth.isAuthenticated = false
    mocks.auth.user = null
    expect(signal.aborted).toBe(true)
    expect(history.ledger.value).toBeNull()
    pending.reject(new Error('late response for former owner'))
    await request
    expect(history.error.value).toBeNull()
    expect(history.loading.value).toBe(false)
    expect(mocks.api.ledger).toHaveBeenCalledTimes(2)
  })

  it('aborts and forgets all private data when the panel scope is disposed', async () => {
    const pendingLedger = deferred<CreditLedgerPage>()
    mocks.api.ledger.mockReturnValue(pendingLedger.promise)
    const { history, scope } = setup()
    const ledgerSignal = mocks.api.ledger.mock.calls[0]![2] as AbortSignal
    scope.stop()
    expect(ledgerSignal.aborted).toBe(true)
    pendingLedger.resolve(ledger('disposed-owner'))
    await pendingLedger.promise
    expect(history.ledger.value).toBeNull()
    expect(history.loading.value).toBe(false)
  })

  it('retries a failed page without replacing existing rows or requesting details', async () => {
    const { history } = setup()
    await Promise.resolve()
    mocks.api.ledger
      .mockRejectedValueOnce(new Error('Temporary outage'))
      .mockResolvedValueOnce(ledger('page-two', 2))
    await history.loadPage(2)
    expect(history.error.value).toBe('settings.usageLoadError')
    expect(history.ledger.value?.items[0]?.id).toBe('current-owner')
    await history.loadPage()
    expect(history.ledger.value?.items[0]?.id).toBe('page-two')
    expect(history.error.value).toBeNull()
    expect(mocks.api.ledger).toHaveBeenCalledTimes(3)
    expect(mocks.api.ledger.mock.calls[2]!.slice(0, 2)).toEqual([2, 20])
  })
})
