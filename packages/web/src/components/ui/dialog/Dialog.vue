<script setup lang="ts">
import type { DialogRootEmits, DialogRootProps } from "reka-ui";
import { DialogRoot, useForwardPropsEmits } from "reka-ui";
import { useDefinedObject } from "@/lib/utils";

const props = defineProps<DialogRootProps>();
const emits = defineEmits<DialogRootEmits>();

const forwarded = useForwardPropsEmits(useDefinedObject(props), emits);
</script>

<template>
  <DialogRoot v-bind="forwarded">
    <slot />
  </DialogRoot>
</template>