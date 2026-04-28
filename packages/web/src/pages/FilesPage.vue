<script setup lang="ts">
import { computed, ref } from "vue";
import { FileCode2, FolderKanban, HardDrive, PanelsRightBottom } from "lucide-vue-next";

import FileBreadcrumbs from "@/components/files/FileBreadcrumbs.vue";
import FileEntryDialog from "@/components/files/FileEntryDialog.vue";
import FileGrid from "@/components/files/FileGrid.vue";
import FileManagerToolbar from "@/components/files/FileManagerToolbar.vue";
import FileTrashDialog from "@/components/files/FileTrashDialog.vue";
import WorkbenchOperationPanel from "@/components/workbench/WorkbenchOperationPanel.vue";
import { useFileManager } from "@/composables/useFileManager";
import { useFilesRouteState } from "@/composables/useFilesRouteState";
import type { FileTreeEntry } from "@/lib/types";

const { projectLabel, rootDir } = useFilesRouteState();
const manager = useFileManager(rootDir);

const operationPanelRef = ref<InstanceType<typeof WorkbenchOperationPanel> | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const activeFilePath = ref("");

const entryDialogOpen = ref(false);
const entryDialogMode = ref<"create-file" | "create-folder" | "rename">("create-file");
const editingEntry = ref<FileTreeEntry | null>(null);
const trashDialogOpen = ref(false);
const trashTarget = ref<FileTreeEntry | null>(null);

const relativeActiveFilePath = computed(() => {
  if (!activeFilePath.value || !rootDir.value) {
    return "";
  }

  return activeFilePath.value
    .replace(rootDir.value, "")
    .replace(/^\/+/, "");
});

const entryDialogTitle = computed(() => {
  if (entryDialogMode.value === "rename") {
    return "重命名";
  }

  return entryDialogMode.value === "create-folder" ? "新建文件夹" : "新建文件";
});

const entryDialogDescription = computed(() => {
  if (entryDialogMode.value === "rename") {
    return "名称会直接更新到当前工作区。";
  }

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
    return;
  }

  activeFilePath.value = entry.path;
  await operationPanelRef.value?.openFile(entry.path);
};

const handleTrashRequest = (entry: FileTreeEntry) => {
  trashTarget.value = entry;
  trashDialogOpen.value = true;
};

const handleTrashConfirm = async () => {
  if (!trashTarget.value) {
    return;
  }

  const targetPath = trashTarget.value.path;
  await manager.trashEntry(trashTarget.value);
  if (activeFilePath.value === targetPath) {
    activeFilePath.value = "";
  }
  trashDialogOpen.value = false;
  trashTarget.value = null;
};

const handleMove = async (
  entry: FileTreeEntry,
  targetDirectory: FileTreeEntry,
) => {
  if (entry.path === targetDirectory.path) {
    return;
  }

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
    <header class="ridge-panel-header flex min-h-16 items-center justify-between gap-4 px-6">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <FolderKanban class="size-4 text-primary" />
          <p class="text-[11px] font-black uppercase tracking-[0.24em] text-primary/70">
            Files
          </p>
        </div>
        <div class="mt-1 flex min-w-0 items-center gap-3">
          <h1 class="truncate text-lg font-semibold tracking-tight">
            {{ projectLabel }}
          </h1>
          <span class="hidden rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground md:inline-flex">
            workspace
          </span>
        </div>
      </div>

      <div class="min-w-0 text-right">
        <div class="flex items-center justify-end gap-2 text-xs font-medium text-muted-foreground">
          <HardDrive class="size-3.5" />
          <span class="truncate">{{ rootDir || "当前没有可用目录" }}</span>
        </div>
        <p class="mt-1 truncate text-[11px] text-muted-foreground/80">
          {{ manager.relativeDirectory.value || "工作区根目录" }}
        </p>
      </div>
    </header>

    <main class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_520px]">
      <section class="flex min-h-0 flex-col overflow-hidden bg-background">
        <div class="ridge-panel-header flex min-h-12 items-center px-5">
          <FileBreadcrumbs
            :items="manager.breadcrumbs.value"
            @navigate="manager.openDirectory"
          />
        </div>

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
          class="mx-5 mb-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {{ manager.error.value }}
        </div>

        <FileGrid
          :active-path="activeFilePath"
          :entries="manager.visibleEntries.value"
          :is-loading="manager.isLoading.value"
          @move="handleMove"
          @open="handleEntryOpen"
          @rename="(entry) => openEntryDialog('rename', entry)"
          @trash="handleTrashRequest"
        />
      </section>

      <section class="flex min-h-0 flex-col border-t border-border/40 bg-background xl:border-l xl:border-t-0">
        <div class="flex h-11 shrink-0 items-center justify-between border-b border-border/40 px-4">
          <div class="flex min-w-0 items-center gap-2">
            <PanelsRightBottom class="size-3.5 text-muted-foreground" />
            <span class="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/70">
              预览
            </span>
          </div>
          <div class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <FileCode2 class="size-3.5 shrink-0" />
            <span class="truncate">
              {{ activeFilePath ? relativeActiveFilePath : "未打开文件" }}
            </span>
          </div>
        </div>

        <div class="min-h-0 flex-1">
          <WorkbenchOperationPanel
            ref="operationPanelRef"
            :root-dir="rootDir"
            :enable-markdown-ai-actions="false"
            empty-title="选择文件开始预览"
            empty-description="Markdown 文件可直接编辑保存，代码、图片、HTML 和大文件按类型预览。"
          />
        </div>
      </section>
    </main>

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
