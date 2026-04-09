<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { BrainIcon, ChevronDownIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { Shimmer } from '../shimmer'
import { useReasoningContext } from './context'

interface Props {
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()

const { isStreaming, isOpen, duration } = useReasoningContext()

const thinkingMessage = computed(() => {
  if (isStreaming.value || duration.value === 0) {
    return 'thinking'
  }
  if (duration.value === undefined) {
    return 'default_done'
  }
  return 'duration_done'
})
</script>

<template>
  <CollapsibleTrigger
    :class="cn(
      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm',
      'text-muted-foreground transition-all duration-200',
      'hover:bg-accent hover:text-accent-foreground',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      props.class,
    )"
    aria-label="展开/折叠推理过程"
  >
    <slot>
      <BrainIcon class="size-4 flex-shrink-0" aria-hidden="true" />

      <template v-if="thinkingMessage === 'thinking'">
        <Shimmer :duration="1.5" class="font-medium">
          思考中...
        </Shimmer>
      </template>

      <template v-else-if="thinkingMessage === 'default_done'">
        <p class="font-medium">思考完成</p>
      </template>

      <template v-else>
        <p class="font-medium">思考了 {{ duration }} 秒</p>
      </template>

      <ChevronDownIcon
        :class="cn(
          'size-4 flex-shrink-0 transition-transform duration-200',
          isOpen ? 'rotate-180' : 'rotate-0',
        )"
        aria-hidden="true"
      />
    </slot>
  </CollapsibleTrigger>
</template>
