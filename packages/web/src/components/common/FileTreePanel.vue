<script setup lang="ts">
import { computed, nextTick, ref, watch, type ComponentPublicInstance } from "vue";
import {
	ChevronDown,
	ChevronRight,
	Clock,
	Edit3,
	Folder,
	FolderTree,
	LoaderCircle,
	Plus,
	RefreshCw,
	Search,
	Star,
	StarOff,
	Trash2,
} from "lucide-vue-next";

import type { VisibleTreeNode } from "@/composables/useFileTreeData";
import { fileIconByExtension, folderIcon } from "@/composables/useFileIcons";
import { useFavoritesStore } from "@/stores/favorites";
import { searchFiles, type RecentFileItem } from "@/lib/api";
import type { FileTreeEntry } from "@/lib/types";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const props = defineProps<{
	nodes: VisibleTreeNode[];
	isRootLoading: boolean;
	error: string;
	isExpanded: (path: string) => boolean;
	isLoading: (path: string) => boolean;
	recentFiles?: RecentFileItem[];
	isRecentLoading?: boolean;
	rootPath?: string;
}>();

const emit = defineEmits<{
	(e: "select", entry: FileTreeEntry): void;
	(e: "toggle-expand", entry: FileTreeEntry): void;
	(e: "toggle-favorite", path: string): void;
	(e: "refresh"): void;
	(e: "search", query: string): void;
	(e: "rename", payload: { oldPath: string; newName: string }): void;
	(e: "delete", entry: FileTreeEntry): void;
	(e: "create-folder", payload: { parentPath: string; name: string }): void;
}>();

// --- stores ---
const favoritesStore = useFavoritesStore();

// --- tab state ---
const activeTab = ref("files");
const searchQuery = ref("");
const searchResults = ref<VisibleTreeNode[]>([]);
const searchLoading = ref(false);
let searchTimer: ReturnType<typeof setTimeout>;

// --- inline editing ---
const editingPath = ref<string | null>(null);
const editingName = ref("");
const editingInput = ref<HTMLInputElement | null>(null);
function setEditingInputRef(el: Element | ComponentPublicInstance | null) {
	editingInput.value = el instanceof HTMLInputElement ? el : null;
}

const creatingFolderPath = ref<string | null>(null);
const creatingFolderName = ref("");
const creatingFolderInput = ref<HTMLInputElement | null>(null);
function setCreatingFolderInputRef(el: Element | ComponentPublicInstance | null) {
	creatingFolderInput.value = el instanceof HTMLInputElement ? el : null;
}

// --- delete confirmation ---
const deleteTarget = ref<FileTreeEntry | null>(null);

// --- computed ---

const fileFavorites = computed(() => favoritesStore.itemsByType.get("file") ?? []);

const getFavoritePath = (favorite: { id: string; data?: Record<string, unknown> }): string => {
	const path = favorite.data?.["path"];
	return typeof path === "string" ? path : favorite.id;
};

const isFavorited = (path: string): boolean =>
	fileFavorites.value.some((f) => getFavoritePath(f) === path);

interface DisplayNode extends VisibleTreeNode {
	isNewFolderPlaceholder?: boolean;
}

const displayNodes = computed<DisplayNode[]>(() => {
	const items: DisplayNode[] = props.nodes.map((n) => ({ ...n }));
	if (!creatingFolderPath.value) return items;

	let insertIdx = -1;
	let parentDepth = -1;

	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (item?.entry.path === creatingFolderPath.value) {
			parentDepth = item.depth;
			insertIdx = i + 1;
			while (true) {
				const nextItem = items[insertIdx];
				if (!nextItem || nextItem.depth <= parentDepth) break;
				insertIdx++;
			}
			break;
		}
	}

	if (insertIdx >= 0) {
		items.splice(insertIdx, 0, {
			entry: {
				path: `${creatingFolderPath.value}/.`,
				name: "",
				kind: "directory",
				relativePath: ".",
				size: null,
				modifiedAt: 0,
				extension: "",
			},
			depth: parentDepth + 1,
			isNewFolderPlaceholder: true,
		});
	}
	return items;
});

const getEntryIcon = (entry: FileTreeEntry) => {
	if (entry.kind === "directory") return folderIcon(props.isExpanded(entry.path));
	const dot = entry.name.lastIndexOf(".");
	const ext = dot >= 0 ? entry.name.slice(dot) : "";
	return fileIconByExtension(ext);
};

// --- search ---
watch(searchQuery, (q) => {
	const query = q.trim();
	if (!query) {
		searchResults.value = [];
		return;
	}
	clearTimeout(searchTimer);
	searchTimer = setTimeout(async () => {
		if (!props.rootPath) return;
		searchLoading.value = true;
		try {
			const { entries } = await searchFiles(props.rootPath, query);
			searchResults.value = entries.map((entry) => ({ entry, depth: 0 }));
		} catch (err) {
			console.error("Search failed", err);
		} finally {
			searchLoading.value = false;
		}
	}, 300);
});

// --- inline editing ---

function startRename(entry: FileTreeEntry) {
	editingPath.value = entry.path;
	editingName.value = entry.name;
	nextTick(() => {
		editingInput.value?.focus();
		const dot = entry.name.lastIndexOf(".");
		if (entry.kind === "file" && dot > 0) {
			editingInput.value?.setSelectionRange(0, dot);
		} else {
			editingInput.value?.select();
		}
	});
}

function cancelRename() {
	editingPath.value = null;
	editingName.value = "";
}

function confirmRename() {
	if (editingPath.value && editingName.value.trim()) {
		emit("rename", { oldPath: editingPath.value, newName: editingName.value.trim() });
	}
	cancelRename();
}

function onRenameKeydown(e: KeyboardEvent) {
	if (e.key === "Enter") confirmRename();
	else if (e.key === "Escape") cancelRename();
}

function startCreateFolder(parentPath: string) {
	creatingFolderPath.value = parentPath;
	creatingFolderName.value = "";
	nextTick(() => {
		creatingFolderInput.value?.focus();
	});
}

function cancelCreateFolder() {
	creatingFolderPath.value = null;
	creatingFolderName.value = "";
}

function confirmCreateFolder() {
	if (creatingFolderPath.value && creatingFolderName.value.trim()) {
		emit("create-folder", { parentPath: creatingFolderPath.value, name: creatingFolderName.value.trim() });
	}
	cancelCreateFolder();
}

function onCreateFolderKeydown(e: KeyboardEvent) {
	if (e.key === "Enter") confirmCreateFolder();
	else if (e.key === "Escape") cancelCreateFolder();
}

// --- context menu handlers ---

function handleRename(entry: FileTreeEntry) {
	startRename(entry);
}

function handleDelete(entry: FileTreeEntry) {
	deleteTarget.value = entry;
}

function handleCreateFolder(entry: FileTreeEntry) {
	startCreateFolder(entry.path);
}

function handleToggleFavorite(entry: FileTreeEntry) {
	emit("toggle-favorite", entry.path);
}

// --- delete dialog ---

function onDeleteDialogOpenChange(open: boolean) {
	if (!open) deleteTarget.value = null;
}

function confirmDelete() {
	if (deleteTarget.value) {
		emit("delete", deleteTarget.value);
	}
	deleteTarget.value = null;
}

// --- expose ---

defineExpose({ startRename, startCreateFolder, handleDelete });
</script>

<template>
  <div class="flex flex-1 min-h-0 flex-col overflow-hidden bg-background">
    <Tabs v-model="activeTab" class="flex-1 flex flex-col min-h-0">
      <TabsList class="mx-3 mt-2 h-8 w-auto grid grid-cols-4 border border-border/50 bg-transparent p-0.5">
        <TabsTrigger value="files" class="rounded data-[state=active]:bg-background data-[state=active]:shadow-sm">
          <FolderTree class="size-3.5" />
        </TabsTrigger>
        <TabsTrigger value="favorites" class="rounded data-[state=active]:bg-background data-[state=active]:shadow-sm">
          <Star class="size-3.5" />
        </TabsTrigger>
        <TabsTrigger value="search" class="rounded data-[state=active]:bg-background data-[state=active]:shadow-sm">
          <Search class="size-3.5" />
        </TabsTrigger>
        <TabsTrigger value="recent" class="rounded data-[state=active]:bg-background data-[state=active]:shadow-sm">
          <Clock class="size-3.5" />
        </TabsTrigger>
      </TabsList>

      <!-- ===== Files Tab ===== -->
      <TabsContent value="files" class="flex-1 overflow-hidden m-0 mt-0">
        <div class="flex items-center justify-end px-3 pt-2">
          <button
            class="flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200"
            @click="emit('refresh')"
          >
            <RefreshCw class="size-3.5" :class="isRootLoading ? 'animate-spin' : ''" />
          </button>
        </div>
        <ScrollArea class="h-full">
          <!-- Loading -->
          <div v-if="nodes.length === 0 && isRootLoading" class="flex flex-col items-center gap-3 px-4 py-12">
            <LoaderCircle class="size-6 animate-spin text-primary" />
            <p class="text-xs text-muted-foreground">加载中...</p>
          </div>
          <!-- Error -->
          <div v-else-if="error" class="mx-3 mt-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-3">
            <p class="text-xs text-destructive font-medium">{{ error }}</p>
          </div>
          <!-- Tree -->
          <div v-else class="py-2">
            <div v-for="node in displayNodes" :key="node.isNewFolderPlaceholder ? 'new-folder-' + node.entry.path : node.entry.path">
              <!-- 👇 New folder inline input -->
              <template v-if="node.isNewFolderPlaceholder">
                <div
                  class="flex items-center gap-2 px-3 py-1.5"
                  :style="{ paddingLeft: `${node.depth * 14 + 12}px` }"
                >
                  <Folder class="size-4 shrink-0 text-muted-foreground" />
                  <input
                    :ref="setCreatingFolderInputRef"
                    v-model="creatingFolderName"
                    placeholder="文件夹名称"
                    class="min-w-0 flex-1 h-6 rounded border border-primary/50 bg-background px-1.5 text-xs outline-none"
                    @keydown="onCreateFolderKeydown"
                    @blur="confirmCreateFolder"
                  />
                </div>
              </template>

              <!-- 👇 Normal node -->
              <ContextMenu v-else>
                <ContextMenuTrigger as-child>
                  <div
                    class="group relative transition-all duration-200 ease-out hover:bg-accent/50"
                    :class="[
                      node.entry.kind === 'file' ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
                      isExpanded(node.entry.path) && node.entry.kind === 'directory' ? 'bg-accent/30' : '',
                      isFavorited(node.entry.path) ? 'bg-amber-500/5 dark:bg-amber-500/10' : '',
                    ]"
                  >
                    <!-- Selection indicator -->
                    <div
                      v-if="isExpanded(node.entry.path) && node.entry.kind === 'directory'"
                      class="absolute left-0 top-0 bottom-0 w-0.5 bg-primary/60"
                    />

                    <button
                      type="button"
                      class="flex w-full items-center gap-2 px-3 py-1.5 pr-24 text-left"
                      :style="{ paddingLeft: `${node.depth * 14 + 12}px` }"
                      @click="
                        node.entry.kind === 'directory'
                          ? emit('toggle-expand', node.entry)
                          : emit('select', node.entry)
                      "
                    >
                      <!-- Expand icon -->
                      <component
                        :is="node.entry.kind === 'directory'
                          ? isExpanded(node.entry.path) ? ChevronDown : ChevronRight
                          : ChevronRight"
                        class="size-4 shrink-0 transition-transform duration-200"
                        :class="node.entry.kind === 'directory' ? 'text-muted-foreground' : 'text-transparent'"
                      />

                      <!-- File/Folder icon -->
                      <component
                        :is="getEntryIcon(node.entry)"
                        class="size-4 shrink-0 transition-colors duration-200"
                        :class="node.entry.kind === 'directory'
                          ? 'text-muted-foreground group-hover:text-foreground'
                          : 'text-foreground/70 group-hover:text-foreground'"
                      />

                      <!-- Name or rename input -->
                      <template v-if="editingPath === node.entry.path">
                        <input
                          :ref="setEditingInputRef"
                          v-model="editingName"
                          class="min-w-0 flex-1 h-6 rounded border border-primary/50 bg-background px-1.5 text-xs outline-none"
                          @keydown="onRenameKeydown"
                          @blur="confirmRename"
                          @click.stop
                        />
                      </template>
                      <template v-else>
                        <span
                          class="min-w-0 flex-1 truncate text-sm transition-colors duration-200"
                          :class="node.entry.kind === 'directory'
                            ? 'text-foreground/80 font-medium uppercase text-xs tracking-wide group-hover:text-foreground'
                            : 'text-foreground group-hover:text-foreground'"
                        >
                          {{ node.entry.name }}
                        </span>
                      </template>
                    </button>

                    <!-- Loading indicator (expanding directory) -->
                    <div
                      v-if="node.entry.kind === 'directory' && isExpanded(node.entry.path) && isLoading(node.entry.path)"
                      class="absolute right-12 top-1/2 -translate-y-1/2"
                    >
                      <LoaderCircle class="size-3.5 animate-spin text-muted-foreground" />
                    </div>

                    <!-- Favorite button -->
                    <button
                      type="button"
                      class="absolute right-3 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md opacity-0 transition-all duration-200 hover:bg-accent group-hover:opacity-100"
                      :class="isFavorited(node.entry.path)
                        ? 'opacity-100 text-amber-500'
                        : 'text-muted-foreground hover:text-amber-500'"
                      @click.stop="emit('toggle-favorite', node.entry.path)"
                    >
                      <component :is="isFavorited(node.entry.path) ? Star : StarOff" class="size-4" />
                    </button>

                    <!-- Empty directory hint (rendered below the button) -->
                    <div
                      v-if="
                        node.entry.kind === 'directory' &&
                        isExpanded(node.entry.path) &&
                        !isLoading(node.entry.path) &&
                        !props.nodes.some(
                          (n) =>
                            n.entry.path !== node.entry.path &&
                            n.entry.path.startsWith(node.entry.path + '/') &&
                            n.depth > node.depth,
                        )
                      "
                      class="pb-1 pl-10 text-[10px] text-muted-foreground/50 italic"
                      :style="{ paddingLeft: `${(node.depth + 1) * 14 + 12}px` }"
                    >
                      空文件夹
                    </div>
                  </div>
                </ContextMenuTrigger>

                <!-- Context menu content -->
                <ContextMenuContent>
                  <ContextMenuItem v-if="node.entry.kind === 'directory'" @click="handleCreateFolder(node.entry)">
                    <Plus class="size-4" />
                    新建文件夹
                  </ContextMenuItem>
                  <ContextMenuItem @click="handleRename(node.entry)">
                    <Edit3 class="size-4" />
                    重命名
                  </ContextMenuItem>
                  <ContextMenuItem variant="destructive" @click="handleDelete(node.entry)">
                    <Trash2 class="size-4" />
                    删除
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem v-if="node.entry.kind === 'file'" @click="handleToggleFavorite(node.entry)">
                    <component :is="isFavorited(node.entry.path) ? Star : StarOff" class="size-4" />
                    {{ isFavorited(node.entry.path) ? "取消收藏" : "收藏" }}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </div>
          </div>
        </ScrollArea>
      </TabsContent>

      <!-- ===== Favorites Tab ===== -->
      <TabsContent value="favorites" class="flex-1 overflow-hidden m-0 mt-0">
        <ScrollArea class="h-full px-3 py-3">
          <div v-if="fileFavorites.length === 0" class="flex flex-col items-center py-12">
            <div class="flex items-center justify-center size-12 rounded-full bg-muted mb-4">
              <Star class="size-6 text-muted-foreground/50" />
            </div>
            <p class="text-sm font-medium text-foreground">暂无收藏</p>
            <p class="text-xs text-muted-foreground mt-1">在文件树中点击星标添加</p>
          </div>
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
                  <p class="text-sm font-medium text-foreground truncate">{{ favorite.name }}</p>
                  <p class="text-xs text-muted-foreground font-mono truncate">{{ getFavoritePath(favorite) }}</p>
                </div>
              </button>
            </div>
          </div>
        </ScrollArea>
      </TabsContent>

      <!-- ===== Search Tab ===== -->
      <TabsContent value="search" class="flex-1 overflow-hidden m-0 mt-0">
        <div class="flex h-full flex-col">
          <div class="shrink-0 px-3 pt-3 pb-2">
            <div class="flex h-8 items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 text-muted-foreground">
              <Search class="size-3.5" />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="搜索文件..."
                class="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
          <ScrollArea class="flex-1">
            <div v-if="!searchQuery.trim()" class="px-4 py-8 text-center">
              <p class="text-xs text-muted-foreground/50">输入关键词搜索文件</p>
            </div>
            <div v-else-if="searchResults.length === 0" class="px-4 py-8 text-center">
              <p class="text-xs text-muted-foreground/50">未找到匹配文件</p>
            </div>
            <div v-else-if="searchLoading" class="flex items-center justify-center py-8">
              <LoaderCircle class="size-4 animate-spin text-muted-foreground" />
            </div>
            <div v-else class="py-2">
              <div
                v-for="node in searchResults"
                :key="node.entry.path"
                class="group flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-accent/50 transition-colors"
                @click="emit('select', node.entry)"
              >
                <component
                  :is="getEntryIcon(node.entry)"
                  class="size-4 shrink-0 text-foreground/70"
                />
                <span class="min-w-0 flex-1 truncate text-sm">{{ node.entry.name }}</span>
              </div>
            </div>
          </ScrollArea>
        </div>
      </TabsContent>

      <!-- ===== Recent Tab ===== -->
      <TabsContent value="recent" class="flex-1 overflow-hidden m-0 mt-0">
        <ScrollArea class="h-full">
          <div v-if="isRecentLoading" class="flex items-center justify-center py-12">
            <LoaderCircle class="size-5 animate-spin text-muted-foreground" />
          </div>
          <div v-else-if="!recentFiles?.length" class="px-4 py-8 text-center">
            <p class="text-xs text-muted-foreground/50">暂无最近文件</p>
          </div>
          <div v-else class="py-2">
            <div
              v-for="file in recentFiles"
              :key="file.path"
              class="group flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-accent/50 transition-colors"
              @click="emit('select', { path: file.path, name: file.name, kind: 'file' } as any)"
            >
              <Clock class="size-4 shrink-0 text-muted-foreground" />
              <div class="min-w-0 flex-1">
                <span class="block truncate text-sm">{{ file.name }}</span>
                <span class="block truncate text-[10px] text-muted-foreground font-mono">{{ file.relativePath }}</span>
              </div>
            </div>
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>

    <!-- ===== Delete Confirmation Dialog ===== -->
    <AlertDialog :open="deleteTarget !== null" @update:open="onDeleteDialogOpenChange">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除「{{ deleteTarget?.name }}」吗？此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="deleteTarget = null">取消</AlertDialogCancel>
          <AlertDialogAction class="bg-destructive text-destructive-foreground hover:bg-destructive/90" @click="confirmDelete">
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
