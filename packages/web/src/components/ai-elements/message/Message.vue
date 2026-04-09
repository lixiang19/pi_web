<script setup lang="ts">
import type { UIMessage } from 'ai'
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  from: UIMessage['role']
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()
</script>

<template>
  <div
    :class="
      cn(
        'group flex w-full gap-3',
        props.from === 'user'
          ? 'is-user ml-auto max-w-[85%] flex-row-reverse justify-end sm:max-w-[80%]'
          : 'is-assistant max-w-[90%] sm:max-w-[85%]',
        props.class,
      )
    "
    :data-role="props.from"
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>
