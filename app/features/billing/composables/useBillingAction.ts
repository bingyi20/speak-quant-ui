import { onBeforeUnmount, onMounted, shallowRef } from 'vue'

export function useBillingAction<T extends string>() {
  const active = shallowRef<T | null>(null)
  const reset = () => {
    active.value = null
  }
  onMounted(() => window.addEventListener('pageshow', reset))
  onBeforeUnmount(() => window.removeEventListener('pageshow', reset))

  async function run(target: T, action: () => Promise<unknown>) {
    if (active.value !== null) return
    active.value = target
    let redirected = false
    try {
      redirected = (await action()) === true
    } finally {
      // Keep the clicked button locked until navigation, and reset on browser Back.
      if (!redirected) reset()
    }
  }
  return { active, run }
}
