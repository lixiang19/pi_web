<script setup lang="ts">
import type { SelectSeparatorProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { SelectSeparator } from "reka-ui";
import { cn, useDefinedObject } from "@/lib/utils";

const props = defineProps<
  SelectSeparatorProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");
const forwardedProps = useDefinedObject(delegatedProps);
</script>

<template>
  <SelectSeparator
    data-slot="select-separator"
    v-bind="forwardedProps"
    :class="cn('bg-border pointer-events-none -mx-1 my-1 h-px', props.class)"
  />
</template>
