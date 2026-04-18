<script setup lang="ts">
import { computed, toRef } from "vue";
import { ChevronRight, FileStack, LoaderCircle, X } from "lucide-vue-next";

import WorkbenchMarkdownPreview from "@/components/workbench/file-preview/WorkbenchMarkdownPreview.vue";
import WorkbenchReadonlyFilePreview from "@/components/workbench/file-preview/WorkbenchReadonlyFilePreview.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getFileBlobUrl } from "@/lib/api";
import { useWorkbenchFilePreview } from "@/composables/useWorkbenchFilePreview";

const props = defineProps<{
  rootDir: string;
}>();

const emit = defineEmits<{
  (e: "collapse"): void;
}>();

const preview = useWorkbenchFilePreview(toRef(props, "rootDir"));

const tabs = preview.tabs;
const activeTabId = preview.activeTabId;
const activeTab = preview.activeTab;

const activeStatusLabel = computed(() => {
  if (!activeTab.value) {
    return "待打开";
  }

  if (activeTab.value.error) {
    return "保存失败";
  }

  if (activeTab.value.isSaving) {
    return "自动保存中";
  }

  if (activeTab.value.previewKind === "markdown") {
    return "自动保存";
  }

  return "只读预览";
});

const activeBlobUrl = computed(() => {
  if (!activeTab.value || activeTab.value.previewKind !== "image") {
    return "";
  }

  return getFileBlobUrl(activeTab.value.path, activeTab.value.root);
});

defineExpose<{
  openFile: (filePath: string) => Promise<void>;
  flushActiveTab: () => Promise<boolean>;
}>({
  openFile: preview.openFile,
  flushActiveTab: preview.flushActiveTab,
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden bg-background">
    <div class="ridge-panel-header flex h-12 items-center justify-between px-4">
      <div class="flex items-center gap-2">
        <FileStack class="size-3.5 text-foreground/40" />
        <h3 class="text-[10px] font-black uppercase tracking-widest text-foreground/60">
          操作区
        </h3>
      </div>
      <div class="flex items-center gap-2">
        <Badge variant="outline" class="text-[10px] uppercase">
          {{ activeStatusLabel }}
        </Badge>
        <Button
          variant="ghost"
          size="icon-sm"
          class="size-7"
          @click="emit('collapse')"
        >
          <ChevronRight class="size-4" />
        </Button>
      </div>
    </div>

    <div v-if="tabs.length === 0" class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <FileStack class="size-10 text-muted-foreground/35" />
      <div class="space-y-1">
        <p class="text-sm font-medium text-foreground/80">从文件树点击文件开始预览</p>
        <p class="text-xs text-muted-foreground">
          这里会承载当前会话的文件预览和后续更多操作标签。
        </p>
      </div>
    </div>

    <template v-else>
      <div class="border-b border-border/40 bg-muted/15 px-2 py-2">
        <div class="flex gap-1 overflow-x-auto pb-1">
          <div
            v-for="tab in tabs"
            :key="tab.id"
            class="group flex min-w-[160px] max-w-[220px] shrink-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors"
            :class="tab.id === activeTabId
              ? 'border-border bg-background shadow-sm'
              : 'border-transparent bg-transparent hover:border-border/40 hover:bg-background/60'"
            role="button"
            tabindex="0"
            @click="preview.activateTab(tab.id)"
            @keydown.enter.prevent="preview.activateTab(tab.id)"
            @keydown.space.prevent="preview.activateTab(tab.id)"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-xs font-medium text-foreground/85">{{ tab.title }}</span>
                <span
                  v-if="tab.isSaving"
                  class="size-1.5 rounded-full bg-primary animate-pulse"
                />
                <span
                  v-else-if="tab.error"
                  class="size-1.5 rounded-full bg-destructive"
                />
              </div>
              <p class="truncate text-[11px] text-muted-foreground">{{ tab.previewKind }}</p>
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              class="size-6 shrink-0 opacity-60 transition-opacity hover:opacity-100"
              @click.stop="preview.closeTab(tab.id)"
            >
              <X class="size-3.5" />
            </Button>
          </div>
        </div>

        <div v-if="activeTab" class="mt-2 flex items-center justify-between gap-3 rounded-lg bg-background/80 px-3 py-2">
          <div class="min-w-0">
            <p class="truncate text-xs font-semibold text-foreground/80">{{ activeTab.title }}</p>
            <p class="truncate text-[11px] text-muted-foreground">{{ activeTab.path }}</p>
          </div>
          <div class="flex items-center gap-2">
            <Badge variant="outline" class="text-[10px] uppercase">
              {{ activeTab.previewKind }}
            </Badge>
            <span class="text-[11px] text-muted-foreground">{{ activeStatusLabel }}</span>
          </div>
        </div>
      </div>

      <div class="min-h-0 flex-1">
        <div v-if="activeTab?.isLoading" class="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle class="size-4 animate-spin" />
          正在读取文件内容…
        </div>

        <div v-else-if="activeTab" class="h-full">
          <WorkbenchMarkdownPreview
            v-if="activeTab.previewKind === 'markdown'"
            :content="activeTab.content"
            :error="activeTab.error"
            :is-saving="activeTab.isSaving"
            @update:content="preview.updateTabContent(activeTab.id, $event)"
          />

          <WorkbenchReadonlyFilePreview
            v-else
            :blob-url="activeBlobUrl"
            :content="activeTab.content"
            :mime-type="activeTab.mimeType"
            :preview-kind="activeTab.previewKind"
          />
        </div>
      </div>
    </template>
  </div>
</template>