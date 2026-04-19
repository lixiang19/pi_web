<script setup lang="ts">
import { computed } from "vue";
import { FileImage, FileSearch, FileX2, LoaderCircle } from "lucide-vue-next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FilePreviewKind } from "@/lib/types";
import ReadonlyCodePreview from "./ReadonlyCodePreview.vue";
import ReadonlyHtmlPreview from "./ReadonlyHtmlPreview.vue";

const props = defineProps<{
  blobUrl: string;
  content: string;
  error: string;
  extension: string;
  fileName: string;
  isLargeFile: boolean;
  isLoadingMore: boolean;
  mimeType: string;
  nextStartLine: number | null;
  previewLineCount: number;
  previewKind: FilePreviewKind;
}>();

defineEmits<{
  (e: "load-more"): void;
}>();

const canLoadMore = computed(
  () =>
    props.isLargeFile
    && (props.previewKind === "code" || props.previewKind === "text")
    && props.nextStartLine !== null,
);

const displayError = computed(() => props.error.trim());

const previewTitle = computed(() => {
  switch (props.previewKind) {
    case "image":
      return "图片预览";
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
    case "text":
      return FileSearch;
    default:
      return FileX2;
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <div class="min-h-0 flex-1">
      <ReadonlyCodePreview
        v-if="previewKind === 'code'"
        :content="content"
        :extension="extension"
        :file-name="fileName"
        :mime-type="mimeType"
      />

      <ReadonlyHtmlPreview
        v-else-if="previewKind === 'html'"
        :content="content"
        :file-name="fileName"
      />

      <div v-else class="flex h-full min-h-0 flex-col bg-background">
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

          <ScrollArea v-else-if="previewKind === 'text'" class="h-full">
            <pre class="min-h-full whitespace-pre-wrap break-words px-4 py-4 font-mono text-xs leading-6 text-foreground/90">{{ content || "空文件" }}</pre>
          </ScrollArea>

          <div v-else class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <FileX2 class="size-10 text-muted-foreground/40" />
            <div v-if="displayError" class="max-w-md rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-left">
              <p class="text-sm font-medium text-destructive">文件预览失败</p>
              <p class="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-destructive/90">
                {{ displayError }}
              </p>
            </div>
            <div v-else class="space-y-1">
              <p class="text-sm font-medium text-foreground/80">当前文件类型不支持预览</p>
              <p class="text-xs text-muted-foreground">{{ mimeType || "未知类型" }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="isLargeFile && (previewKind === 'code' || previewKind === 'text')"
      class="flex items-center justify-between gap-3 border-t border-border/40 bg-muted/10 px-3 py-2"
    >
      <div class="min-w-0">
        <p class="text-xs font-medium text-foreground/80">大文件模式</p>
        <p class="text-[11px] text-muted-foreground">已加载 {{ previewLineCount }} 行，只按需继续读取后续内容。</p>
        <p v-if="displayError" class="mt-1 text-[11px] text-destructive">
          {{ displayError }}
        </p>
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        class="shrink-0"
        :disabled="!canLoadMore || isLoadingMore"
        @click="$emit('load-more')"
      >
        <LoaderCircle v-if="isLoadingMore" class="mr-1.5 size-3.5 animate-spin" />
        {{ canLoadMore ? "继续加载 1000 行" : "已加载全部内容" }}
      </Button>
    </div>
  </div>
</template>