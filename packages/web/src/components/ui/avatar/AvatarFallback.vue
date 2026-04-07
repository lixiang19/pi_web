<script setup lang="ts">
import type { AvatarFallbackProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { AvatarFallback } from "reka-ui";
import { cn, useDefinedObject } from "@/lib/utils";

const props = defineProps<
  AvatarFallbackProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");
const forwardedProps = useDefinedObject(delegatedProps);
</script>

<template>
  <AvatarFallback
    data-slot="avatar-fallback"
    v-bind="forwardedProps"
    :class="
      cn(
        'bg-muted flex size-full items-center justify-center rounded-full',
        props.class,
      )
    "
  >
    <slot />
  </AvatarFallback>
</template>
