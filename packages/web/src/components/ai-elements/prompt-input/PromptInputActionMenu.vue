<script setup lang="ts">
import type { DropdownMenuRootProps } from 'reka-ui'
import { DropdownMenu } from '@/components/ui/dropdown-menu'

defineProps<DropdownMenuRootProps>()
</script>

<template>
  <DropdownMenu v-bind="$props">
    <slot />
  </DropdownMenu>
</template>
