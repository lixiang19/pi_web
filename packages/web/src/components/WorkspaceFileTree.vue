<script setup lang="ts">
import { computed, ref, watch, onMounted } from "vue";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  Star,
  StarOff,
  Trash2,
} from "lucide-vue-next";

import { getFileTree } from "@/lib/api";
import type { FileTreeEntry } from "@/lib/types";
import { useFavoritesStore } from "@/stores/favorites";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type VisibleTreeNode = {
  entry: FileTreeEntry;
  depth: number;
};

const props = defineProps<{
  rootDir: string;
}>();

const favoritesStore = useFavoritesStore();
const activeTab = ref("files");

const childrenByDirectory = ref<Record<string, FileTreeEntry[]>>({});
const expandedDirectories = ref<string[]>([]);
const loadingDirectories = ref<string[]>([]);
const fileTreeError = ref("");
const draggedPath = ref<string | null>(null);

const normalizePath = (value: string) =>
  value.replace(/\\/g, "/").replace(/\/+$/, "");

const rootPath = computed(() => normalizePath(props.rootDir || ""));

const isDirectoryExpanded = (directoryPath: string) =>
  expandedDirectories.value.includes(directoryPath);

const isDirectoryLoading = (directoryPath: string) =>
  loadingDirectories.value.includes(directoryPath);

const setDirectoryEntries = (
  directoryPath: string,
  entries: FileTreeEntry[],
) => {
  childrenByDirectory.value = {
    ...childrenByDirectory.value,
    [directoryPath]: entries,
  };
};

const loadDirectory = async (
  directoryPath: string,
  options?: { force?: boolean },
) => {
  const normalizedDirectory = normalizePath(directoryPath);
  if (!normalizedDirectory) {
    return;
  }

  if (!options?.force && childrenByDirectory.value[normalizedDirectory]) {
    return;
  }

  if (isDirectoryLoading(normalizedDirectory)) {
    return;
  }

  loadingDirectories.value = [...loadingDirectories.value, normalizedDirectory];
  fileTreeError.value = "";

  try {
    const payload = await getFileTree(
      normalizedDirectory,
      rootPath.value || normalizedDirectory,
    );
    setDirectoryEntries(normalizedDirectory, payload.entries);
  } catch (caughtError) {
    fileTreeError.value =
      caughtError instanceof Error ? caughtError.message : String(caughtError);
  } finally {
    loadingDirectories.value = loadingDirectories.value.filter(
      (path) => path !== normalizedDirectory,
    );
  }
};

const toggleDirectory = async (entry: FileTreeEntry) => {
  if (entry.kind !== "directory") {
    return;
  }

  if (isDirectoryExpanded(entry.path)) {
    expandedDirectories.value = expandedDirectories.value.filter(
      (path) => path !== entry.path,
    );
    return;
  }

  expandedDirectories.value = [...expandedDirectories.value, entry.path];
  await loadDirectory(entry.path);
};

const expandToPath = async (targetPath: string) => {
  const normalizedTarget = normalizePath(targetPath);
  if (!normalizedTarget || !rootPath.value) return;

  const parts = normalizedTarget.replace(rootPath.value, "").split("/").filter(Boolean);
  let currentPath = rootPath.value;

  for (const part of parts.slice(0, -1)) {
    currentPath = `${currentPath}/${part}`;
    if (!isDirectoryExpanded(currentPath)) {
      expandedDirectories.value = [...expandedDirectories.value, currentPath];
      await loadDirectory(currentPath);
    }
  }

  activeTab.value = "files";
};

const visibleNodes = computed<VisibleTreeNode[]>(() => {
  const root = rootPath.value;
  if (!root) {
    return [];
  }

  const flatten = (directoryPath: string, depth: number): VisibleTreeNode[] => {
    const entries = childrenByDirectory.value[directoryPath] ?? [];
    const nodes: VisibleTreeNode[] = [];

    for (const entry of entries) {
      nodes.push({ entry, depth });

      if (entry.kind === "directory" && isDirectoryExpanded(entry.path)) {
        nodes.push(...flatten(entry.path, depth + 1));
      }
    }

    return nodes;
  };

  return flatten(root, 0);
});

const fileFavorites = computed(() => {
  return favoritesStore.itemsByType.get("file") ?? [];
});

const getFavoritePath = (favorite: {
  id: string;
  data?: Record<string, unknown>;
}): string => {
  const favoritePath = favorite.data?.["path"];
  return typeof favoritePath === "string" ? favoritePath : favorite.id;
};

const isFavorited = (path: string): boolean => {
  return fileFavorites.value.some((f) => getFavoritePath(f) === path);
};

const handleDragStart = (event: DragEvent, entry: FileTreeEntry) => {
  event.dataTransfer?.setData('text/plain', entry.path);
  event.dataTransfer?.setData('application/json', JSON.stringify(entry));
  event.dataTransfer!.effectAllowed = 'copy';
  draggedPath.value = entry.path;
};

const handleDragEnd = () => {
  draggedPath.value = null;
};

const toggleFavorite = async (node: VisibleTreeNode, event: MouseEvent) => {
  event.stopPropagation();

  const path = node.entry.path;
  const isCurrentlyFavorited = isFavorited(path);

  if (isCurrentlyFavorited) {
    await favoritesStore.remove(path);
  } else {
    await favoritesStore.add({
      id: path,
      type: "file",
      name: node.entry.name,
      data: { path, kind: node.entry.kind },
    });
  }
};

const handleRemoveFavorite = async (id: string) => {
  await favoritesStore.remove(id);
};

const handleFavoriteClick = async (favorite: { id: string; data?: Record<string, unknown> }) => {
  const path = getFavoritePath(favorite);
  if (path) {
    await expandToPath(path);
  }
};

const refreshTree = async () => {
  const root = rootPath.value;
  if (!root) {
    return;
  }

  childrenByDirectory.value = {};
  expandedDirectories.value = [root];
  await loadDirectory(root, { force: true });
};

watch(
  rootPath,
  async (nextRoot) => {
    if (!nextRoot) {
      childrenByDirectory.value = {};
      expandedDirectories.value = [];
      fileTreeError.value = "";
      return;
    }

    childrenByDirectory.value = {};
    expandedDirectories.value = [nextRoot];
    await loadDirectory(nextRoot, { force: true });
  },
  { immediate: true },
);

onMounted(() => {
  if (!favoritesStore.isLoaded) {
    favoritesStore.load();
  }
});
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden bg-background">
    <!-- Header -->
    <div class="border-b px-3 py-2.5 bg-muted/30">
      <div class="flex items-center justify-between gap-2">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Explorer
        </span>
        <button
          class="flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200"
          @click="refreshTree"
        >
          <RefreshCw
            class="size-3.5"
            :class="isDirectoryLoading(rootPath) ? 'animate-spin' : ''"
          />
        </button>
      </div>
      <p class="mt-2 break-all rounded bg-muted/50 px-2 py-1.5 font-mono text-[10px] text-muted-foreground border border-border/50">
        {{ rootPath || "NO_ROOT" }}
      </p>
    </div>

    <!-- Tabs -->
    <Tabs v-model="activeTab" class="flex-1 flex flex-col min-h-0">
      <TabsList class="mx-3 mt-2 h-8 w-auto grid grid-cols-2 bg-muted/50 p-0.5">
        <TabsTrigger value="files" class="text-xs font-medium rounded data-[state=active]:bg-background data-[state=active]:shadow-sm">
          文件树
        </TabsTrigger>
        <TabsTrigger value="favorites" class="text-xs font-medium rounded data-[state=active]:bg-background data-[state=active]:shadow-sm">
          收藏
          <span v-if="fileFavorites.length > 0" class="ml-1.5 text-[10px] text-muted-foreground tabular-nums">
            {{ fileFavorites.length }}
          </span>
        </TabsTrigger>
      </TabsList>

      <!-- Files Tab -->
      <TabsContent value="files" class="flex-1 overflow-hidden m-0 mt-0">
        <div class="h-full overflow-auto scrollbar-thin">
          <!-- Empty States -->
          <div v-if="!rootPath" class="px-4 py-12 text-center">
            <Folder class="size-10 mx-auto mb-3 text-muted-foreground/30" />
            <p class="text-xs text-muted-foreground font-medium">未选择目录</p>
          </div>

          <div
            v-else-if="visibleNodes.length === 0 && isDirectoryLoading(rootPath)"
            class="flex flex-col items-center gap-3 px-4 py-12"
          >
            <LoaderCircle class="size-6 animate-spin text-primary" />
            <p class="text-xs text-muted-foreground">加载中...</p>
          </div>

          <div
            v-else-if="fileTreeError"
            class="mx-3 mt-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-3"
          >
            <p class="text-xs text-destructive font-medium">{{ fileTreeError }}</p>
          </div>

          <!-- File Tree -->
          <div v-else class="py-2">
            <div
              v-for="node in visibleNodes"
              :key="node.entry.path"
              draggable="true"
              class="group relative transition-all duration-200 ease-out hover:bg-accent/50 cursor-grab active:cursor-grabbing"
              :class="[
                isDirectoryExpanded(node.entry.path) && node.entry.kind === 'directory'
                  ? 'bg-accent/30'
                  : '',
                isFavorited(node.entry.path)
                  ? 'bg-amber-500/5 dark:bg-amber-500/10'
                  : '',
                draggedPath === node.entry.path
                  ? 'opacity-50'
                  : ''
              ]"
              @dragstart="handleDragStart($event, node.entry)"
              @dragend="handleDragEnd"
            >
              <!-- Selection Indicator -->
              <div
                v-if="isDirectoryExpanded(node.entry.path) && node.entry.kind === 'directory'"
                class="absolute left-0 top-0 bottom-0 w-0.5 bg-primary/60"
              />

              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-1.5 pr-10 text-left"
                :style="{ paddingLeft: `${node.depth * 14 + 12}px` }"
                @click="toggleDirectory(node.entry)"
              >
                <!-- Expand Icon -->
                <component
                  :is="node.entry.kind === 'directory'
                      ? isDirectoryExpanded(node.entry.path) ? ChevronDown : ChevronRight
                      : ChevronRight"
                  class="size-4 shrink-0 transition-transform duration-200"
                  :class="node.entry.kind === 'directory' ? 'text-muted-foreground' : 'text-transparent'"
                />

                <!-- File/Folder Icon -->
                <component
                  :is="node.entry.kind === 'directory'
                      ? isDirectoryExpanded(node.entry.path) ? FolderOpen : Folder
                      : FileCode2"
                  class="size-4 shrink-0 transition-colors duration-200"
                  :class="node.entry.kind === 'directory'
                      ? 'text-muted-foreground group-hover:text-foreground'
                      : 'text-foreground/70 group-hover:text-foreground'"
                />

                <!-- Name -->
                <span
                  class="min-w-0 flex-1 truncate text-sm transition-colors duration-200"
                  :class="node.entry.kind === 'directory'
                      ? 'text-foreground/80 font-medium uppercase text-xs tracking-wide group-hover:text-foreground'
                      : 'text-foreground group-hover:text-foreground'"
                >
                  {{ node.entry.name }}
                </span>
              </button>

              <!-- Favorite Button -->
              <button
                type="button"
                class="absolute right-3 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md opacity-0 transition-all duration-200 hover:bg-accent group-hover:opacity-100"
                :class="isFavorited(node.entry.path)
                    ? 'opacity-100 text-amber-500'
                    : 'text-muted-foreground hover:text-amber-500'"
                @click="(e) => toggleFavorite(node, e)"
              >
                <component
                  :is="isFavorited(node.entry.path) ? Star : StarOff"
                  class="size-4"
                />
              </button>
            </div>
          </div>
        </div>
      </TabsContent>

      <!-- Favorites Tab -->
      <TabsContent value="favorites" class="flex-1 overflow-hidden m-0 mt-0">
        <div class="h-full overflow-auto scrollbar-thin px-3 py-3">
          <!-- Loading State -->
          <div v-if="!favoritesStore.isLoaded || favoritesStore.isLoading" class="flex flex-col items-center gap-3 py-12">
            <LoaderCircle class="size-6 animate-spin text-primary" />
            <p class="text-xs text-muted-foreground">加载中...</p>
          </div>

          <!-- Empty State -->
          <div v-else-if="fileFavorites.length === 0" class="flex flex-col items-center py-12">
            <div class="flex items-center justify-center size-12 rounded-full bg-muted mb-4">
              <Star class="size-6 text-muted-foreground/50" />
            </div>
            <p class="text-sm font-medium text-foreground">暂无收藏</p>
            <p class="text-xs text-muted-foreground mt-1">在文件树中点击星标添加</p>
          </div>

          <!-- Favorites List -->
          <div v-else class="space-y-1.5">
            <div
              v-for="favorite in fileFavorites"
              :key="favorite.id"
              class="group relative w-full rounded-lg border border-transparent transition-all duration-200 ease-out hover:border-accent hover:bg-accent/50"
            >
              <button
                type="button"
                class="flex w-full items-center gap-3 px-3 py-2.5 pr-12 text-left"
                @click="handleFavoriteClick(favorite)"
              >
                <!-- Icon Container -->
                <div class="flex items-center justify-center size-9 rounded-lg bg-amber-100 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 shrink-0 transition-transform duration-200 group-hover:scale-105">
                  <Star class="size-4.5" />
                </div>

                <!-- Info -->
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-foreground truncate">
                    {{ favorite.name }}
                  </p>
                  <p class="text-xs text-muted-foreground font-mono truncate">
                    {{ getFavoritePath(favorite) }}
                  </p>
                </div>
              </button>

              <!-- Remove Button -->
              <button
                type="button"
                class="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md opacity-0 transition-all duration-200 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                @click="handleRemoveFavorite(favorite.id)"
              >
                <Trash2 class="size-4" />
              </button>
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>
