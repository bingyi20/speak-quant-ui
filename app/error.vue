<script setup lang="ts">
import type { NuxtError } from '#app'
defineProps<{ error: NuxtError }>()
useSeoMeta({ robots: 'noindex, nofollow' })
</script>
<template>
  <main class="error-page">
    <span class="eyebrow">Trade Lab · {{ error.statusCode }}</span>
    <h1>
      {{
        error.statusCode === 404
          ? '页面不存在 / Page not found'
          : '暂时无法打开 / Something went wrong'
      }}
    </h1>
    <button
      class="primary-button"
      @click="clearError({ redirect: '/' })"
    >
      返回首页 / Back home
    </button>
  </main>
</template>
