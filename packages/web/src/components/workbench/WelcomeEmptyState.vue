<script setup lang="ts">
import { Plus } from "lucide-vue-next";
import { Button } from "@/components/ui/button";

defineEmits<{
  create: [];
}>();
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
    <!-- Brand Logo -->
    <div class="flex items-center gap-2">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground/5">
        <svg
          class="h-6 w-6 text-foreground/80"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
      <span class="text-xl font-semibold tracking-tight text-foreground">ridge</span>
    </div>

    <!-- Content -->
    <div class="space-y-2">
      <h3 class="text-sm font-medium text-foreground">
        选择一个会话开始
      </h3>
      <p class="text-xs text-muted-foreground">
        从左侧列表选择已有会话，或创建一个新会话
      </p>
    </div>

    <!-- Action -->
    <Button
      size="sm"
      class="h-8 gap-1.5 text-xs"
      @click="$emit('create')"
    >
      <Plus class="h-3.5 w-3.5" />
      新建会话
    </Button>
  </div>
</template>
