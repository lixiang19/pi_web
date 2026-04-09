<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  class?: HTMLAttributes['class']
  duration?: number
}

const props = withDefaults(defineProps<Props>(), {
  duration: 2,
})
</script>

<template>
  <span
    :class="cn(
      'relative inline-block overflow-hidden',
      'after:absolute after:inset-0 after:-translate-x-full',
      'after:bg-gradient-to-r after:from-transparent after:via-white/20 after:to-transparent',
      'after:animate-shimmer',
      props.class,
    )"
    :style="{ '--shimmer-duration': `${props.duration}s` }"
  >
    <slot />
  </span>
</template>

<style scoped>
.after\:animate-shimmer::after {
  animation: shimmer var(--shimmer-duration, 2s) infinite;
}

@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}
</style>
