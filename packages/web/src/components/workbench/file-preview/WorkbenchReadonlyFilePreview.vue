<script setup lang="ts">
import { computed } from "vue";
import { FileCode2, FileImage, FileSearch, FileX2 } from "lucide-vue-next";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FilePreviewKind } from "@/lib/types";

const props = defineProps<{
  blobUrl: string;
  content: string;
  mimeType: string;
  previewKind: FilePreviewKind;
}>();

const previewTitle = computed(() => {
  switch (props.previewKind) {
    case "image":
      return "图片预览";
    case "code":
      return "代码预览";
    case "text":
      return "文本预览";
    default:
      return "不支持预览";
  }
});

const previewIcon = computed(() => {
  switch (props.previewKind) {
    case "image":
      return FileImage;
    case "code":
      return FileCode2;
    case "text":
      return FileSearch;
    default:
      return FileX2;
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <div class="flex h-10 items-center justify-between gap-2 border-b border-border/40 px-3">
      <div class="flex items-center gap-2">
        <component :is="previewIcon" class="size-3.5 text-muted-foreground" />
        <span class="text-xs font-semibold uppercase tracking-wider text-foreground/70">
          {{ previewTitle }}
        </span>
      </div>
      <Badge variant="outline" class="text-[10px] uppercase">只读</Badge>
    </div>

    <div class="min-h-0 flex-1">
      <ScrollArea v-if="previewKind === 'image'" class="h-full">
        <div class="flex min-h-full items-center justify-center p-4">
          <img
            :src="blobUrl"
            alt="文件预览"
            class="max-h-full max-w-full rounded-xl border border-border/40 bg-card object-contain shadow-sm"
          />
        </div>
      </ScrollArea>

      <ScrollArea v-else-if="previewKind === 'code' || previewKind === 'text'" class="h-full">
        <pre class="min-h-full whitespace-pre-wrap break-words px-4 py-4 font-mono text-xs leading-6 text-foreground/90">{{ content || "空文件" }}</pre>
      </ScrollArea>

      <div v-else class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <FileX2 class="size-10 text-muted-foreground/40" />
        <div class="space-y-1">
          <p class="text-sm font-medium text-foreground/80">当前文件类型不支持预览</p>
          <p class="text-xs text-muted-foreground">{{ mimeType || "未知类型" }}</p>
        </div>
      </div>
    </div>
  </div>
</template>