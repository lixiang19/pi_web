<script setup lang="ts">
import type { SelectGroupProps } from "reka-ui";
import { SelectGroup } from "reka-ui";
import { useDefinedObject } from "@/lib/utils";

const props = defineProps<SelectGroupProps>();
const forwardedProps = useDefinedObject(props);
</script>

<template>
  <SelectGroup data-slot="select-group" v-bind="forwardedProps">
    <slot />
  </SelectGroup>
</template>
