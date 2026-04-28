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
  if (entry.kind === "directory") return Folder;
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"].includes(entry.extension)) return Image;
  if ([".md", ".markdown", ".txt"].includes(entry.extension)) return FileText;
  if (entry.extension) return FileCode2;
  return Type;
};

const formatSize = (entry: FileTreeEntry) => {
  if (entry.kind === "directory") return "—";
  if (entry.size == null) return "";
  if (entry.size < 1024) return `${entry.size} B`;
  if (entry.size < 1024 * 1024) return `${(entry.size / 1024).toFixed(1)} KB`;
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
  if (targetDirectory.kind !== "directory") return;
  const payload = event.dataTransfer?.getData("application/json");
  if (!payload) return;
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
    <!-- 加载骨架 -->
    <div
      v-if="isLoading"
      class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
    >
      <div
        v-for="index in 10"
        :key="index"
        class="h-28 animate-pulse rounded-lg bg-muted/40"
      />
    </div>

    <!-- 空态 -->
    <div
      v-else-if="entries.length === 0"
      class="flex h-full min-h-48 items-center justify-center text-sm text-muted-foreground"
    >
      当前目录为空
    </div>

    <!-- 文件网格 -->
    <div
      v-else
      class="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
    >
      <button
        v-for="entry in entries"
        :key="entry.path"
        type="button"
        draggable="true"
        class="group relative flex h-28 flex-col items-center justify-between rounded-lg bg-card px-3 pb-3 pt-4 text-left transition-all duration-150 shadow-sm hover:shadow-md hover:bg-accent/5"
        :class="entry.path === activePath ? 'ring-1 ring-primary/40 bg-primary/[0.03]' : ''"
        @click="emit('open', entry)"
        @dragstart="handleDragStart($event, entry)"
        @dragover.prevent
        @drop.prevent="handleDrop($event, entry)"
      >
        <!-- 操作菜单 -->
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100"
              @click.stop
            >
              <MoreHorizontal class="size-3.5" />
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
              <Trash2 class="size-3.5" />
              移入回收区
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <!-- 图标 -->
        <component
          :is="getEntryIcon(entry)"
          class="size-7 shrink-0"
          :class="entry.kind === 'directory' ? 'text-primary' : 'text-muted-foreground'"
        />

        <!-- 文件名 + 元信息 -->
        <div class="min-w-0 w-full text-center">
          <p class="truncate text-xs font-medium text-foreground">{{ entry.name }}</p>
          <p class="mt-0.5 truncate text-[10px] text-muted-foreground">
            {{ formatSize(entry) }}<span v-if="formatSize(entry)" class="mx-1">·</span>{{ formatDate(entry.modifiedAt) }}
          </p>
        </div>
      </button>
    </div>
  </div>
</template>
