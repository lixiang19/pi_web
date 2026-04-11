<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { DropdownMenuContentProps } from 'reka-ui'
import { DropdownMenuContent } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface Props extends DropdownMenuContentProps {
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()

const restProps = { ...props, align: undefined };
delete (restProps as Record<string, unknown>).align;
delete (restProps as Record<string, unknown>).class;
</script>

<template>
  <DropdownMenuContent align="start" :class="cn(props.class)" v-bind="restProps">
    <slot />
  </DropdownMenuContent>
</template>
