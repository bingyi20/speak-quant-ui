import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { User } from '../types'
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const status = ref<'unknown' | 'restoring' | 'authenticated' | 'anonymous' | 'unavailable'>(
    'unknown',
  )
  const isAuthenticated = computed(() => status.value === 'authenticated')
  function setUser(value: User) {
    user.value = value
    status.value = 'authenticated'
  }
  function clear() {
    user.value = null
    status.value = 'anonymous'
  }
  return { user, status, isAuthenticated, setUser, clear }
})
