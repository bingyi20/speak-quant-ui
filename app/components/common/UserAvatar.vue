<script setup lang="ts">
const props = defineProps<{ src?: string | null; large?: boolean }>()
const failed = ref(false)
watch(
  () => props.src,
  () => {
    failed.value = false
  },
)
</script>
<template>
  <img
    class="avatar"
    :class="{ large }"
    :src="!failed && src ? src : '/avatar-default.svg'"
    alt=""
    referrerpolicy="no-referrer"
    @error="failed = true"
  />
</template>
