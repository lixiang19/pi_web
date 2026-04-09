<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { computed } from 'vue'

interface Props {
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()

const classes = computed(() => cn(
  'flex flex-col',
  // 优化间距 - 更宽松的视觉节奏
  'gap-6 p-4 sm:gap-8 sm:p-6',
  // 确保内容从顶部开始
  'justify-start',
  props.class,
))
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
