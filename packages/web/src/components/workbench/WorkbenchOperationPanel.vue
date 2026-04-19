<script setup lang="ts">
import { computed, toRef } from "vue";
import { FileStack, LoaderCircle, X } from "lucide-vue-next";

import WorkbenchMarkdownPreview from "@/components/workbench/file-preview/WorkbenchMarkdownPreview.vue";
import WorkbenchReadonlyFilePreview from "@/components/workbench/file-preview/WorkbenchReadonlyFilePreview.vue";
import { getFileBlobUrl } from "@/lib/api";
import { useWorkbenchFilePreview } from "@/composables/useWorkbenchFilePreview";

const props = defineProps<{
  rootDir: string;
}>();

const emit = defineEmits<{
  (e: "append-to-draft", value: string): void;
}>();

const preview = useWorkbenchFilePreview(toRef(props, "rootDir"));

const tabs = preview.tabs;
const activeTabId = preview.activeTabId;
const activeTab = preview.activeTab;

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

    <div v-if="tabs.length === 0" class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <FileStack class="size-10 text-muted-foreground/35" />
      <div class="space-y-1">
        <p class="text-sm font-medium text-foreground/80">从文件树点击文件开始预览</p>
        <p class="text-xs text-muted-foreground">这里会承载当前会话的文件预览和后续更多操作标签。</p>
      </div>
    </div>

    <template v-else>
      <!-- 简洁标签栏 -->
      <div class="flex overflow-x-auto border-b border-border/40 bg-muted/10 shrink-0">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="group relative flex items-center gap-1.5 border-r border-border/30 px-3 py-2 text-xs transition-colors"
          :class="tab.id === activeTabId
            ? 'bg-background text-foreground'
            : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'"
          @click="preview.activateTab(tab.id)"
        >
          <span
            v-if="tab.isSaving"
            class="size-1.5 shrink-0 rounded-full bg-primary animate-pulse"
          />
          <span
            v-else-if="tab.error"
            class="size-1.5 shrink-0 rounded-full bg-destructive"
          />
          <span class="max-w-[140px] truncate font-medium">{{ tab.title }}</span>
          <span
            class="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-50 hover:!opacity-100 hover:bg-muted"
            @click.stop="preview.closeTab(tab.id)"
          >
            <X class="size-3" />
          </span>
        </button>
      </div>

      <!-- 文件内容 -->
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
            :file-name="activeTab.title"
            :file-path="activeTab.path"
            :is-saving="activeTab.isSaving"
            @append-to-draft="emit('append-to-draft', $event)"
            @update:content="preview.updateTabContent(activeTab.id, $event)"
          />
          <WorkbenchReadonlyFilePreview
            v-else
            :blob-url="activeBlobUrl"
            :content="activeTab.content"
            :error="activeTab.error"
            :extension="activeTab.extension"
            :file-name="activeTab.title"
            :is-large-file="activeTab.isLargeFile"
            :is-loading-more="activeTab.isLoadingMore"
            :mime-type="activeTab.mimeType"
            :next-start-line="activeTab.nextStartLine"
            :preview-line-count="activeTab.previewLineCount"
            :preview-kind="activeTab.previewKind"
            @load-more="preview.loadMore(activeTab.id)"
          />
        </div>
      </div>
    </template>
  </div>
</template>