<script setup lang="ts">
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Copy,
  Clock,
  StarOff,
} from "lucide-vue-next";
import { computed, ref } from "vue";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { NoteListItem } from "@/lib/types";

type FilterMode = "all" | "search" | "starred" | "recent";

const props = defineProps<{
  filteredNotes: NoteListItem[];
  totalCount: number;
  activePath: string;
  searchQuery: string;
  starredPaths: Set<string>;
  filter: FilterMode;
}>();

const emit = defineEmits<{
  "update:searchQuery": [value: string];
  "open-note": [note: NoteListItem];
  "create-note": [];
  "create-folder": [];
  "rename-note": [note: NoteListItem];
  "delete-note": [note: NoteListItem];
  "toggle-star": [path: string];
  "update:filter": [value: FilterMode];
}>();

const expandedDirs = ref(new Set<string>());

const emptyMessage = computed(() => {
  if (props.filter === "starred") return "没有收藏的笔记";
  if (props.filter === "recent") return "没有最近的笔记";
  if (props.searchQuery) return "没有匹配的笔记";
  return "还没有 Markdown 笔记";
});

interface DirNode {
  name: string;
  path: string;
  notes: NoteListItem[];
  children: DirNode[];
}

const tree = computed((): DirNode => {
  const root: DirNode = { name: "", path: "", notes: [], children: [] };

  for (const note of props.filteredNotes) {
    const segments = note.relativePath.split("/");
    let current = root;

    for (let i = 0; i < segments.length - 1; i++) {
      const dirPath = segments.slice(0, i + 1).join("/");
      let child = current.children.find((c) => c.path === dirPath);
      if (!child) {
        child = { name: segments[i]!, path: dirPath, notes: [], children: [] };
        current.children.push(child);
      }
      current = child;
    }

    current.notes.push(note);
  }

  return root;
});

function toggleDir(dirPath: string) {
  if (expandedDirs.value.has(dirPath)) {
    expandedDirs.value.delete(dirPath);
  } else {
    expandedDirs.value.add(dirPath);
  }
}

function noteDisplayName(note: NoteListItem): string {
  return note.name.replace(/\.md$/, "").replace(/\.markdown$/, "");
}

function isStarred(path: string): boolean {
  return props.starredPaths.has(path);
}

function copyPath(p: string) {
  navigator.clipboard.writeText(p);
}

const filterItems: { key: FilterMode; label: string; icon: typeof FolderOpen }[] = [
  { key: "all", label: "全部", icon: FolderOpen },
  { key: "search", label: "搜索", icon: Search },
  { key: "starred", label: "收藏", icon: Star },
  { key: "recent", label: "最近", icon: Clock },
];
</script>

<template>
  <aside class="flex h-full w-[260px] min-w-[260px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
    <!-- Row 1: Filter tabs -->
    <div class="flex shrink-0 items-center gap-0.5 border-b border-sidebar-border px-2 py-1.5">
      <button
        v-for="item in filterItems"
        :key="item.key"
        type="button"
        class="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
        :class="
          filter === item.key
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
        "
        @click="emit('update:filter', item.key)"
      >
        <component :is="item.icon" class="size-3" />
        {{ item.label }}
      </button>
    </div>

    <!-- Row 2: Action buttons -->
    <div class="flex shrink-0 items-center gap-1 border-b border-sidebar-border px-2 py-1.5">
      <button
        type="button"
        class="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        @click="emit('create-note')"
      >
        <Plus class="size-3" />
        新建文件
      </button>
      <button
        type="button"
        class="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        @click="emit('create-folder')"
      >
        <FolderPlus class="size-3" />
        新建文件夹
      </button>
    </div>

    <!-- Search (shown when filter=search) -->
    <div v-if="filter === 'search'" class="shrink-0 px-2.5 pb-2 pt-2">
      <div class="relative">
        <Search class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-sidebar-foreground/40" />
        <Input
          :model-value="searchQuery"
          placeholder="搜索笔记..."
          class="h-8 border-sidebar-border bg-sidebar/60 pl-7 text-xs shadow-none placeholder:text-sidebar-foreground/40"
          data-test="notes-search"
          @update:model-value="emit('update:searchQuery', String($event))"
        />
      </div>
    </div>

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
        <template v-for="note in tree.notes" :key="note.relativePath">
          <div
            class="group relative flex w-full min-w-0 items-center gap-1.5 rounded-sm px-2 py-1 text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            :class="activePath === note.relativePath ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/80'"
            @click="emit('open-note', note)"
          >
            <FileText class="mt-0.5 size-3.5 shrink-0" />
            <span class="min-w-0 flex-1 truncate text-sm">{{ noteDisplayName(note) }}</span>

            <button
              type="button"
              class="flex size-5 shrink-0 items-center justify-center rounded transition-opacity"
              :class="isStarred(note.relativePath) ? 'opacity-100 text-amber-500' : 'opacity-0 group-hover:opacity-60'"
              @click.stop="emit('toggle-star', note.relativePath)"
            >
              <Star v-if="isStarred(note.relativePath)" class="size-3 fill-current" />
              <Star v-else class="size-3" />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <button
                  type="button"
                  class="flex size-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100"
                  @click.stop
                >
                  <MoreHorizontal class="size-3.5" />
                </button>
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
                <DropdownMenuSeparator />
                <DropdownMenuItem @click="emit('toggle-star', note.relativePath)">
                  <Star v-if="isStarred(note.relativePath)" class="mr-2 size-3.5" />
                  <StarOff v-else class="mr-2 size-3.5" />
                  {{ isStarred(note.relativePath) ? '取消收藏' : '收藏' }}
                </DropdownMenuItem>
                <DropdownMenuItem @click="copyPath(note.relativePath)">
                  <Copy class="mr-2 size-3.5" />
                  复制路径
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </template>

        <template v-for="dir in tree.children" :key="dir.path">
          <Collapsible
            :open="expandedDirs.has(dir.path)"
            @update:open="toggleDir(dir.path)"
          >
            <CollapsibleTrigger as-child>
              <button
                type="button"
                class="flex w-full items-center gap-1 rounded-sm px-2 py-1 text-left text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              >
                <ChevronDown v-if="expandedDirs.has(dir.path)" class="size-3 shrink-0" />
                <ChevronRight v-else class="size-3 shrink-0" />
                <FolderOpen class="size-3.5 shrink-0" />
                <span class="min-w-0 flex-1 truncate text-xs font-medium">{{ dir.name }}</span>
                <span class="shrink-0 text-[10px] tabular-nums text-sidebar-foreground/40">
                  {{ dir.notes.length + dir.children.length }}
                </span>
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div class="ml-3 border-l border-sidebar-border/50 pl-1">
                <div
                  v-for="note in dir.notes"
                  :key="note.relativePath"
                  class="group relative flex w-full min-w-0 items-center gap-1.5 rounded-sm px-2 py-1 text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  :class="activePath === note.relativePath ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/80'"
                  @click="emit('open-note', note)"
                >
                  <FileText class="mt-0.5 size-3.5 shrink-0" />
                  <span class="min-w-0 flex-1 truncate text-sm">{{ noteDisplayName(note) }}</span>

                  <button
                    type="button"
                    class="flex size-5 shrink-0 items-center justify-center rounded transition-opacity"
                    :class="isStarred(note.relativePath) ? 'opacity-100 text-amber-500' : 'opacity-0 group-hover:opacity-60'"
                    @click.stop="emit('toggle-star', note.relativePath)"
                  >
                    <Star v-if="isStarred(note.relativePath)" class="size-3 fill-current" />
                    <Star v-else class="size-3" />
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <button
                        type="button"
                        class="flex size-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100"
                        @click.stop
                      >
                        <MoreHorizontal class="size-3.5" />
                      </button>
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
                      <DropdownMenuSeparator />
                      <DropdownMenuItem @click="emit('toggle-star', note.relativePath)">
                        <Star v-if="isStarred(note.relativePath)" class="mr-2 size-3.5" />
                        <StarOff v-else class="mr-2 size-3.5" />
                        {{ isStarred(note.relativePath) ? '取消收藏' : '收藏' }}
                      </DropdownMenuItem>
                      <DropdownMenuItem @click="copyPath(note.relativePath)">
                        <Copy class="mr-2 size-3.5" />
                        复制路径
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </template>
      </div>
    </ScrollArea>
  </aside>
</template>
