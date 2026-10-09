export function usePublicContact() {
  const config = useRuntimeConfig()
  const operator = computed(() => config.public.operatorName.trim())
  const registrationNumber = computed(() => config.public.operatorRegistrationNumber.trim())
  const registeredAddress = computed(() => config.public.operatorRegisteredAddress.trim())
  const email = computed(() => {
    const value = config.public.supportEmail.trim()
    return /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(value) ? value : ''
  })
  const incomplete = computed(() => !operator.value || !email.value)
  return { operator, registrationNumber, registeredAddress, email, incomplete }
}
