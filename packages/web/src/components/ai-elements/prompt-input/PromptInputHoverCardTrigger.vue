<script setup lang="ts">
import type { HoverCardTriggerProps } from 'reka-ui'
import { HoverCardTrigger } from '@/components/ui/hover-card'

defineProps<HoverCardTriggerProps>()
</script>

<template>
  <HoverCardTrigger v-bind="$props">
    <slot />
  </HoverCardTrigger>
</template>
