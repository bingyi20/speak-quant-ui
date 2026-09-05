import { ApiError, cancellationError } from './error'

/** Instance scoped. Neither token nor refresh promise is serializable application state. */
export function createAuthSession<T>(options: {
  refresh: () => Promise<{ access_token: string; user: T }>
  onUser: (user: T) => void
  onClear: () => void
}) {
  let token: string | null = null
  let pending: Promise<void> | null = null
  let restored = false
  let generation = 0
  function clear() {
    generation++
    token = null
    restored = true
    pending = null
    options.onClear()
  }
  function accept(result: { access_token: string; user: T }) {
    generation++
    pending = null
    token = result.access_token
    restored = true
    options.onUser(result.user)
  }
  async function refresh() {
    if (pending) return pending
    const current = generation
    const job = (async () => {
      try {
        const result = await options.refresh()
        if (current !== generation) throw cancellationError()
        token = result.access_token
        restored = true
        options.onUser(result.user)
      } catch (error) {
        if (current === generation && error instanceof ApiError && error.status === 401) clear()
        throw error
      }
    })()
    pending = job
    try {
      await job
    } finally {
      if (pending === job) pending = null
    }
  }
  return {
    getToken: () => token,
    accept,
    clear,
    refresh,
    async ensureReady() {
      if (!restored) await refresh()
      if (!token)
        throw new ApiError('Authentication required', { status: 401, code: 40100, kind: 'auth' })
    },
    async restore() {
      if (restored) return
      try {
        await refresh()
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error
      }
    },
  }
}
export type AuthSession = Pick<
  ReturnType<typeof createAuthSession>,
  'getToken' | 'ensureReady' | 'refresh' | 'clear'
>
