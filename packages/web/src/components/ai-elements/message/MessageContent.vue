<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()
</script>

<template>
  <div
    :class="
      cn(
        'flex w-fit flex-col gap-2 overflow-hidden',
        // 用户消息样式
        'group-[.is-user]:ml-auto group-[.is-user]:rounded-2xl group-[.is-user]:bg-secondary',
        'group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-secondary-foreground',
        // 助手消息样式
        'group-[.is-assistant]:text-foreground',
        // 排版
        'text-sm leading-relaxed',
        props.class,
      )
    "
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>
