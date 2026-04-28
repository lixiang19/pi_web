<script setup lang="ts">
import { onMounted } from "vue";
import { Folder } from "lucide-vue-next";

import FileTreePanel from "@/components/common/FileTreePanel.vue";
import { useFileTreeData } from "@/composables/useFileTreeData";
import { useFavoritesStore } from "@/stores/favorites";
import type { FileTreeEntry } from "@/lib/types";

const props = defineProps<{
	rootDir: string;
}>();

const emit = defineEmits<{
	(e: "select-file", path: string): void;
}>();

const {
	rootPath,
	visibleNodes,
	fileTreeError,
	isDirectoryExpanded,
	isDirectoryLoading,
	toggleDirectory,
	refreshTree,
} = useFileTreeData(() => props.rootDir);

const favoritesStore = useFavoritesStore();

const handleSelect = (entry: FileTreeEntry) => {
	if (entry.kind === "directory") {
		toggleDirectory(entry);
		return;
	}
	emit("select-file", entry.path);
};

const handleToggleExpand = (entry: FileTreeEntry) => {
	toggleDirectory(entry);
};

const handleToggleFavorite = async (path: string) => {
	const isCurrentlyFavorited = favoritesStore.itemsByType
		.get("file")
		?.some((f) => f.data?.["path"] === path);

	if (isCurrentlyFavorited) {
		await favoritesStore.remove(path);
	} else {
		await favoritesStore.add({
			id: path,
			type: "file",
			name: path.split("/").filter(Boolean).at(-1) || path,
			data: { path },
		});
	}
};

onMounted(() => {
	if (!favoritesStore.isLoaded) {
		favoritesStore.load();
	}
});
</script>

<template>
  <div v-if="!rootPath" class="px-4 py-12 text-center">
    <Folder class="size-10 mx-auto mb-3 text-muted-foreground/30" />
    <p class="text-xs text-muted-foreground font-medium">未选择目录</p>
  </div>
  <FileTreePanel
    v-else
    title="资源管理器"
    :nodes="visibleNodes"
    :is-root-loading="isDirectoryLoading(rootPath)"
    :error="fileTreeError"
    :is-expanded="isDirectoryExpanded"
    :is-loading="isDirectoryLoading"
    @select="handleSelect"
    @toggle-expand="handleToggleExpand"
    @toggle-favorite="handleToggleFavorite"
    @refresh="refreshTree"
  />
</template>
