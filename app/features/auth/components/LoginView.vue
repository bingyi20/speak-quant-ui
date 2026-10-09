<script setup lang="ts">
import { useLogin } from '../composables/useLogin'
import VerificationCode from './VerificationCode.vue'
import TransientNotice from '~/components/ui/TransientNotice.vue'
const {
  step,
  email,
  sentEmail,
  code,
  pending,
  error,
  bindingGoogle,
  blocked,
  resendIn,
  expired,
  restoring,
  enabled,
  sendCode,
  verify,
  back,
} = useLogin()
const googleNotice = useTemplateRef('googleNotice')
const config = useRuntimeConfig()
const localePath = useLocalePath()
const emailInput = useTemplateRef<HTMLInputElement>('emailInput')
watch(step, (value) => {
  if (value === 'entry') nextTick(() => emailInput.value?.focus())
})
</script>
<template>
  <div class="login-page">
    <TransientNotice
      ref="googleNotice"
      :message="$t('auth.googleSoon')"
    />
    <div class="auth-back-slot">
      <button
        v-if="step === 'code'"
        type="button"
        class="text-button"
        @click="back"
      >
        <UIcon name="i-lucide-chevron-left" />{{ $t('auth.back') }}
      </button>
    </div>
    <section
      class="login-card"
      :aria-busy="pending || restoring"
    >
      <header class="login-intro">
        <NuxtLink
          :to="localePath('/')"
          class="login-brand"
          :aria-label="`SpeakQuant · ${$t('nav.home')}`"
        >
          <CommonBrandMark />
        </NuxtLink>
        <template v-if="step === 'entry'">
          <h1>{{ $t('auth.title') }}</h1>
          <p class="login-subtitle">{{ $t('auth.subtitle') }}</p>
        </template>
        <template v-else>
          <h1>{{ $t('auth.codeTitle') }}</h1>
          <p class="login-subtitle">
            {{ $t(bindingGoogle ? 'auth.bindSubtitle' : 'auth.codeSubtitle') }}
          </p>
          <p class="login-email">{{ sentEmail }}</p>
        </template>
      </header>
      <div
        v-show="step === 'entry'"
        class="login-entry"
      >
        <div
          :inert="pending || restoring"
          :aria-disabled="pending || restoring"
        >
          <button
            type="button"
            class="google-placeholder"
            :aria-description="$t('auth.googleSoon')"
            @click="googleNotice?.show()"
          >
            {{ $t('auth.google') }}
          </button>
        </div>
        <div class="login-divider">
          <span>{{ $t('auth.or') }}</span>
        </div>
        <form @submit.prevent="sendCode">
          <label
            class="sr-only"
            for="login-email"
            >{{ $t('auth.email') }}</label
          >
          <input
            id="login-email"
            ref="emailInput"
            v-model="email"
            type="email"
            autocomplete="email"
            inputmode="email"
            autocapitalize="none"
            spellcheck="false"
            required
            maxlength="320"
            :placeholder="$t('auth.emailPlaceholder')"
            :disabled="pending || restoring"
            :aria-invalid="!!error || undefined"
            aria-describedby="login-error"
          />
          <button
            class="primary-button"
            :disabled="pending || restoring || !email.trim()"
          >
            <UIcon
              v-if="pending"
              class="login-spinner"
              name="i-lucide-loader-circle"
            />
            {{ $t(pending ? 'auth.sending' : restoring ? 'auth.restoring' : 'auth.continue') }}
          </button>
        </form>
      </div>
      <form
        v-if="step === 'code'"
        class="login-verification"
        @submit.prevent="verify"
      >
        <VerificationCode
          v-model="code"
          :disabled="pending || expired || blocked"
          :invalid="!!error"
          @complete="verify"
        />
        <p
          id="code-help"
          class="sr-only"
        >
          {{ $t('auth.codeHelp') }}
        </p>
        <button
          class="primary-button"
          :disabled="pending || code.length !== 6 || expired || blocked"
        >
          <UIcon
            v-if="pending"
            class="login-spinner"
            name="i-lucide-loader-circle"
          />
          {{ $t(pending ? 'auth.verifying' : 'auth.verify') }}
        </button>
        <div class="login-resend">
          <p>
            {{ $t('auth.noEmail') }}
            <button
              type="button"
              class="text-button"
              :disabled="pending || resendIn > 0"
              @click="sendCode"
            >
              {{ $t('auth.resend') }}<span v-if="resendIn > 0"> ({{ resendIn }}s)</span>
            </button>
          </p>
          <p>{{ $t(expired || blocked ? 'auth.requestNewCode' : 'auth.spamHint') }}</p>
        </div>
      </form>
      <p
        id="login-error"
        role="alert"
        class="login-error"
      >
        {{ error }}
      </p>
      <p class="login-legal">
        {{ $t('auth.consent') }}
        <a
          :href="config.public.termsUrl || localePath('/terms')"
          target="_blank"
          rel="noopener noreferrer"
          >{{ $t('auth.terms') }}</a
        >
        {{ $t('auth.privacyAcknowledgement') }}
        <a
          :href="config.public.privacyUrl || localePath('/privacy')"
          target="_blank"
          rel="noopener noreferrer"
          >{{ $t('auth.privacy') }}</a
        >
      </p>
      <NuxtLink
        v-if="!enabled"
        to="/new-task"
        class="text-button"
        >{{ $t('auth.scaffoldLink') }}</NuxtLink
      >
    </section>
  </div>
</template>
