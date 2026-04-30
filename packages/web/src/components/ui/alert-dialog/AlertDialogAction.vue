<script setup lang="ts">
import type { AlertDialogActionProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { AlertDialogAction, useForwardProps } from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<AlertDialogActionProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <AlertDialogAction
    data-slot="alert-dialog-action"
    v-bind="forwardedProps"
    :class="cn('inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50', props.class)"
  >
    <slot />
  </AlertDialogAction>
</template>
