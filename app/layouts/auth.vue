<template>
  <div class="auth-shell">
    <header class="public-header">
      <NuxtLink
        to="/"
        aria-label="Trade Lab"
        ><CommonBrandMark /></NuxtLink
      ><NuxtLink
        to="/"
        class="text-button"
        >{{ $t('nav.home') }}</NuxtLink
      >
    </header>
    <main><slot /></main>
  </div>
</template>
