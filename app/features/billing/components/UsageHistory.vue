<script setup lang="ts">
import Decimal from 'decimal.js'
import { formatQuantity } from '~/lib/format'
import { planName } from '../catalog'
import { useCreditHistory } from '../composables/useCreditHistory'
import { providerDate } from '../payment'
import { useBillingStore } from '../stores/billing'

const { t, locale } = useI18n()
const billing = useBillingStore()
const membership = computed(() => {
  const code = billing.account?.subscription?.plan_code
  return code ? planName(code) : billing.account ? 'Free' : '—'
})
const { ledger, loading, error, loadPage } = useCreditHistory()
const pageTarget = ref<number | null>(null)

const activityKeys: Record<string, string> = {
  signup_bonus: 'signupBonus',
  topup: 'topup',
  subscription_basic: 'subscriptionBasic',
  subscription_pro: 'subscriptionPro',
  subscription_max: 'subscriptionMax',
  compensation: 'compensation',
  grant: 'grant',
  reserve: 'reserve',
  consume: 'consume',
  release: 'release',
  release_expired: 'releaseExpired',
  expired: 'expired',
  superseded: 'superseded',
  revoke: 'revoke',
  restore: 'restore',
}

function activityLabel(action: string) {
  const key = Object.hasOwn(activityKeys, action) ? activityKeys[action] : 'other'
  return t(`settings.usage.activities.${key}`)
}
function creditChange(value: string) {
  try {
    const amount = new Decimal(value)
    if (!amount.isFinite()) return { label: '—', increase: false }
    const increase = amount.gt(0)
    return {
      label: `${increase ? '+' : ''}${formatQuantity(amount.toString(), locale.value)}`,
      increase,
    }
  } catch {
    return { label: '—', increase: false }
  }
}
function timestamp(value: string) {
  const parsed = providerDate(value)
  if (!Number.isFinite(parsed)) return { dateTime: undefined, label: '—' }
  const dateTime = new Date(parsed).toISOString()
  return {
    dateTime,
    label: dateTime.slice(0, 19).replaceAll('-', '.').replace('T', ' '),
  }
}
const entries = computed(() =>
  (ledger.value?.items ?? []).map((item) => ({
    id: item.id,
    activity: activityLabel(item.action),
    timestamp: timestamp(item.created_at),
    change: creditChange(item.credits_delta),
  })),
)
async function changePage(page: number) {
  if (loading.value) return
  pageTarget.value = page
  try {
    await loadPage(page)
  } finally {
    pageTarget.value = null
  }
}
</script>

<template>
  <section
    class="credit-history"
    :aria-busy="loading"
    :aria-label="t('settings.usageTab')"
  >
    <p class="credit-history-summary">
      {{
        t('settings.usage.summary', {
          plan: membership,
          credits: formatQuantity(billing.balance?.available_credits, locale),
        })
      }}
    </p>
    <div
      v-if="error"
      class="credit-history-feedback"
      role="alert"
    >
      <p>{{ error }}</p>
      <button
        type="button"
        class="settings-secondary-button"
        :disabled="loading"
        @click="loadPage()"
      >
        {{ t('common.retry') }}
      </button>
    </div>
    <div
      v-else-if="loading && !ledger"
      class="credit-history-state"
      role="status"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="spin"
        aria-hidden="true"
      />
      {{ t('settings.usage.loading') }}
    </div>
    <div
      v-else-if="ledger && !ledger.items.length"
      class="credit-history-state"
    >
      <p>{{ t('settings.usage.empty') }}</p>
    </div>
    <template v-if="entries.length">
      <ul class="credit-history-list">
        <li
          v-for="entry in entries"
          :key="entry.id"
          class="credit-history-row"
        >
          <div class="credit-history-event">
            <p class="credit-history-activity">{{ entry.activity }}</p>
            <time
              class="credit-history-date"
              :datetime="entry.timestamp.dateTime"
            >
              {{ entry.timestamp.label }}
            </time>
          </div>
          <span
            class="credit-history-number"
            :class="{ 'is-increase': entry.change.increase }"
          >
            {{ entry.change.label }}
          </span>
        </li>
      </ul>
      <nav
        v-if="ledger && ledger.total_pages > 1"
        class="credit-history-pagination"
        :aria-label="t('settings.usage.pagination')"
      >
        <button
          type="button"
          class="settings-secondary-button"
          :disabled="loading || ledger.page <= 1"
          @click="changePage(ledger.page - 1)"
        >
          <UIcon
            v-if="loading && pageTarget === ledger.page - 1"
            name="i-lucide-loader-circle"
            class="spin"
            aria-hidden="true"
          />
          {{ t('settings.usage.previous') }}
        </button>
        <span aria-live="polite">
          {{ t('settings.usage.page', { page: ledger.page, pages: ledger.total_pages }) }}
        </span>
        <button
          type="button"
          class="settings-secondary-button"
          :disabled="loading || ledger.page >= ledger.total_pages"
          @click="changePage(ledger.page + 1)"
        >
          {{ t('settings.usage.next') }}
          <UIcon
            v-if="loading && pageTarget === ledger.page + 1"
            name="i-lucide-loader-circle"
            class="spin"
            aria-hidden="true"
          />
        </button>
      </nav>
    </template>
  </section>
</template>
