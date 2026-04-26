<script setup lang="ts">
import { computed } from "vue";

import MarkdownPreviewBlock from "@/components/workbench/file-preview/markdown/MarkdownPreviewBlock.vue";
import { parseMarkdownBlocks } from "@/components/workbench/file-preview/markdown/parseMarkdownBlocks";
import type { WorkbenchMarkdownBlock } from "@/components/workbench/file-preview/markdown/types";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

const props = defineProps<{
  content: string;
  enableAiActions?: boolean;
  error: string;
  fileName: string;
  filePath: string;
  isSaving: boolean;
}>();

const emit = defineEmits<{
  (e: "append-to-draft", value: string): void;
  (e: "update:content", value: string): void;
}>();

const statusLabel = computed(() => {
  if (props.error) {
    return "保存失败";
  }

  if (props.isSaving) {
    return "自动保存中";
  }

  return "自动保存";
});

const blocks = computed(() => parseMarkdownBlocks(props.content));

const buildAiDraft = (payload: {
  block: WorkbenchMarkdownBlock;
  instruction: string;
}) => {
  const parts = [
    "请基于以下 Markdown 片段处理我的请求。",
    `文件：${props.fileName}`,
    `路径：${props.filePath}`,
    `区块：${payload.block.title}（${payload.block.kind}，${payload.block.startLine}-${payload.block.endLine}）`,
    "片段：",
    "```md",
    payload.block.source.trimEnd(),
    "```",
  ];

  const instruction = payload.instruction.trim();
  if (instruction) {
    parts.push(`我的请求：\n${instruction}`);
  }

  return parts.join("\n\n");
};

const appendBlockToDraft = (payload: {
  block: WorkbenchMarkdownBlock;
  instruction: string;
}) => {
  emit("append-to-draft", buildAiDraft(payload));
};
</script>

<template>
  <div class="grid h-full min-h-0 grid-cols-2 bg-background">
    <section class="min-h-0 border-r border-border/40">
      <div class="flex h-10 items-center justify-between border-b border-border/40 px-3">
        <span class="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/70">
          Markdown
        </span>
        <Badge variant="outline" class="text-[10px] uppercase">
          {{ statusLabel }}
        </Badge>
      </div>

      <Textarea
        :model-value="content"
        class="h-[calc(100%-2.5rem)] rounded-none border-x-0 border-y-0 bg-transparent px-4 py-3 font-mono text-xs leading-6 resize-none"
        @update:model-value="emit('update:content', String($event))"
      />
    </section>

    <section class="min-h-0 bg-muted/10">
      <ScrollArea class="h-full">
        <div class="space-y-4 px-4 py-4">
          <div v-if="!content.trim()" class="rounded-2xl border border-dashed border-border/50 bg-background/70 px-5 py-6 text-sm text-muted-foreground">
            开始输入 Markdown 内容，右侧会按块渲染，并支持把块上下文发给 AI。
          </div>

          <MarkdownPreviewBlock
            v-for="block in blocks"
            v-else
            :key="block.id"
            :block="block"
            :enable-ai-actions="props.enableAiActions"
            @append-to-draft="appendBlockToDraft"
          />
        </div>
      </ScrollArea>
    </section>
  </div>
</template>
