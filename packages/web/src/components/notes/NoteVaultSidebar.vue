<script setup lang="ts">
import {
  ChevronRight,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Copy,
} from "lucide-vue-next";
import { computed } from "vue";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  "rename-note": [note: NoteListItem];
  "delete-note": [note: NoteListItem];
}>();

const emptyMessage = computed(() =>
  props.totalCount === 0
    ? "还没有 Markdown 笔记"
    : "没有匹配的笔记",
);

/** 按 relativePath 的目录前缀分组 */
const groupedNotes = computed(() => {
  const groups = new Map<string, NoteListItem[]>();
  for (const note of props.filteredNotes) {
    const segments = note.relativePath.split("/");
    const dir = segments.length <= 1 ? "" : segments.slice(0, -1).join("/");
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir)!.push(note);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
});

function noteDisplayName(note: NoteListItem): string {
  return note.name.replace(/\.md$/, "").replace(/\.markdown$/, "");
}

function dirLabel(dir: string): string {
  return dir || "根目录";
}
</script>

<template>
  <aside class="flex h-full w-[240px] min-w-[240px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
    <!-- Header -->
    <div class="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-3">
      <span class="text-sm font-semibold tracking-tight">笔记</span>
      <button
        type="button"
        class="flex size-7 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        data-test="notes-new-toggle"
        @click="emit('update:showNewNoteInput', !showNewNoteInput)"
      >
        <Plus class="size-4" />
      </button>
    </div>

    <!-- Search + New Note -->
    <div class="space-y-2 px-2.5 py-2">
      <div class="relative">
        <Search class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-sidebar-foreground/40" />
        <Input
          :model-value="searchQuery"
          placeholder="搜索笔记"
          class="h-8 border-sidebar-border bg-sidebar/60 pl-7 text-xs shadow-none placeholder:text-sidebar-foreground/40"
          data-test="notes-search"
          @update:model-value="emit('update:searchQuery', String($event))"
        />
      </div>

      <form
        v-if="showNewNoteInput"
        class="flex gap-1.5"
        data-test="notes-create-form"
        @submit.prevent="emit('create-note')"
      >
        <Input
          :model-value="newNoteName"
          placeholder="笔记名称"
          class="h-7 flex-1 border-sidebar-border bg-sidebar/80 text-xs"
          autofocus
          @update:model-value="emit('update:newNoteName', String($event))"
        />
        <button
          type="submit"
          class="flex h-7 items-center rounded-md bg-sidebar-primary px-2 text-[11px] font-medium text-sidebar-primary-foreground"
        >
          创建
        </button>
      </form>
    </div>

    <div class="h-px shrink-0 bg-sidebar-border" />

    <!-- File list -->
    <ScrollArea class="min-h-0 flex-1">
      <div
        v-if="filteredNotes.length === 0"
        class="flex min-h-48 flex-col items-center justify-center px-4 text-center"
        data-test="notes-empty"
      >
        <FileText class="mb-2 size-8 text-sidebar-foreground/25" />
        <p class="text-xs text-sidebar-foreground/60">{{ emptyMessage }}</p>
      </div>

      <div v-else class="py-1" data-test="notes-list">
        <template v-for="[dir, notes] in groupedNotes" :key="dir">
          <!-- Directory label -->
          <div
            v-if="dir"
            class="flex items-center gap-1 px-3 pt-2 pb-0.5 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/40"
          >
            <ChevronRight class="size-3" />
            <span class="truncate">{{ dirLabel(dir) }}</span>
          </div>

          <!-- Notes in directory -->
          <button
            v-for="note in notes"
            :key="note.relativePath"
            type="button"
            class="group flex w-full min-w-0 items-center gap-1.5 rounded-sm px-2 py-1 text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            :class="activePath === note.relativePath ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/80'"
            data-test="notes-list-item"
            @click="emit('open-note', note)"
          >
            <FileText class="mt-0.5 size-3.5 shrink-0" />
            <span class="min-w-0 flex-1 truncate text-sm">{{ noteDisplayName(note) }}</span>

            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <span
                  class="flex size-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100"
                  @click.stop
                >
                  <MoreHorizontal class="size-3.5" />
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="min-w-[140px]">
                <DropdownMenuItem @click="emit('rename-note', note)">
                  <Pencil class="mr-2 size-3.5" />
                  重命名
                </DropdownMenuItem>
                <DropdownMenuItem @click="emit('delete-note', note)">
                  <Trash2 class="mr-2 size-3.5" />
                  删除
                </DropdownMenuItem>
                <DropdownMenuItem @click="navigator.clipboard.writeText(note.relativePath)">
                  <Copy class="mr-2 size-3.5" />
                  复制路径
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </button>
        </template>
      </div>
    </ScrollArea>
  </aside>
</template>
