<script setup lang="ts">
defineProps<{
	title: string;
}>();
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <header class="shrink-0 border-b border-subtle px-6 py-4">
      <h2 class="text-base font-semibold text-foreground">{{ title }}</h2>
    </header>
    <div class="flex min-h-0 flex-1 items-center justify-center px-6">
      <div class="h-24 w-full max-w-md rounded-md border border-dashed border-strong bg-subtle" />
    </div>
  </div>
</template>
