import { onBeforeRouteLeave } from 'vue-router'
import { transferGuestSubmission, cancelGuestSubmission } from '~/features/conversation'
import { createAuthApi } from '../api'
import type { AuthResponse, EmailChallenge } from '../types'
import { useAuthStore } from '../stores/auth'
import { ApiError } from '~/lib/http/error'
import { readStorage, safeReturnPath, writeStorage } from '~/lib/storage/safe-storage'

export function useLogin() {
  const api = createAuthApi(useApi())
  const { $acceptAuth } = useNuxtApp()
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()
  const { t } = useI18n()
  const enabled = String(useRuntimeConfig().public.apiEnabled) === 'true'
  const step = ref<'entry' | 'code'>('entry')
  const email = ref('')
  const sentEmail = ref('')
  const code = ref('')
  const pending = ref(false)
  const errorKey = ref('')
  const error = computed(() => (errorKey.value ? t(`auth.errors.${errorKey.value}`) : ''))
  const googleRevision = ref(0)
  const bindingGoogle = ref(false)
  const blocked = ref(false)
  const now = ref(Date.now())
  const resendAt = ref(0)
  const expiresAt = ref(0)
  const resendIn = computed(() => Math.max(0, Math.ceil((resendAt.value - now.value) / 1000)))
  const expired = computed(() => step.value === 'code' && now.value >= expiresAt.value)
  const restoring = computed(() => ['unknown', 'restoring'].includes(auth.status))
  let challenge: EmailChallenge | undefined
  let credential = ''
  let controller = new AbortController()
  let alive = true
  let completed = false
  let timer: ReturnType<typeof setInterval> | undefined
  const errorKeys: Record<string, string> = {
    EMAIL_CODE_INVALID: 'invalidCode',
    EMAIL_CODE_EXPIRED: 'expiredCode',
    EMAIL_CODE_ATTEMPTS_EXCEEDED: 'attempts',
    AUTH_SESSION_REVOKED: 'disabled',
    GOOGLE_CREDENTIAL_INVALID: 'googleExpired',
    GOOGLE_LOGIN_CHALLENGE_INVALID: 'googleExpired',
    AUTH_CONFLICT: 'conflict',
    FORBIDDEN: 'googleUnavailable',
    VALIDATION_ERROR: 'validation',
  }
  function report(cause: unknown) {
    if (cause instanceof ApiError) {
      if (cause.kind === 'cancelled') return
      errorKey.value =
        errorKeys[cause.key ?? ''] ??
        (cause.status === 429
          ? 'rateLimit'
          : cause.status === 503
            ? 'unavailable'
            : ['network', 'timeout'].includes(cause.kind)
              ? 'network'
              : 'generic')
      if (cause.key === 'EMAIL_CODE_ATTEMPTS_EXCEEDED') blocked.value = true
      if (cause.key === 'EMAIL_CODE_EXPIRED') expiresAt.value = 0
      if (cause.key === 'EMAIL_CODE_INVALID') code.value = ''
      if (
        ['GOOGLE_CREDENTIAL_INVALID', 'GOOGLE_LOGIN_CHALLENGE_INVALID'].includes(cause.key ?? '')
      ) {
        credential = ''
        bindingGoogle.value = false
        step.value = 'entry'
        code.value = ''
        googleRevision.value++
      }
    } else errorKey.value = 'generic'
  }
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (pending.value || restoring.value || completed) return
    if (!enabled) {
      errorKey.value = 'notEnabled'
      return
    }
    pending.value = true
    errorKey.value = ''
    const signal = controller.signal
    try {
      await action(signal)
    } catch (cause) {
      if (!signal.aborted && alive) report(cause)
    } finally {
      if (!signal.aborted && alive) pending.value = false
    }
  }
  function useChallenge(result: EmailChallenge, address: string) {
    challenge = result
    sentEmail.value = address
    now.value = Date.now()
    resendAt.value = now.value + result.resend_after * 1000
    expiresAt.value = now.value + result.expires_in * 1000
    blocked.value = false
    code.value = ''
    step.value = 'code'
  }
  async function finish(result: AuthResponse, signal: AbortSignal) {
    if (signal.aborted || !alive) return
    completed = true
    // Carry the visitor's draft into their account before the workspace mounts.
    try {
      const draft = readStorage(
        sessionStorage,
        'trade-research-draft:anonymous',
        (v): v is string => typeof v === 'string',
      )
      if (draft) {
        writeStorage(sessionStorage, `trade-research-draft:${result.user.id}`, draft)
        writeStorage(sessionStorage, 'trade-research-draft:anonymous', null)
      }
    } catch {
      /* Browser storage is optional; it must never prevent sign-in. */
    }
    transferGuestSubmission(result.user.id)
    credential = ''
    code.value = ''
    $acceptAuth(result)
    await router.replace(safeReturnPath(route.query.returnTo))
  }
  function sendCode() {
    return run(async (signal) => {
      const address = step.value === 'code' ? sentEmail.value : email.value.trim().toLowerCase()
      if (step.value === 'code' && resendIn.value > 0) return
      const result = await api.sendEmailCode(address, signal)
      if (!signal.aborted) useChallenge(result, address)
    })
  }
  function verify() {
    if (!challenge || !/^\d{6}$/.test(code.value) || expired.value || blocked.value) return
    return run(async (signal) => {
      const verification_id = challenge!.verification_id
      const result = bindingGoogle.value
        ? await api.googleLogin({ credential, verification_id, code: code.value }, signal)
        : await api.verifyEmail(verification_id, code.value, signal)
      await finish(result, signal)
    })
  }
  function googleLogin(value: string) {
    if (step.value !== 'entry') return
    return run(async (signal) => {
      credential = value
      try {
        await finish(await api.googleLogin({ credential }, signal), signal)
      } catch (cause) {
        if (signal.aborted) return
        if (!(cause instanceof ApiError) || cause.key !== 'GOOGLE_EMAIL_VERIFICATION_REQUIRED')
          throw cause
        const data = cause.data as { email?: unknown } | undefined
        if (typeof data?.email !== 'string') throw cause
        bindingGoogle.value = true
        sentEmail.value = data.email
        email.value = data.email
        // Keep the Google credential in this closure until mailbox ownership is verified.
        step.value = 'code'
        challenge = undefined
        expiresAt.value = 0
        resendAt.value = 0
        useChallenge(await api.sendEmailCode(data.email, signal), data.email)
      }
    })
  }
  function back() {
    controller.abort()
    controller = new AbortController()
    pending.value = false
    if (bindingGoogle.value) googleRevision.value++
    credential = ''
    challenge = undefined
    bindingGoogle.value = false
    code.value = ''
    errorKey.value = ''
    blocked.value = false
    step.value = 'entry'
  }
  onMounted(() => {
    timer = setInterval(() => {
      now.value = Date.now()
    }, 500)
    watch(
      () => auth.isAuthenticated,
      (loggedIn) => {
        if (loggedIn && !completed) void router.replace(safeReturnPath(route.query.returnTo))
      },
      { immediate: true },
    )
  })
  onBeforeRouteLeave(() => {
    if (!completed && !auth.isAuthenticated) cancelGuestSubmission()
  })
  onBeforeUnmount(() => {
    alive = false
    controller.abort()
    credential = ''
    clearInterval(timer)
  })
  return {
    step,
    email,
    sentEmail,
    code,
    pending,
    error,
    googleRevision,
    bindingGoogle,
    blocked,
    resendIn,
    expired,
    restoring,
    enabled,
    sendCode,
    verify,
    googleLogin,
    back,
  }
}
