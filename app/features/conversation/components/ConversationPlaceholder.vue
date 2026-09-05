<script setup lang="ts">
import { useWorkspace } from '../composables/useWorkspace'
import ResearchEntry from './ResearchEntry.vue'
import { StrategyPlaceholder } from '~/features/strategy'
import { ReplayPlaceholder } from '~/features/replay'
const { panel, show, close } = useWorkspace()
</script>
<template>
  <div
    class="conversation-page"
    :class="{ 'has-panel': panel.open, 'panel-fullscreen': panel.fullscreen }"
  >
    <section class="conversation-column">
      <Teleport
        to="#workspace-actions"
        defer
      >
        <button
          class="text-button"
          @click="show(panel.view)"
        >
          <UIcon name="i-lucide-panels-top-left" />{{ $t('conversation.assets') }}
        </button>
      </Teleport>
      <div class="conversation-empty">
        <CommonBrandMark :wordmark="false" />
        <h1>{{ $t('conversation.emptyTitle') }}</h1>
        <p>{{ $t('conversation.emptyDescription') }}</p>
        <span class="preview-label">{{ $t('conversation.emptyNote') }}</span>
      </div>
      <div class="conversation-input">
        <ResearchEntry
          compact
          :show-hint="false"
        />
      </div>
    </section>
    <section
      v-if="panel.open"
      class="asset-panel"
      :aria-label="$t('conversation.assetTitle')"
    >
      <header>
        <div class="panel-title">
          <UiIconButton
            v-if="panel.view !== 'assets'"
            :label="$t('common.back')"
            @click="show('assets')"
            ><UIcon name="i-lucide-arrow-left"
          /></UiIconButton>
          <h2>{{ $t('conversation.assetTitle') }}</h2>
        </div>
        <div class="panel-actions">
          <UiIconButton
            :label="panel.fullscreen ? $t('common.exitFullscreen') : $t('common.fullscreen')"
            @click="panel.fullscreen = !panel.fullscreen"
            ><UIcon name="i-lucide-maximize-2" /></UiIconButton
          ><UiIconButton
            :label="$t('common.close')"
            @click="close"
            ><UIcon name="i-lucide-x"
          /></UiIconButton>
        </div>
      </header>
      <div class="panel-content">
        <template v-if="panel.view === 'assets'"
          ><p class="preview-label">{{ $t('common.placeholder') }}</p>
          <button
            class="asset-choice"
            @click="show('strategy')"
          >
            <UIcon name="i-lucide-file-text" /><span
              ><strong>{{ $t('conversation.strategy') }}</strong
              ><small>{{ $t('conversation.strategyHint') }}</small></span
            ><UIcon name="i-lucide-chevron-right" /></button
          ><button
            class="asset-choice"
            @click="show('replay')"
          >
            <UIcon name="i-lucide-chart-candlestick" /><span
              ><strong>{{ $t('conversation.replay') }}</strong
              ><small>{{ $t('conversation.replayHint') }}</small></span
            ><UIcon name="i-lucide-chevron-right" /></button></template
        ><StrategyPlaceholder v-else-if="panel.view === 'strategy'" /><ReplayPlaceholder v-else />
      </div>
    </section>
  </div>
</template>
