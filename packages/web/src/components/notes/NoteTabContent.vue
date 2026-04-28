<script setup lang="ts">
import { FileText, LoaderCircle } from "lucide-vue-next";

import NoteMilkdownEditor from "@/components/notes/NoteMilkdownEditor.vue";
import type { NoteTab } from "@/lib/types";

defineProps<{
  tab: NoteTab | null;
}>();

const emit = defineEmits<{
  "markdown-updated": [markdown: string];
}>();
</script>

<template>
  <section class="min-h-0 flex-1 overflow-auto bg-background">
    <div
      v-if="!tab"
      class="flex h-full items-center justify-center px-6"
      data-test="notes-editor-empty"
    >
      <div class="max-w-sm text-center">
        <div class="mx-auto mb-4 flex size-14 items-center justify-center rounded-xl bg-muted/40">
          <FileText class="size-6 text-muted-foreground/50" />
        </div>
        <p class="text-sm text-foreground/80">打开或新建一篇笔记</p>
        <p class="mt-1 text-xs text-muted-foreground">
          从左侧列表选择文件开始编辑
        </p>
      </div>
    </div>

    <div
      v-else-if="tab.isLoading"
      class="flex h-full items-center justify-center"
    >
      <div class="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle class="size-4 animate-spin" />
        正在加载笔记...
      </div>
    </div>

    <NoteMilkdownEditor
      v-else
      :key="tab.relativePath"
      :content="tab.content"
      @markdown-updated="emit('markdown-updated', $event)"
    />
  </section>
</template>
