<script setup lang="ts">
import type { SelectRootEmits, SelectRootProps } from "reka-ui";
import { SelectRoot, useForwardPropsEmits } from "reka-ui";
import { useDefinedObject } from "@/lib/utils";

const props = defineProps<SelectRootProps>();
const emits = defineEmits<SelectRootEmits>();

const forwarded = useForwardPropsEmits(useDefinedObject(props), emits);
const forwardedProps = useDefinedObject(forwarded);
</script>

<template>
  <SelectRoot v-slot="slotProps" data-slot="select" v-bind="forwardedProps">
    <slot v-bind="slotProps" />
  </SelectRoot>
</template>
