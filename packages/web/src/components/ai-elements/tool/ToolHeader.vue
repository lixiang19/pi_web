<script setup lang="ts">
import type { DynamicToolUIPart, ToolUIPart } from 'ai'
import type { HTMLAttributes } from 'vue'
import { CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { ChevronDownIcon, WrenchIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import StatusBadge from './ToolStatusBadge.vue'

type ToolHeaderProps = {
  title?: string
  class?: HTMLAttributes['class']
} & (
  | { type: ToolUIPart['type'], state: ToolUIPart['state'], toolName?: never }
  | { type: DynamicToolUIPart['type'], state: DynamicToolUIPart['state'], toolName: string }
)

const props = defineProps<ToolHeaderProps>()

const derivedName = computed(() => {
  if (props.type === 'dynamic-tool')
    return props.toolName
  if (!props.type)
    return 'tool'
  return props.type.split('-').slice(1).join('-') || 'tool'
})
</script>

<template>
  <CollapsibleTrigger
    :class="
      cn(
        'flex w-full items-center justify-between gap-4 p-3',
        'transition-colors hover:bg-accent/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        props.class,
      )
    "
    v-bind="$attrs"
  >
    <div class="flex items-center gap-2">
      <WrenchIcon class="size-4 text-muted-foreground" aria-hidden="true" />
      <span class="font-medium text-sm">{{ props.title ?? derivedName }}</span>
      <StatusBadge :state="props.state" />
    </div>
    <ChevronDownIcon
      class="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
    />
  </CollapsibleTrigger>
</template>
