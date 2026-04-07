<script setup lang="ts">
import type { SelectItemTextProps } from "reka-ui";
import { SelectItemText } from "reka-ui";
import { useDefinedObject } from "@/lib/utils";

const props = defineProps<SelectItemTextProps>();
const forwardedProps = useDefinedObject(props);
</script>

<template>
  <SelectItemText data-slot="select-item-text" v-bind="forwardedProps">
    <slot />
  </SelectItemText>
</template>
