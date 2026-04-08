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

const getFavoritePath = (favorite: { id: string; data?: Record<string, unknown> }): string => {
  return (favorite.data?.path as string) || favorite.id;
};

const isFavorited = (path: string): boolean => {
  return fileFavorites.value.some((f) => getFavoritePath(f) === path);
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
  <div class="flex h-full flex-col overflow-hidden">
    <!-- Header -->
    <div class="border-b px-4 py-2.5 bg-muted/20">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <p class="text-[9px] font-black uppercase tracking-widest text-foreground/40">Explorer</p>
        </div>
        <button
          class="p-1 text-foreground/30 hover:text-foreground transition-colors"
          @click="refreshTree"
        >
          <RefreshCw
            class="size-3"
            :class="isDirectoryLoading(rootPath) ? 'animate-spin' : ''"
          />
        </button>
      </div>
      <p
        class="mt-2 break-all border border-muted bg-muted/10 px-2 py-1 font-mono text-[9px] text-foreground/30"
      >
        {{ rootPath || "NO_ROOT" }}
      </p>
    </div>

    <!-- Tabs -->
    <Tabs v-model="activeTab" class="flex-1 flex flex-col min-h-0">
      <TabsList class="mx-4 mt-3 h-7 w-auto grid grid-cols-2 bg-muted/30">
        <TabsTrigger value="files" class="text-[10px] font-semibold data-[state=active]:bg-background">
          文件树
        </TabsTrigger>
        <TabsTrigger value="favorites" class="text-[10px] font-semibold data-[state=active]:bg-background">
          收藏
          <span v-if="fileFavorites.length > 0" class="ml-1 text-[9px] text-muted-foreground">
            ({{ fileFavorites.length }})
          </span>
        </TabsTrigger>
      </TabsList>

      <!-- Files Tab -->
      <TabsContent value="files" class="flex-1 overflow-hidden m-0 mt-0">
        <div class="h-full overflow-auto scrollbar-thin">
          <div v-if="!rootPath" class="px-4 py-8 text-[9px] font-black uppercase text-foreground/20">
            No directory.
          </div>

          <div
            v-else-if="visibleNodes.length === 0 && isDirectoryLoading(rootPath)"
            class="flex items-center gap-3 px-4 py-8 text-[9px] font-black uppercase text-foreground/40"
          >
            <LoaderCircle class="size-3 animate-spin" />
            Loading...
          </div>

          <div
            v-else-if="fileTreeError"
            class="px-4 py-6 text-[9px] font-mono text-destructive"
          >
            {{ fileTreeError }}
          </div>

          <div v-else class="py-1">
            <button
              v-for="node in visibleNodes"
              :key="node.entry.path"
              type="button"
              class="group flex w-full items-center gap-1.5 border-l-2 border-transparent px-2 py-1.5 text-left transition-all duration-150 ease-out hover:bg-accent/60"
              :class="[
                isDirectoryExpanded(node.entry.path) ? 'border-primary/20' : '',
                isFavorited(node.entry.path) ? 'bg-amber-50/30 dark:bg-amber-950/20' : ''
              ]"
              :style="{ paddingLeft: `${node.depth * 12 + 8}px` }"
              @click="toggleDirectory(node.entry)"
            >
              <component
                :is="
                  node.entry.kind === 'directory'
                    ? isDirectoryExpanded(node.entry.path)
                      ? ChevronDown
                      : ChevronRight
                    : ChevronRight
                "
                class="size-3 shrink-0 transition-transform duration-150"
                :class="
                  node.entry.kind === 'directory'
                    ? 'text-foreground/30'
                    : 'text-transparent'
                "
              />

              <component
                :is="
                  node.entry.kind === 'directory'
                    ? isDirectoryExpanded(node.entry.path)
                      ? FolderOpen
                      : Folder
                    : FileCode2
                "
                class="size-4 shrink-0 transition-colors duration-150"
                :class="
                  node.entry.kind === 'directory'
                    ? 'text-foreground/50'
                    : 'text-foreground/70'
                "
              />

              <span
                class="min-w-0 flex-1 truncate text-[12px] font-medium tracking-tight transition-colors duration-150"
                :class="node.entry.kind === 'directory' ? 'text-foreground/70 uppercase text-[11px] font-semibold' : 'text-foreground/90'"
              >
                {{ node.entry.name }}
              </span>

              <!-- Favorite Button -->
              <button
                class="opacity-0 group-hover:opacity-100 p-1 rounded transition-all duration-150 hover:bg-accent"
                :class="isFavorited(node.entry.path) ? 'opacity-100 text-amber-500' : 'text-foreground/40 hover:text-amber-500'"
                @click="(e) => toggleFavorite(node, e)"
              >
                <component
                  :is="isFavorited(node.entry.path) ? Star : StarOff"
                  class="size-3.5"
                />
              </button>
            </button>
          </div>
        </div>
      </TabsContent>

      <!-- Favorites Tab -->
      <TabsContent value="favorites" class="flex-1 overflow-hidden m-0 mt-0">
        <div class="h-full overflow-auto scrollbar-thin px-3 py-2">
          <div v-if="!favoritesStore.isLoaded || favoritesStore.isLoading" class="flex items-center gap-3 px-4 py-8 text-[9px] font-black uppercase text-foreground/40">
            <LoaderCircle class="size-3 animate-spin" />
            Loading...
          </div>

          <div v-else-if="fileFavorites.length === 0" class="px-4 py-8 text-center">
            <Star class="size-8 mx-auto mb-3 text-foreground/20" />
            <p class="text-[11px] text-foreground/40 font-medium">暂无收藏文件</p>
            <p class="text-[9px] text-foreground/30 mt-1">在文件树中点击星标添加收藏</p>
          </div>

          <div v-else class="space-y-1">
            <button
              v-for="favorite in fileFavorites"
              :key="favorite.id"
              type="button"
              class="group w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-left transition-all duration-150 ease-out hover:bg-accent/60 border border-transparent hover:border-accent/50"
              @click="handleFavoriteClick(favorite)"
            >
              <div class="flex items-center justify-center size-8 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 shrink-0">
                <Star class="size-4" />
              </div>

              <div class="min-w-0 flex-1">
                <p class="text-[12px] font-medium text-foreground/90 truncate">
                  {{ favorite.name }}
                </p>
                <p class="text-[9px] text-foreground/40 font-mono truncate">
                  {{ getFavoritePath(favorite) }}
                </p>
              </div>

              <button
                class="opacity-0 group-hover:opacity-100 p-1.5 rounded transition-all duration-150 text-foreground/30 hover:text-destructive hover:bg-destructive/10"
                @click.stop="handleRemoveFavorite(favorite.id)"
              >
                <Trash2 class="size-3.5" />
              </button>
            </button>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>
