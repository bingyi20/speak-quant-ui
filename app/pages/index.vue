<script setup lang="ts">
import { ResearchEntry } from '~/features/conversation'
definePageMeta({ layout: 'public' })
const { t } = useI18n()
const examples = computed(() =>
  [1, 2, 3, 4].map((n) => ({ label: t(`landing.example${n}`), prompt: t(`landing.prompt${n}`) })),
)
const ideaSeed = ref<HTMLElement>()
const ideaVisible = ref(false)
let ideaObserver: IntersectionObserver | undefined
onMounted(() => {
  if (!ideaSeed.value) return
  ideaObserver = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting) return
      ideaVisible.value = true
      ideaObserver?.disconnect()
    },
    { threshold: 1 },
  )
  ideaObserver.observe(ideaSeed.value)
})
onBeforeUnmount(() => ideaObserver?.disconnect())
usePageSeo(
  () => `SpeakQuant — ${t('landing.title1')} ${t('landing.title2')}${t('landing.period')}`,
  () => t('landing.subtitle'),
  true,
)
</script>
<template>
  <div>
    <section class="landing-hero">
      <h1>
        {{ $t('landing.title1') }}<br />{{ $t('landing.title2')
        }}<span class="gold-period">{{ $t('landing.period') }}</span>
      </h1>
      <p class="hero-description">{{ $t('landing.subtitle') }}</p>
      <ResearchEntry
        :placeholder="$t('landing.placeholder')"
        :examples="examples"
      />
    </section>
    <section
      id="method"
      class="landing-process"
      aria-labelledby="process-title"
    >
      <header class="process-heading">
        <h2 id="process-title">{{ $t('landing.methodTitle') }}</h2>
        <p>{{ $t('landing.methodIntro') }}</p>
      </header>
      <div class="process-cycle">
        <p
          ref="ideaSeed"
          class="process-hypothesis"
          :class="{ 'is-visible': ideaVisible }"
        >
          <span
            class="process-idea-spark"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
            >
              <path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z" />
            </svg>
          </span>
          {{ $t('landing.hypothesis') }}
        </p>
        <div class="process-loop">
          <ol
            class="process-steps"
            role="list"
          >
            <li
              v-for="n in 3"
              :key="n"
            >
              <div class="process-visual">
                <span class="process-stage">{{ $t(`landing.stage${n}`) }}</span>
                <div
                  class="process-illustration"
                  aria-hidden="true"
                >
                  <svg
                    v-if="n === 1"
                    viewBox="0 0 200 120"
                    fill="none"
                  >
                    <!-- A market idea becomes explicit entry and exit branches. -->
                    <path
                      class="process-line"
                      d="M17 31h54a8 8 0 0 1 8 8v34a8 8 0 0 1-8 8H47L33 92V81H17a8 8 0 0 1-8-8V39a8 8 0 0 1 8-8Z"
                    />
                    <path
                      class="process-soft-line"
                      d="M20 57h47"
                    />
                    <path
                      class="process-accent"
                      d="m20 69 11-4 10 3 11-17 15-6"
                    />
                    <path
                      class="process-line"
                      d="M80 56h15m-4-4 4 4-4 4"
                    />
                    <path
                      class="process-accent"
                      d="m89 24 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"
                    />
                    <path
                      class="process-soft-line"
                      d="M110 56V30h16M110 56v32h16M151 30h15M151 88h15"
                    />
                    <path
                      class="process-line"
                      d="m110 46 10 10-10 10-10-10ZM127 30l12-12 12 12-12 12ZM127 88l12-12 12 12-12 12Z"
                    />
                    <path
                      class="process-accent"
                      d="M139 35V25m-3 3 3-3 3 3M139 83v10m-3-3 3 3 3-3"
                    />
                    <rect
                      class="process-trade-tag"
                      x="167"
                      y="19"
                      width="25"
                      height="22"
                      rx="5"
                    />
                    <rect
                      class="process-trade-tag"
                      x="167"
                      y="77"
                      width="25"
                      height="22"
                      rx="5"
                    />
                    <text
                      class="process-tag-letter"
                      x="179.5"
                      y="30"
                    >
                      B
                    </text>
                    <text
                      class="process-tag-letter"
                      x="179.5"
                      y="88"
                    >
                      S
                    </text>
                  </svg>
                  <svg
                    v-else-if="n === 2"
                    viewBox="0 0 200 120"
                    fill="none"
                  >
                    <!-- The same actions are pinned to individual historical candles. -->
                    <path
                      class="process-soft-line"
                      d="M18 47h164M18 72h164M18 97h164"
                    />
                    <path
                      class="process-line"
                      d="M26 65v28M44 70v36M62 58v30M80 48v30M98 38v30M116 31v31M134 41v32M152 33v31M170 48v38"
                    />
                    <path
                      class="process-candle"
                      d="M26 73v10M44 86v12M62 66v11M80 55v11M98 46v12M116 39v10M134 50v10M152 41v12M170 61v12"
                    />
                    <path
                      class="process-accent"
                      d="M44 62v30M116 29v14"
                    />
                    <circle
                      class="process-trade-point"
                      cx="44"
                      cy="94"
                      r="3"
                    />
                    <circle
                      class="process-trade-point"
                      cx="116"
                      cy="45"
                      r="3"
                    />
                    <path
                      class="process-trade-tag"
                      d="M36 35h16a5 5 0 0 1 5 5v13a5 5 0 0 1-5 5h-4l-4 4-4-4h-4a5 5 0 0 1-5-5V40a5 5 0 0 1 5-5Z"
                    />
                    <text
                      class="process-tag-letter"
                      x="44"
                      y="47"
                    >
                      B
                    </text>
                    <path
                      class="process-trade-tag"
                      d="M108 2h16a5 5 0 0 1 5 5v13a5 5 0 0 1-5 5h-4l-4 4-4-4h-4a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Z"
                    />
                    <text
                      class="process-tag-letter"
                      x="116"
                      y="14"
                    >
                      S
                    </text>
                    <path
                      class="process-soft-line"
                      d="M18 115h164"
                    />
                    <path
                      class="process-accent"
                      d="M18 115h91"
                    />
                    <circle
                      class="process-scrubber"
                      cx="94"
                      cy="115"
                      r="3.5"
                    />
                  </svg>
                  <svg
                    v-else
                    viewBox="0 0 200 120"
                    fill="none"
                  >
                    <!-- Compare outcomes, inspect the difference, ask the next question. -->
                    <path
                      class="process-soft-line"
                      d="M28 56h82M28 106h82"
                    />
                    <path
                      class="process-line"
                      d="m30 49 13-4 13 2 14-10 15 3 14-11M30 75l13-6 13 7 14-4 15 14 14 2"
                    />
                    <path
                      class="process-accent"
                      d="m11 36 4 4 8-9M12 83l9 9m0-9-9 9"
                    />
                    <circle
                      class="process-lens"
                      cx="85"
                      cy="61"
                      r="29"
                    />
                    <circle
                      class="process-trade-point"
                      cx="85"
                      cy="40"
                      r="2.5"
                    />
                    <circle
                      class="process-trade-point"
                      cx="85"
                      cy="86"
                      r="2.5"
                    />
                    <path
                      class="process-line"
                      d="m106 82 12 15"
                    />
                    <path
                      class="process-soft-line"
                      d="M118 60h10m-4-4 4 4-4 4"
                    />
                    <path
                      class="process-line"
                      d="M143 34h40a8 8 0 0 1 8 8v33a8 8 0 0 1-8 8h-18l-12 10V83h-10a8 8 0 0 1-8-8V42a8 8 0 0 1 8-8Z"
                    />
                    <path
                      class="process-question"
                      d="M157 51a6 6 0 1 1 9 5c-3 2-4 3-4 6"
                    />
                    <circle
                      class="process-trade-point"
                      cx="162"
                      cy="70"
                      r="1.5"
                    />
                  </svg>
                </div>
              </div>
              <div class="process-caption">
                <h3>{{ $t(`landing.step${n}`) }}</h3>
                <p>{{ $t(`landing.desc${n}`) }}</p>
              </div>
              <UIcon
                v-if="n < 3"
                class="process-next"
                name="i-lucide-arrow-right"
                aria-hidden="true"
              />
            </li>
          </ol>
          <div class="process-return">
            <span
              class="process-return-line"
              aria-hidden="true"
            />
            <p class="process-return-label">
              <UIcon
                name="i-lucide-arrow-left"
                aria-hidden="true"
              />{{ $t('landing.nextHypothesis') }}
            </p>
          </div>
        </div>
      </div>
      <p class="research-boundary">{{ $t('landing.boundaryBody') }}</p>
    </section>
  </div>
</template>
