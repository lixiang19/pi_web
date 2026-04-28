<script setup lang="ts">
import {
  FileCode2,
  FileText,
  Folder,
  Image,
  MoreHorizontal,
  Trash2,
  Type,
} from "lucide-vue-next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FileTreeEntry } from "@/lib/types";

defineProps<{
  entries: FileTreeEntry[];
  isLoading: boolean;
  activePath: string;
}>();

const emit = defineEmits<{
  (event: "open", entry: FileTreeEntry): void;
  (event: "rename", entry: FileTreeEntry): void;
  (event: "trash", entry: FileTreeEntry): void;
  (event: "move", entry: FileTreeEntry, targetDirectory: FileTreeEntry): void;
}>();

const getEntryIcon = (entry: FileTreeEntry) => {
  if (entry.kind === "directory") {
    return Folder;
  }

  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"].includes(entry.extension)) {
    return Image;
  }

  if ([".md", ".markdown", ".txt"].includes(entry.extension)) {
    return FileText;
  }

  if (entry.extension) {
    return FileCode2;
  }

  return Type;
};

const formatSize = (entry: FileTreeEntry) => {
  if (entry.kind === "directory" || entry.size === null) {
    return "文件夹";
  }

  if (entry.size < 1024) {
    return `${entry.size} B`;
  }

  if (entry.size < 1024 * 1024) {
    return `${(entry.size / 1024).toFixed(1)} KB`;
  }

  return `${(entry.size / 1024 / 1024).toFixed(1)} MB`;
};

const formatDate = (value: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);

const handleDrop = (event: DragEvent, targetDirectory: FileTreeEntry) => {
  if (targetDirectory.kind !== "directory") {
    return;
  }

  const payload = event.dataTransfer?.getData("application/json");
  if (!payload) {
    return;
  }

  const entry = JSON.parse(payload) as FileTreeEntry;
  emit("move", entry, targetDirectory);
};

const handleDragStart = (event: DragEvent, entry: FileTreeEntry) => {
  event.dataTransfer?.setData("text/plain", entry.path);
  event.dataTransfer?.setData("application/json", JSON.stringify(entry));
  event.dataTransfer!.effectAllowed = "move";
};
</script>

<template>
  <div class="min-h-0 flex-1 overflow-auto px-5 pb-5">
    <div
      v-if="isLoading"
      class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
    >
      <div
        v-for="index in 10"
        :key="index"
        class="h-32 animate-pulse rounded-lg bg-muted/60"
      />
    </div>

    <div
      v-else-if="entries.length === 0"
      class="flex h-full min-h-64 items-center justify-center text-sm text-muted-foreground"
    >
      当前目录没有文件
    </div>

    <div
      v-else
      class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
    >
      <div
        v-for="entry in entries"
        :key="entry.path"
        draggable="true"
        class="group relative flex h-32 flex-col justify-between rounded-lg border border-border/55 bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
        :class="entry.path === activePath ? 'border-primary/70 bg-primary/5' : ''"
        @click="emit('open', entry)"
        @dragstart="handleDragStart($event, entry)"
        @dragover.prevent
        @drop.prevent="handleDrop($event, entry)"
      >
        <div class="flex items-start justify-between gap-2">
          <div
            class="flex size-10 items-center justify-center rounded-md"
            :class="entry.kind === 'directory'
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground'"
          >
            <component :is="getEntryIcon(entry)" class="size-5" />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                class="opacity-0 group-hover:opacity-100"
                @click.stop
              >
                <MoreHorizontal class="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem @click.stop="emit('rename', entry)">
                重命名
              </DropdownMenuItem>
              <DropdownMenuItem
                class="text-destructive focus:text-destructive"
                @click.stop="emit('trash', entry)"
              >
                <Trash2 class="size-4" />
                移入回收区
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-foreground">
            {{ entry.name }}
          </p>
          <div class="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span class="truncate">{{ formatSize(entry) }}</span>
            <span class="shrink-0 tabular-nums">{{ formatDate(entry.modifiedAt) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
