<template>
  <div class="public-shell">
    <header class="public-header">
      <NuxtLink
        to="/"
        aria-label="Trade Lab"
        ><CommonBrandMark
      /></NuxtLink>
      <nav :aria-label="$t('nav.product')">
        <NuxtLink
          to="/#method"
          class="text-button desktop-link"
          >{{ $t('nav.method') }}</NuxtLink
        ><NuxtLink
          to="/new-task"
          class="outline-button"
          >{{ $t('nav.workspace') }} <UIcon name="i-lucide-arrow-up-right"
        /></NuxtLink>
      </nav>
    </header>
    <main id="main-content"><slot /></main>
    <footer class="public-footer">
      <CommonBrandMark /><span>{{ $t('landing.tag') }}</span
      ><span>{{ $t('landing.footer') }}</span>
    </footer>
  </div>
</template>
