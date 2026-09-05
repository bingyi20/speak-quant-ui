<script setup lang="ts">
import { useAuthStore } from '../stores/auth'
const auth = useAuthStore()
const { $restoreAuth } = useNuxtApp()
const email = ref('')
const scaffold = String(useRuntimeConfig().public.apiEnabled) !== 'true'
</script>
<template>
  <section class="login-card">
    <CommonBrandMark :wordmark="false" />
    <h1>{{ $t('auth.title') }}</h1>
    <p>{{ $t('auth.subtitle') }}</p>
    <div
      v-if="auth.status === 'unavailable'"
      role="alert"
      class="inline-notice"
    >
      {{ $t('auth.restoreError')
      }}<button
        class="text-button"
        @click="$restoreAuth()"
      >
        {{ $t('common.retry') }}
      </button>
    </div>
    <form @submit.prevent>
      <label for="email">{{ $t('auth.email') }}</label
      ><input
        id="email"
        v-model="email"
        type="email"
        autocomplete="email"
        :placeholder="$t('auth.emailPlaceholder')"
      /><button
        class="primary-button"
        disabled
      >
        {{ $t('auth.continue') }}</button
      ><span class="login-divider">{{ $t('auth.or') }}</span
      ><button
        type="button"
        class="outline-button"
        disabled
      >
        {{ $t('auth.google') }}
      </button>
    </form>
    <p class="preview-label">{{ $t('auth.notice') }}</p>
    <NuxtLink
      v-if="scaffold"
      to="/new-task"
      class="text-button"
      >{{ $t('auth.scaffoldLink') }}<UIcon name="i-lucide-arrow-right"
    /></NuxtLink>
  </section>
</template>
