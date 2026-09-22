<script setup lang="ts">
definePageMeta({ layout: 'public' })
const localePath = useLocalePath()
await navigateTo(`${localePath('/pricing')}#billing`, { redirectCode: 301, replace: true })
</script>
<template><div /></template>
