<script setup lang="ts">
import type { SelectValueProps } from "reka-ui";
import { SelectValue } from "reka-ui";
import { useDefinedObject } from "@/lib/utils";

const props = defineProps<SelectValueProps>();
const forwardedProps = useDefinedObject(props);
</script>

<template>
  <SelectValue data-slot="select-value" v-bind="forwardedProps">
    <slot />
  </SelectValue>
</template>
