<script setup lang="ts">
import type { HoverCardContentProps } from 'reka-ui'
import { HoverCardContent } from '@/components/ui/hover-card'

const props = withDefaults(defineProps<HoverCardContentProps>(), {
  align: 'start',
})

const restProps = { ...props, align: undefined };
delete (restProps as Record<string, unknown>).align;
</script>

<template>
  <HoverCardContent :align="props.align" v-bind="restProps">
    <slot />
  </HoverCardContent>
</template>
