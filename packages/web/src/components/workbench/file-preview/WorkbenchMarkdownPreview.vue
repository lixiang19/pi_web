<script setup lang="ts">
import { computed } from "vue";
import { Markdown } from "vue-stream-markdown";
import "vue-stream-markdown/index.css";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

const props = defineProps<{
  content: string;
  error: string;
  isSaving: boolean;
}>();

const emit = defineEmits<{
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
</script>

<template>
  <div class="grid h-full min-h-0 grid-cols-2 bg-background">
    <section class="min-h-0 border-r border-border/40">
      <div class="flex h-10 items-center justify-between px-3">
        <span class="text-xs font-semibold uppercase tracking-wider text-foreground/70">
          Markdown 编辑
        </span>
        <Badge variant="outline" class="text-[10px] uppercase">
          {{ statusLabel }}
        </Badge>
      </div>

      <Textarea
        :model-value="content"
        class="h-[calc(100%-2.5rem)] rounded-none border-x-0 border-b-0 border-t border-border/40 bg-transparent px-4 py-3 font-mono text-xs leading-6 resize-none"
        @update:model-value="emit('update:content', String($event))"
      />
    </section>

    <section class="min-h-0 bg-muted/10">
      <div class="flex h-10 items-center justify-between px-3">
        <span class="text-xs font-semibold uppercase tracking-wider text-foreground/70">
          实时预览
        </span>
        <span class="text-[11px] text-muted-foreground">
          {{ error || "修改将自动写回" }}
        </span>
      </div>

      <ScrollArea class="h-[calc(100%-2.5rem)] border-t border-border/40">
        <div class="px-4 py-4">
          <p v-if="!content.trim()" class="text-sm text-muted-foreground">
            开始输入 Markdown 内容
          </p>
          <Markdown
            v-else
            :content="content"
            class="max-w-none break-words text-[14px] leading-7 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3"
          />
        </div>
      </ScrollArea>
    </section>
  </div>
</template>