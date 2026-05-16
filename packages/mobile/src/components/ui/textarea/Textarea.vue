<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

const modelValue = defineModel<string>();

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <textarea
    v-model="modelValue"
    data-slot="textarea"
    :class="cn('min-h-24 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50', props.class)"
  />
</template>
