<script setup lang="ts">
import { computed, nextTick, ref, watch, type ComponentPublicInstance } from "vue";
import {
	ChevronDown,
	ChevronRight,
	Clock,
	Edit3,
	Folder,
	LoaderCircle,
	MoreVertical,
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

import { ScrollArea } from "@/components/ui/scroll-area";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

// --- view state ---
const viewMode = ref<"tree" | "favorites" | "search" | "recent">("tree");
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

const createFileEntryFromPath = (filePath: string, name: string): FileTreeEntry => ({
	path: filePath,
	name,
	kind: "file",
	relativePath: filePath,
	size: null,
	modifiedAt: 0,
	extension: filePath.includes(".") ? filePath.slice(filePath.lastIndexOf(".")) : "",
});

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
  <div class="flex flex-1 min-h-0 flex-col overflow-hidden bg-transparent">
    <!-- ===== Toolbar ===== -->
    <div class="shrink-0 flex items-center justify-end px-2 py-1.5 gap-1">
      <div class="flex items-center gap-0.5 shrink-0">
        <button
          class="flex items-center justify-center size-6 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-accent/50 transition-all"
          :class="viewMode === 'tree' ? 'text-foreground/60 bg-accent/40' : ''"
          @click="viewMode = 'tree'"
        >
          <Folder class="size-3" />
        </button>
        <button
          class="flex items-center justify-center size-6 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-accent/50 transition-all"
          :class="viewMode === 'favorites' ? 'text-amber-500/70 bg-amber-500/10' : ''"
          @click="viewMode = 'favorites'"
        >
          <Star class="size-3" />
        </button>
        <button
          class="flex items-center justify-center size-6 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-accent/50 transition-all"
          :class="viewMode === 'search' ? 'text-foreground/60 bg-accent/40' : ''"
          @click="viewMode = 'search'"
        >
          <Search class="size-3" />
        </button>
        <button
          class="flex items-center justify-center size-6 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-accent/50 transition-all"
          :class="viewMode === 'recent' ? 'text-foreground/60 bg-accent/40' : ''"
          @click="viewMode = 'recent'"
        >
          <Clock class="size-3" />
        </button>
        <div class="w-px h-3.5 bg-border/40 mx-0.5" />
        <button
          class="flex items-center justify-center size-6 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-accent/50 transition-all"
          @click="emit('refresh')"
        >
          <RefreshCw class="size-3" :class="isRootLoading ? 'animate-spin' : ''" />
        </button>
      </div>
    </div>

    <!-- ===== Tree View ===== -->
    <ScrollArea v-if="viewMode === 'tree'" class="flex-1">
      <!-- Loading -->
      <div v-if="nodes.length === 0 && isRootLoading" class="flex flex-col items-center gap-2 px-4 py-10">
        <LoaderCircle class="size-5 animate-spin text-muted-foreground/30" />
        <p class="text-[11px] text-muted-foreground/50">加载中...</p>
      </div>
      <!-- Error -->
      <div v-else-if="error" class="mx-3 mt-1 rounded-md border border-destructive/10 bg-destructive/5 px-2.5 py-2">
        <p class="text-[11px] text-destructive/80">{{ error }}</p>
      </div>
      <!-- Tree -->
      <div v-else class="py-0.5">
        <div v-for="node in displayNodes" :key="node.isNewFolderPlaceholder ? 'new-folder-' + node.entry.path : node.entry.path">
          <!-- New folder inline input -->
          <template v-if="node.isNewFolderPlaceholder">
            <div
              class="flex items-center gap-2 px-3 py-1"
              :style="{ paddingLeft: `${node.depth * 14 + 12}px` }"
            >
              <Folder class="size-3.5 shrink-0 text-muted-foreground/40" />
              <input
                :ref="setCreatingFolderInputRef"
                v-model="creatingFolderName"
                placeholder="文件夹名称"
                class="min-w-0 flex-1 h-6 bg-transparent px-1 text-[12px] outline-none border-b border-primary/30 focus:border-primary/60 placeholder:text-muted-foreground/30"
                @keydown="onCreateFolderKeydown"
                @blur="confirmCreateFolder"
              />
            </div>
          </template>

          <!-- Normal node -->
          <DropdownMenu v-else>
            <div
              class="group relative transition-colors duration-150 hover:bg-accent/30"
              :class="[
                node.entry.kind === 'file' ? 'cursor-pointer' : 'cursor-default',
                isFavorited(node.entry.path) ? 'bg-amber-500/[0.04]' : '',
              ]"
            >
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-[5px] pr-7 text-left"
                :style="{ paddingLeft: `${node.depth * 14 + 12}px` }"
                @click="
                  node.entry.kind === 'directory'
                    ? emit('toggle-expand', node.entry)
                    : emit('select', node.entry)
                "
              >
                <!-- Expand chevron -->
                <component
                  :is="node.entry.kind === 'directory'
                    ? isExpanded(node.entry.path) ? ChevronDown : ChevronRight
                    : ChevronRight"
                  class="size-3 shrink-0"
                  :class="node.entry.kind === 'directory' ? 'text-muted-foreground/50' : 'text-transparent'"
                />

                <!-- File/Folder icon -->
                <component
                  :is="getEntryIcon(node.entry)"
                  class="size-3.5 shrink-0"
                  :class="node.entry.kind === 'directory'
                    ? 'text-muted-foreground/50'
                    : 'text-foreground/40 group-hover:text-foreground/60'"
                />

                <!-- Name -->
                <template v-if="editingPath === node.entry.path">
                  <input
                    :ref="setEditingInputRef"
                    v-model="editingName"
                    class="min-w-0 flex-1 h-5 bg-transparent px-1 text-[12px] outline-none border-b border-primary/30 focus:border-primary/60"
                    @keydown="onRenameKeydown"
                    @blur="confirmRename"
                    @click.stop
                  />
                </template>
                <template v-else>
                  <span
                    class="min-w-0 flex-1 truncate text-[12px]"
                    :class="node.entry.kind === 'directory'
                      ? 'text-foreground/70 font-medium'
                      : 'text-foreground/80 group-hover:text-foreground'"
                  >
                    {{ node.entry.name }}
                  </span>
                </template>
              </button>

              <!-- Loading spinner -->
              <div
                v-if="node.entry.kind === 'directory' && isExpanded(node.entry.path) && isLoading(node.entry.path)"
                class="absolute right-6 top-1/2 -translate-y-1/2"
              >
                <LoaderCircle class="size-3 animate-spin text-muted-foreground/30" />
              </div>

              <!-- More actions trigger -->
              <DropdownMenuTrigger as-child>
                <button
                  type="button"
                  class="absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm opacity-0 transition-all duration-150 hover:bg-accent/60 group-hover:opacity-100"
                  :class="isFavorited(node.entry.path) ? 'opacity-100' : ''"
                  @click.stop
                >
                  <MoreVertical class="size-3 text-muted-foreground/40" />
                </button>
              </DropdownMenuTrigger>

              <!-- Empty hint -->
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
                class="py-0.5 text-[10px] text-muted-foreground/25 italic"
                :style="{ paddingLeft: `${(node.depth + 1) * 14 + 12}px` }"
              >
                空文件夹
              </div>
            </div>

            <DropdownMenuContent align="end" class="min-w-[140px]">
              <DropdownMenuItem v-if="node.entry.kind === 'directory'" @click="handleCreateFolder(node.entry)">
                <Plus class="size-3.5" />
                新建文件夹
              </DropdownMenuItem>
              <DropdownMenuItem @click="handleRename(node.entry)">
                <Edit3 class="size-3.5" />
                重命名
              </DropdownMenuItem>
              <DropdownMenuItem v-if="node.entry.kind === 'file'" @click="handleToggleFavorite(node.entry)">
                <component :is="isFavorited(node.entry.path) ? Star : StarOff" class="size-3.5" />
                {{ isFavorited(node.entry.path) ? "取消收藏" : "收藏" }}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" @click="handleDelete(node.entry)">
                <Trash2 class="size-3.5" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </ScrollArea>

    <!-- ===== Favorites View ===== -->
    <ScrollArea v-else-if="viewMode === 'favorites'" class="flex-1">
      <div v-if="fileFavorites.length === 0" class="flex flex-col items-center py-16 px-4 text-center">
        <Star class="size-7 text-muted-foreground/15 mb-3" />
        <p class="text-xs text-muted-foreground/40">暂无收藏</p>
        <p class="text-[10px] text-muted-foreground/25 mt-1">在文件树中点击星标添加</p>
      </div>
      <div v-else class="py-1 px-2 space-y-0.5">
        <div
          v-for="favorite in fileFavorites"
          :key="favorite.id"
          class="group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent/30 transition-colors"
          @click="emit('select', createFileEntryFromPath(getFavoritePath(favorite), favorite.name))"
        >
          <Star class="size-3.5 shrink-0 text-amber-500/50" />
          <div class="min-w-0 flex-1">
            <p class="text-[12px] text-foreground truncate">{{ favorite.name }}</p>
            <p class="text-[10px] text-muted-foreground/30 font-mono truncate">{{ getFavoritePath(favorite) }}</p>
          </div>
        </div>
      </div>
    </ScrollArea>

    <!-- ===== Search View ===== -->
    <div v-else-if="viewMode === 'search'" class="flex-1 flex flex-col min-h-0">
      <div class="shrink-0 px-3 pt-1 pb-1.5">
        <div class="flex h-7 items-center gap-1.5 rounded-md border border-border/30 bg-accent/20 px-2.5 text-muted-foreground/50 focus-within:border-border/60 focus-within:bg-background focus-within:text-foreground transition-all">
          <Search class="size-3 shrink-0" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索文件..."
            class="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/25"
          />
          <LoaderCircle v-if="searchLoading" class="size-3 shrink-0 animate-spin text-muted-foreground/30" />
        </div>
      </div>
      <ScrollArea class="flex-1">
        <div v-if="!searchQuery.trim()" class="px-4 py-10 text-center">
          <Search class="size-5 text-muted-foreground/10 mb-2 mx-auto" />
          <p class="text-[11px] text-muted-foreground/30">输入关键词搜索</p>
        </div>
        <div v-else-if="searchResults.length === 0" class="px-4 py-10 text-center">
          <p class="text-[11px] text-muted-foreground/30">未找到匹配文件</p>
        </div>
        <div v-else class="py-0.5 px-2">
          <div
            v-for="node in searchResults"
            :key="node.entry.path"
            class="group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent/30 transition-colors"
            @click="emit('select', node.entry)"
          >
            <component
              :is="getEntryIcon(node.entry)"
              class="size-3.5 shrink-0 text-muted-foreground/40"
            />
            <div class="min-w-0 flex-1">
              <span class="block truncate text-[12px] text-foreground">{{ node.entry.name }}</span>
              <span class="block truncate text-[10px] text-muted-foreground/30 font-mono">{{ node.entry.path }}</span>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>

    <!-- ===== Recent View ===== -->
    <ScrollArea v-else-if="viewMode === 'recent'" class="flex-1">
      <div v-if="isRecentLoading" class="flex items-center justify-center py-16">
        <LoaderCircle class="size-4 animate-spin text-muted-foreground/20" />
      </div>
      <div v-else-if="!recentFiles?.length" class="px-4 py-10 text-center">
        <Clock class="size-5 text-muted-foreground/10 mb-2 mx-auto" />
        <p class="text-[11px] text-muted-foreground/30">暂无最近文件</p>
      </div>
      <div v-else class="py-0.5 px-2">
        <div
          v-for="file in recentFiles"
          :key="file.path"
          class="group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent/30 transition-colors"
          @click="emit('select', createFileEntryFromPath(file.path, file.name))"
        >
          <Clock class="size-3.5 shrink-0 text-muted-foreground/25" />
          <div class="min-w-0 flex-1">
            <span class="block truncate text-[12px] text-foreground">{{ file.name }}</span>
            <span class="block truncate text-[10px] text-muted-foreground/30 font-mono">{{ file.relativePath }}</span>
          </div>
        </div>
      </div>
    </ScrollArea>

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
