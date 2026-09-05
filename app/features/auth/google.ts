export interface GoogleIdentity {
  initialize(config: {
    client_id: string
    nonce: string
    auto_select: false
    use_fedcm_for_button: true
    callback: (response: { credential: string }) => void
  }): void
  renderButton(
    element: HTMLElement,
    config: {
      type: 'standard'
      theme: 'outline'
      size: 'large'
      text: 'continue_with'
      shape: 'rectangular'
      width: number
      locale: string
    },
  ): void
  disableAutoSelect(): void
  cancel(): void
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } }
  }
}
let loading: Promise<GoogleIdentity> | undefined
/** The SDK is shared, while each mounted login flow owns its nonce and callback. */
export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  if (window.google?.accounts.id) return Promise.resolve(window.google.accounts.id)
  if (loading) return loading
  loading = new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    const finish = (error?: Error) => {
      clearTimeout(timer)
      script.onload = null
      script.onerror = null
      if (error) {
        script.remove()
        reject(error)
      } else resolve(window.google!.accounts.id)
    }
    const timer = setTimeout(() => finish(new Error('Google SDK timeout')), 15_000)
    script.onload = () =>
      finish(window.google?.accounts.id ? undefined : new Error('Google SDK unavailable'))
    script.onerror = () => finish(new Error('Google SDK unavailable'))
    document.head.append(script)
  }).catch((error: unknown) => {
    loading = undefined
    throw error
  })
  return loading
}
export function disableGoogleAutoSelect() {
  window.google?.accounts.id.disableAutoSelect()
}
