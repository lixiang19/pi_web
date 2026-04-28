<script setup lang="ts">
import { computed, ref } from "vue";
import { FolderKanban } from "lucide-vue-next";

import FileBreadcrumbs from "@/components/files/FileBreadcrumbs.vue";
import FileEntryDialog from "@/components/files/FileEntryDialog.vue";
import FileGrid from "@/components/files/FileGrid.vue";
import FileManagerToolbar from "@/components/files/FileManagerToolbar.vue";
import FilePreviewPanel from "@/components/files/FilePreviewPanel.vue";
import FileTrashDialog from "@/components/files/FileTrashDialog.vue";
import { useFileManager } from "@/composables/useFileManager";
import { useFilesRouteState } from "@/composables/useFilesRouteState";
import type { FileTreeEntry } from "@/lib/types";

const { projectLabel, rootDir } = useFilesRouteState();
const manager = useFileManager(rootDir);

const fileInputRef = ref<HTMLInputElement | null>(null);
const activeEntry = ref<FileTreeEntry | null>(null);

const entryDialogOpen = ref(false);
const entryDialogMode = ref<"create-file" | "create-folder" | "rename">("create-file");
const editingEntry = ref<FileTreeEntry | null>(null);
const trashDialogOpen = ref(false);
const trashTarget = ref<FileTreeEntry | null>(null);

const directoryStats = computed(() => {
  const entries = manager.entries.value;
  const files = entries.filter((e) => e.kind === "file").length;
  const dirs = entries.filter((e) => e.kind === "directory").length;
  const parts: string[] = [];
  if (files > 0) parts.push(`${files} 个文件`);
  if (dirs > 0) parts.push(`${dirs} 个文件夹`);
  return parts.join(" · ") || "空目录";
});

const entryDialogTitle = computed(() => {
  if (entryDialogMode.value === "rename") return "重命名";
  return entryDialogMode.value === "create-folder" ? "新建文件夹" : "新建文件";
});

const entryDialogDescription = computed(() => {
  if (entryDialogMode.value === "rename") return "名称会直接更新到当前工作区。";
  return "新条目会创建在当前目录。";
});

const entryDialogInitialName = computed(() => editingEntry.value?.name ?? "");

const openEntryDialog = (
  mode: typeof entryDialogMode.value,
  entry: FileTreeEntry | null = null,
) => {
  entryDialogMode.value = mode;
  editingEntry.value = entry;
  entryDialogOpen.value = true;
};

const handleEntryDialogSubmit = async (name: string) => {
  if (entryDialogMode.value === "rename" && editingEntry.value) {
    await manager.renameEntry(editingEntry.value, name);
  } else {
    await manager.createEntry(
      name,
      entryDialogMode.value === "create-folder" ? "directory" : "file",
    );
  }
  entryDialogOpen.value = false;
  editingEntry.value = null;
};

const handleEntryOpen = async (entry: FileTreeEntry) => {
  if (entry.kind === "directory") {
    await manager.openDirectory(entry.path);
    activeEntry.value = null;
    return;
  }
  activeEntry.value = entry;
};

const handleTrashRequest = (entry: FileTreeEntry) => {
  trashTarget.value = entry;
  trashDialogOpen.value = true;
};

const handleTrashConfirm = async () => {
  if (!trashTarget.value) return;
  if (activeEntry.value?.path === trashTarget.value.path) {
    activeEntry.value = null;
  }
  await manager.trashEntry(trashTarget.value);
  trashDialogOpen.value = false;
  trashTarget.value = null;
};

const handleMove = async (entry: FileTreeEntry, targetDirectory: FileTreeEntry) => {
  if (entry.path === targetDirectory.path) return;
  await manager.moveEntry(entry, targetDirectory.path);
};

const triggerUpload = () => {
  fileInputRef.value?.click();
};

const handleUploadChange = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  await manager.upload(files);
};
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background text-foreground">
    <!-- 页头 -->
    <header class="flex items-center justify-between gap-4 border-b border-border/40 px-5 py-3">
      <div class="flex min-w-0 items-center gap-3">
        <FolderKanban class="size-4 shrink-0 text-primary" />
        <h1 class="text-sm font-semibold text-foreground">{{ projectLabel }}</h1>
        <span class="text-[11px] text-muted-foreground">{{ directoryStats }}</span>
      </div>
      <FileBreadcrumbs
        :items="manager.breadcrumbs.value"
        @navigate="manager.openDirectory"
      />
    </header>

    <!-- 主区域 -->
    <main class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_480px]">
      <!-- 左侧：文件管理 -->
      <section class="flex min-h-0 flex-col overflow-hidden bg-background">
        <FileManagerToolbar
          v-model:query="manager.query.value"
          v-model:sort-key="manager.sortKey.value"
          :is-loading="manager.isLoading.value"
          :is-mutating="manager.isMutating.value"
          @create-file="openEntryDialog('create-file')"
          @create-folder="openEntryDialog('create-folder')"
          @refresh="manager.refresh"
          @upload="triggerUpload"
        />

        <div
          v-if="manager.error.value"
          class="mx-5 mb-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {{ manager.error.value }}
        </div>

        <FileGrid
          :active-path="activeEntry?.path ?? ''"
          :entries="manager.visibleEntries.value"
          :is-loading="manager.isLoading.value"
          @move="handleMove"
          @open="handleEntryOpen"
          @rename="(entry) => openEntryDialog('rename', entry)"
          @trash="handleTrashRequest"
        />
      </section>

      <!-- 右侧：极简预览 -->
      <section class="hidden min-h-0 flex-col border-t border-border/40 bg-background xl:flex xl:border-l xl:border-t-0">
        <FilePreviewPanel
          :entry="activeEntry"
          :root-dir="rootDir"
        />
      </section>
    </main>

    <!-- 隐藏文件上传 -->
    <input
      ref="fileInputRef"
      class="hidden"
      multiple
      type="file"
      @change="handleUploadChange"
    >

    <FileEntryDialog
      v-model="entryDialogOpen"
      :description="entryDialogDescription"
      :initial-name="entryDialogInitialName"
      :is-saving="manager.isMutating.value"
      :title="entryDialogTitle"
      @submit="handleEntryDialogSubmit"
    />

    <FileTrashDialog
      v-model="trashDialogOpen"
      :entry="trashTarget"
      :is-saving="manager.isMutating.value"
      @confirm="handleTrashConfirm"
    />
  </div>
</template>
