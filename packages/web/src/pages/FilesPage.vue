<script setup lang="ts">
import { computed, ref } from "vue";
import { FileCode2, FolderKanban, HardDrive, PanelsRightBottom } from "lucide-vue-next";

import WorkspaceFileTree from "@/components/WorkspaceFileTree.vue";
import WorkbenchOperationPanel from "@/components/workbench/WorkbenchOperationPanel.vue";
import { useFilesRouteState } from "@/composables/useFilesRouteState";

const { projectLabel, rootDir } = useFilesRouteState();

const operationPanelRef = ref<InstanceType<typeof WorkbenchOperationPanel> | null>(null);
const activeFilePath = ref("");

const relativeActiveFilePath = computed(() => {
  if (!activeFilePath.value || !rootDir.value) {
    return "";
  }

  return activeFilePath.value
    .replace(rootDir.value, "")
    .replace(/^\/+/, "");
});

const handleSelectFile = async (filePath: string) => {
  activeFilePath.value = filePath;
  await operationPanelRef.value?.openFile(filePath);
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
          {{ relativeActiveFilePath || "选择文件后在右侧预览和编辑" }}
        </p>
      </div>
    </header>

    <main class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside class="min-h-0 border-b border-border/50 bg-muted/10 lg:border-b-0 lg:border-r">
        <WorkspaceFileTree :root-dir="rootDir" @select-file="handleSelectFile" />
      </aside>

      <section class="flex min-h-0 flex-col bg-background">
        <div class="flex h-11 shrink-0 items-center justify-between border-b border-border/40 px-4">
          <div class="flex min-w-0 items-center gap-2">
            <PanelsRightBottom class="size-3.5 text-muted-foreground" />
            <span class="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/70">
              预览工作区
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
            empty-title="选择文件开始工作"
            empty-description="文件页会复用工作台预览能力：Markdown 编辑自动保存，代码、图片、HTML 和大文件按类型只读预览。"
          />
        </div>
      </section>
    </main>
  </div>
</template>
