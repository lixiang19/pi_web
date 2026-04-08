<script setup lang="ts">
import type { DialogContentProps, DialogOverlayProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  useForwardProps,
} from "reka-ui";
import { cn, useDefinedObject } from "@/lib/utils";

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<
  DialogContentProps & {
    class?: HTMLAttributes["class"];
    overlayClass?: HTMLAttributes["class"];
    overlayProps?: DialogOverlayProps;
  }
>();

const delegatedProps = reactiveOmit(props, "class", "overlayClass", "overlayProps");
const forwarded = useForwardProps(useDefinedObject(delegatedProps));
const overlayProps = useDefinedObject(() => props.overlayProps ?? {});
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      v-bind="overlayProps"
      :class="cn('fixed inset-0 z-50 bg-background/80 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0', props.overlayClass)"
    />
    <DialogContent
      v-bind="{ ...$attrs, ...forwarded }"
      :class="cn('fixed left-1/2 top-1/2 z-50 grid w-[min(720px,calc(100vw-2rem))] max-w-full -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-0 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-lg', props.class)"
    >
      <slot />
    </DialogContent>
  </DialogPortal>
</template>