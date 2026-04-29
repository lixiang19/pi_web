<script setup lang="ts">
import { FileQuestion, ExternalLink } from "lucide-vue-next";

import { Button } from "@/components/ui/button";

defineProps<{
	fileName: string;
	filePath: string;
}>();

const emit = defineEmits<{
	(e: "open", path: string): void;
}>();
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
    <div class="flex size-14 items-center justify-center rounded-2xl bg-muted/60">
      <FileQuestion class="size-6 text-muted-foreground/50" />
    </div>
    <div class="space-y-1">
      <p class="text-sm font-medium text-foreground">{{ fileName }}</p>
      <p class="text-xs text-muted-foreground">此文件类型不支持在线预览</p>
    </div>
    <Button
      variant="outline"
      class="gap-2"
      @click="emit('open', filePath)"
    >
      <ExternalLink class="size-4" />
      使用默认应用打开
    </Button>
  </div>
</template>
