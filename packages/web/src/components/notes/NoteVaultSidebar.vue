<script setup lang="ts">
import { BookOpen, FileText, Folder, Plus, Search } from "lucide-vue-next";
import { computed } from "vue";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { NoteListItem } from "@/lib/types";

const props = defineProps<{
  filteredNotes: NoteListItem[];
  totalCount: number;
  activePath: string;
  searchQuery: string;
  showNewNoteInput: boolean;
  newNoteName: string;
}>();

const emit = defineEmits<{
  "update:searchQuery": [value: string];
  "update:showNewNoteInput": [value: boolean];
  "update:newNoteName": [value: string];
  "open-note": [note: NoteListItem];
  "create-note": [];
}>();

const emptyMessage = computed(() =>
  props.totalCount === 0 ? "chat 文件夹里还没有 Markdown" : "没有匹配的笔记",
);

function formatDate(updatedAt: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
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

function directoryName(note: NoteListItem): string {
  const segments = note.relativePath.split("/");
  if (segments.length <= 1) return "根目录";
  return segments.slice(0, -1).join("/");
}
</script>

<template>
  <aside class="flex h-full w-[304px] min-w-[304px] flex-col border-r border-border/50 bg-muted/15">
    <div class="ridge-panel-header flex min-h-16 items-center justify-between gap-3 border-b border-border/45 px-4">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <BookOpen class="size-4 text-primary" />
          <p class="text-[11px] font-black uppercase tracking-[0.24em] text-primary/70">
            Vault
          </p>
        </div>
        <div class="mt-1 flex items-center gap-2">
          <h1 class="truncate text-base font-semibold tracking-tight">笔记库</h1>
          <Badge variant="secondary" class="h-5 px-1.5 text-[10px]">
            {{ totalCount }}
          </Badge>
        </div>
      </div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="size-8"
              data-test="notes-new-toggle"
              @click="emit('update:showNewNoteInput', !showNewNoteInput)"
            >
              <Plus class="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">新建笔记</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <div class="space-y-3 px-3 py-3">
      <div class="relative">
        <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
        <Input
          :model-value="searchQuery"
          placeholder="搜索笔记或路径"
          class="h-9 border-border/55 bg-background/55 pl-8 text-sm shadow-none"
          data-test="notes-search"
          @update:model-value="emit('update:searchQuery', String($event))"
        />
      </div>

      <form
        v-if="showNewNoteInput"
        class="flex gap-2"
        data-test="notes-create-form"
        @submit.prevent="emit('create-note')"
      >
        <Input
          :model-value="newNoteName"
          placeholder="新笔记名称"
          class="h-8 flex-1 border-border/55 bg-background/70 text-sm"
          autofocus
          @update:model-value="emit('update:newNoteName', String($event))"
        />
        <Button type="submit" size="sm" class="h-8 px-3">
          创建
        </Button>
      </form>
    </div>

    <Separator class="bg-border/45" />

    <ScrollArea class="min-h-0 flex-1">
      <div
        v-if="filteredNotes.length === 0"
        class="flex min-h-64 flex-col items-center justify-center px-6 text-center"
        data-test="notes-empty"
      >
        <div class="mb-3 flex size-11 items-center justify-center rounded-lg border border-border/50 bg-background/45">
          <FileText class="size-5 text-muted-foreground/60" />
        </div>
        <p class="text-sm font-medium text-foreground/80">{{ emptyMessage }}</p>
        <p class="mt-1 text-xs leading-5 text-muted-foreground">
          Markdown 文件会出现在这里
        </p>
      </div>

      <div v-else class="space-y-1 p-2" data-test="notes-list">
        <button
          v-for="note in filteredNotes"
          :key="note.relativePath"
          type="button"
          class="group flex w-full min-w-0 border-l-2 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          :class="activePath === note.relativePath
            ? 'border-primary bg-accent/55 text-accent-foreground'
            : 'border-transparent text-foreground/82 hover:bg-accent/30'"
          data-test="notes-list-item"
          @click="emit('open-note', note)"
        >
          <FileText
            class="mt-0.5 size-4 shrink-0"
            :class="activePath === note.relativePath ? 'text-primary' : 'text-muted-foreground'"
          />

          <div class="ml-2.5 min-w-0 flex-1">
            <div class="flex min-w-0 items-center justify-between gap-2">
              <p class="truncate text-sm font-medium leading-5">{{ note.name }}</p>
              <span class="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {{ formatSize(note.size) }}
              </span>
            </div>

            <div class="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
              <Folder class="size-3 shrink-0" />
              <span class="truncate">{{ directoryName(note) }}</span>
            </div>

            <p class="mt-1 truncate text-[11px] leading-4 text-muted-foreground/75">
              {{ formatDate(note.updatedAt) }}
            </p>
          </div>
        </button>
      </div>
    </ScrollArea>
  </aside>
</template>
