<script setup lang="ts">
import { computed, ref } from "vue";
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
} from "lucide-vue-next";

import type { VisibleTreeNode } from "@/composables/useFileTreeData";
import { useFavoritesStore } from "@/stores/favorites";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

defineProps<{
	/** 面板标题 */
	title: string;
	/** 扁平化可见节点列表 */
	nodes: VisibleTreeNode[];
	/** 根路径是否加载中 */
	isRootLoading: boolean;
	/** 错误信息 */
	error: string;
	/** 目录是否已展开 */
	isExpanded: (path: string) => boolean;
	/** 目录是否加载中 */
	isLoading: (path: string) => boolean;
}>();

const emit = defineEmits<{
	(e: "select", entry: import("@/lib/types").FileTreeEntry): void;
	(e: "toggle-expand", entry: import("@/lib/types").FileTreeEntry): void;
	(e: "toggle-favorite", path: string): void;
	(e: "refresh"): void;
}>();

const favoritesStore = useFavoritesStore();
const activeTab = ref("files");

const fileFavorites = computed(
	() => favoritesStore.itemsByType.get("file") ?? [],
);

const getFavoritePath = (favorite: {
	id: string;
	data?: Record<string, unknown>;
}): string => {
	const favoritePath = favorite.data?.["path"];
	return typeof favoritePath === "string" ? favoritePath : favorite.id;
};

const isFavorited = (path: string): boolean =>
	fileFavorites.value.some((f) => getFavoritePath(f) === path);
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden bg-background">
    <!-- Header -->
    <div class="ridge-panel-header px-3 py-2.5">
      <div class="flex items-center justify-between gap-2">
        <span
          class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {{ title }}
        </span>
        <button
          class="flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200"
          @click="emit('refresh')"
        >
          <RefreshCw
            class="size-3.5"
            :class="isRootLoading ? 'animate-spin' : ''"
          />
        </button>
      </div>
    </div>

    <!-- Tabs: 文件树 / 收藏 -->
    <Tabs v-model="activeTab" class="flex-1 flex flex-col min-h-0">
      <TabsList
        class="mx-3 mt-2 h-8 w-auto grid grid-cols-2 border border-border/50 bg-transparent p-0.5"
      >
        <TabsTrigger
          value="files"
          class="text-xs font-medium rounded data-[state=active]:bg-background data-[state=active]:shadow-sm"
        >
          文件树
        </TabsTrigger>
        <TabsTrigger
          value="favorites"
          class="text-xs font-medium rounded data-[state=active]:bg-background data-[state=active]:shadow-sm"
        >
          收藏
          <span
            v-if="fileFavorites.length > 0"
            class="ml-1.5 text-[10px] text-muted-foreground tabular-nums"
          >
            {{ fileFavorites.length }}
          </span>
        </TabsTrigger>
      </TabsList>

      <!-- Files Tab -->
      <TabsContent value="files" class="flex-1 overflow-hidden m-0 mt-0">
        <ScrollArea class="h-full">
          <!-- Loading -->
          <div
            v-if="nodes.length === 0 && isRootLoading"
            class="flex flex-col items-center gap-3 px-4 py-12"
          >
            <LoaderCircle class="size-6 animate-spin text-primary" />
            <p class="text-xs text-muted-foreground">加载中...</p>
          </div>

          <!-- Error -->
          <div
            v-else-if="error"
            class="mx-3 mt-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-3"
          >
            <p class="text-xs text-destructive font-medium">{{ error }}</p>
          </div>

          <!-- Tree -->
          <div v-else class="py-2">
            <div
              v-for="node in nodes"
              :key="node.entry.path"
              class="group relative transition-all duration-200 ease-out hover:bg-accent/50"
              :class="[
                node.entry.kind === 'file'
                  ? 'cursor-pointer'
                  : 'cursor-grab active:cursor-grabbing',
                isExpanded(node.entry.path) && node.entry.kind === 'directory'
                  ? 'bg-accent/30'
                  : '',
                isFavorited(node.entry.path)
                  ? 'bg-amber-500/5 dark:bg-amber-500/10'
                  : '',
              ]"
            >
              <!-- Selection Indicator -->
              <div
                v-if="
                  isExpanded(node.entry.path) &&
                  node.entry.kind === 'directory'
                "
                class="absolute left-0 top-0 bottom-0 w-0.5 bg-primary/60"
              />

              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-1.5 pr-10 text-left"
                :style="{ paddingLeft: `${node.depth * 14 + 12}px` }"
                @click="
                  node.entry.kind === 'directory'
                    ? emit('toggle-expand', node.entry)
                    : emit('select', node.entry)
                "
              >
                <!-- Expand Icon -->
                <component
                  :is="
                    node.entry.kind === 'directory'
                      ? isExpanded(node.entry.path)
                        ? ChevronDown
                        : ChevronRight
                      : ChevronRight
                  "
                  class="size-4 shrink-0 transition-transform duration-200"
                  :class="
                    node.entry.kind === 'directory'
                      ? 'text-muted-foreground'
                      : 'text-transparent'
                  "
                />

                <!-- File/Folder Icon -->
                <component
                  :is="
                    node.entry.kind === 'directory'
                      ? isExpanded(node.entry.path)
                        ? FolderOpen
                        : Folder
                      : FileCode2
                  "
                  class="size-4 shrink-0 transition-colors duration-200"
                  :class="
                    node.entry.kind === 'directory'
                      ? 'text-muted-foreground group-hover:text-foreground'
                      : 'text-foreground/70 group-hover:text-foreground'
                  "
                />

                <!-- Name -->
                <span
                  class="min-w-0 flex-1 truncate text-sm transition-colors duration-200"
                  :class="
                    node.entry.kind === 'directory'
                      ? 'text-foreground/80 font-medium uppercase text-xs tracking-wide group-hover:text-foreground'
                      : 'text-foreground group-hover:text-foreground'
                  "
                >
                  {{ node.entry.name }}
                </span>
              </button>

              <!-- Favorite Button -->
              <button
                type="button"
                class="absolute right-3 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md opacity-0 transition-all duration-200 hover:bg-accent group-hover:opacity-100"
                :class="
                  isFavorited(node.entry.path)
                    ? 'opacity-100 text-amber-500'
                    : 'text-muted-foreground hover:text-amber-500'
                "
                @click.stop="emit('toggle-favorite', node.entry.path)"
              >
                <component
                  :is="isFavorited(node.entry.path) ? Star : StarOff"
                  class="size-4"
                />
              </button>
            </div>
          </div>
        </ScrollArea>
      </TabsContent>

      <!-- Favorites Tab -->
      <TabsContent value="favorites" class="flex-1 overflow-hidden m-0 mt-0">
        <ScrollArea class="h-full px-3 py-3">
          <!-- Empty State -->
          <div
            v-if="fileFavorites.length === 0"
            class="flex flex-col items-center py-12"
          >
            <div
              class="flex items-center justify-center size-12 rounded-full bg-muted mb-4"
            >
              <Star class="size-6 text-muted-foreground/50" />
            </div>
            <p class="text-sm font-medium text-foreground">暂无收藏</p>
            <p class="text-xs text-muted-foreground mt-1">
              在文件树中点击星标添加
            </p>
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
                @click="emit('select', { path: getFavoritePath(favorite), name: favorite.name, kind: 'file' } as any)"
              >
                <div
                  class="flex items-center justify-center size-9 rounded-lg bg-amber-100 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 shrink-0 transition-transform duration-200 group-hover:scale-105"
                >
                  <Star class="size-4.5" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-foreground truncate">
                    {{ favorite.name }}
                  </p>
                  <p
                    class="text-xs text-muted-foreground font-mono truncate"
                  >
                    {{ getFavoritePath(favorite) }}
                  </p>
                </div>
              </button>
            </div>
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  </div>
</template>

