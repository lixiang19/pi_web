<script setup lang="ts">
import {
  Circle,
  FileText,
  LoaderCircle,
  PanelTop,
  Save,
  TextCursorInput,
} from "lucide-vue-next";
import { computed } from "vue";

import NoteMilkdownEditor from "@/components/notes/NoteMilkdownEditor.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { NoteListItem } from "@/lib/types";

const props = defineProps<{
  activeNote: NoteListItem | null;
  content: string;
  currentMarkdown: string;
  hasUnsavedChanges: boolean;
  isLoading: boolean;
  isSaving: boolean;
}>();

const emit = defineEmits<{
  "markdown-updated": [markdown: string];
  save: [];
}>();

const noteStats = computed(() => {
  const text = props.currentMarkdown;
  const trimmed = text.trim();

  return {
    characters: text.length,
    lines: text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length,
    words: trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length,
  };
});

function formatDate(updatedAt: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(updatedAt);
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
</script>

<template>
  <main class="flex min-h-0 flex-1 flex-col bg-background">
    <header class="ridge-panel-header flex min-h-16 items-center justify-between gap-4 border-b border-border/45 px-5">
      <div v-if="activeNote" class="min-w-0">
        <div class="flex items-center gap-2">
          <PanelTop class="size-4 text-primary" />
          <p class="text-[11px] font-black uppercase tracking-[0.24em] text-primary/70">
            Editor
          </p>
          <Badge
            variant="outline"
            class="h-5 border-border/60 px-1.5 text-[10px] text-muted-foreground"
          >
            Markdown
          </Badge>
        </div>

        <div class="mt-1 flex min-w-0 items-center gap-3">
          <h1 class="truncate text-lg font-semibold tracking-tight">{{ activeNote.name }}</h1>
          <span class="hidden truncate text-xs text-muted-foreground md:block">
            {{ activeNote.relativePath }}
          </span>
        </div>
      </div>

      <div v-else class="min-w-0">
        <div class="flex items-center gap-2">
          <PanelTop class="size-4 text-primary" />
          <p class="text-[11px] font-black uppercase tracking-[0.24em] text-primary/70">
            Editor
          </p>
        </div>
        <h1 class="mt-1 truncate text-lg font-semibold tracking-tight">选择一篇笔记</h1>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <div
          v-if="activeNote"
          class="hidden items-center gap-2 text-xs text-muted-foreground lg:flex"
        >
          <Circle
            class="size-2.5 fill-current"
            :class="hasUnsavedChanges ? 'text-primary' : 'text-muted-foreground/60'"
          />
          <span>{{ hasUnsavedChanges ? "未保存" : "已同步" }}</span>
        </div>

        <Button
          type="button"
          size="sm"
          :disabled="!activeNote || isSaving || !hasUnsavedChanges"
          data-test="notes-save"
          @click="emit('save')"
        >
          <LoaderCircle v-if="isSaving" class="size-4 animate-spin" />
          <Save v-else class="size-4" />
          {{ isSaving ? "保存中" : "保存" }}
        </Button>
      </div>
    </header>

    <section
      v-if="!activeNote"
      class="flex min-h-0 flex-1 items-center justify-center px-6"
      data-test="notes-editor-empty"
    >
      <div class="max-w-sm text-center">
        <div class="mx-auto mb-4 flex size-14 items-center justify-center rounded-xl border border-border/50 bg-muted/35">
          <FileText class="size-6 text-muted-foreground/60" />
        </div>
        <p class="text-sm font-medium text-foreground">打开一篇 Markdown 笔记</p>
        <p class="mt-1 text-xs leading-5 text-muted-foreground">
          左侧列表负责定位文件，中间区域保持专注编辑。
        </p>
      </div>
    </section>

    <section
      v-else-if="isLoading"
      class="flex min-h-0 flex-1 items-center justify-center px-6"
      data-test="notes-editor-loading"
    >
      <div class="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle class="size-4 animate-spin" />
        正在加载笔记...
      </div>
    </section>

    <template v-else>
      <div class="min-h-0 flex-1 overflow-hidden bg-muted/10">
        <div class="mx-auto h-full w-full max-w-[920px] border-x border-border/35 bg-card/65 shadow-sm">
          <NoteMilkdownEditor
            :content="content"
            @markdown-updated="emit('markdown-updated', $event)"
          />
        </div>
      </div>

      <Separator class="bg-border/45" />

      <footer class="flex h-9 shrink-0 items-center justify-between gap-4 bg-muted/15 px-4 text-[11px] text-muted-foreground">
        <div class="flex min-w-0 items-center gap-2">
          <TextCursorInput class="size-3.5 shrink-0" />
          <span class="truncate">{{ activeNote.relativePath }}</span>
        </div>

        <div class="flex shrink-0 items-center gap-3 tabular-nums">
          <span>{{ noteStats.characters }} 字符</span>
          <span>{{ noteStats.words }} 词</span>
          <span>{{ noteStats.lines }} 行</span>
          <span class="hidden sm:inline">{{ formatSize(activeNote.size) }}</span>
          <span class="hidden md:inline">更新于 {{ formatDate(activeNote.updatedAt) }}</span>
        </div>
      </footer>
    </template>
  </main>
</template>
