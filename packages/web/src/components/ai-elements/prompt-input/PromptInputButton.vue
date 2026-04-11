<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { InputGroupButton } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'
import { Comment, computed, Text, useSlots } from 'vue'
import type { ButtonVariants } from '@/components/ui/button'
import type { InputGroupButtonVariants } from '@/components/ui/input-group'

interface Props {
  class?: HTMLAttributes['class']
  variant?: ButtonVariants['variant']
  size?: InputGroupButtonVariants['size']
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'ghost',
})

const slots = useSlots()

const computedSize = computed(() => {
  if (props.size)
    return props.size

  const slotNodes = slots.default?.()

  if (!slotNodes)
    return 'icon-sm'

  const validChildren = slotNodes.filter((node) => {
    if (node.type === Comment)
      return false
    if (node.type === Text && !node.children?.toString().trim())
      return false
    return true
  })

  return validChildren.length > 1 ? 'sm' : 'icon-sm'
})
</script>

<template>
  <InputGroupButton
    type="button"
    :size="computedSize"
    :class="cn(props.class)"
    :variant="props.variant"
  >
    <slot />
  </InputGroupButton>
</template>
