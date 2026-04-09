<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { Collapsible } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

type ToolProps = InstanceType<typeof Collapsible>['$props']

interface Props extends /* @vue-ignore */ ToolProps {
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()
</script>

<template>
  <Collapsible
    :class="cn(
      'group not-prose w-full rounded-lg border border-border bg-card/50',
      'transition-colors hover:bg-card/80',
      props.class,
    )"
    v-bind="$attrs"
  >
    <slot />
  </Collapsible>
</template>
