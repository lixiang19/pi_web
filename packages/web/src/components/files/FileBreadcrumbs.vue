<script setup lang="ts">
import { ChevronRight, Home } from "lucide-vue-next";

defineProps<{
  items: Array<{
    label: string;
    path: string;
  }>;
}>();

const emit = defineEmits<{
  (event: "navigate", path: string): void;
}>();
</script>

<template>
  <nav class="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
    <button
      v-for="(item, index) in items"
      :key="item.path"
      type="button"
      class="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-accent hover:text-foreground"
      @click="emit('navigate', item.path)"
    >
      <Home v-if="index === 0" class="size-3.5 shrink-0" />
      <span class="max-w-32 truncate">{{ item.label }}</span>
      <ChevronRight
        v-if="index < items.length - 1"
        class="size-3 shrink-0 text-muted-foreground/60"
      />
    </button>
  </nav>
</template>
