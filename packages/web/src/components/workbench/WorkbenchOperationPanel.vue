<script setup lang="ts">
import { computed, toRef } from "vue";
import { FileStack, LoaderCircle } from "lucide-vue-next";

import TabBar from "@/components/common/TabBar.vue";
import type { TabItem } from "@/components/common/TabBar.vue";
import WorkbenchMarkdownPreview from "@/components/workbench/file-preview/WorkbenchMarkdownPreview.vue";
import WorkbenchReadonlyFilePreview from "@/components/workbench/file-preview/WorkbenchReadonlyFilePreview.vue";
import { getFileBlobUrl } from "@/lib/api";
import { useWorkbenchFilePreview } from "@/composables/useWorkbenchFilePreview";

const props = withDefaults(defineProps<{
	rootDir: string;
	emptyTitle?: string;
	emptyDescription?: string;
	enableMarkdownAiActions?: boolean;
}>(), {
	emptyTitle: "从文件树点击文件开始预览",
	emptyDescription: "这里会承载当前会话的文件预览和后续更多操作标签。",
	enableMarkdownAiActions: true,
});

const emit = defineEmits<{
	(e: "append-to-draft", value: string): void;
}>();

const preview = useWorkbenchFilePreview(toRef(props, "rootDir"));

const tabs = preview.tabs;
const activeTabId = preview.activeTabId;
const activeTab = preview.activeTab;

const tabBarItems = computed<TabItem[]>(() =>
	tabs.value.map((tab) => ({
		id: tab.id,
		title: tab.title,
		status: tab.isSaving
			? "saving"
			: tab.isLoading
				? "loading"
				: tab.error
					? "error"
					: "idle",
	})),
);

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
    <div
      v-if="tabs.length === 0"
      class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <FileStack class="size-10 text-muted-foreground/35" />
      <div class="space-y-1">
        <p class="text-sm font-medium text-foreground/80">
          {{ props.emptyTitle }}
        </p>
        <p class="text-xs text-muted-foreground">
          {{ props.emptyDescription }}
        </p>
      </div>
    </div>

    <template v-else>
      <TabBar
        :tabs="tabBarItems"
        :active-tab-id="activeTabId"
        @select="preview.activateTab($event)"
        @close="preview.closeTab($event)"
      />

      <div class="min-h-0 flex-1">
        <div
          v-if="activeTab?.isLoading"
          class="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircle class="size-4 animate-spin" />
          正在读取文件内容…
        </div>
        <div v-else-if="activeTab" class="h-full">
          <WorkbenchMarkdownPreview
            v-if="activeTab.previewKind === 'markdown'"
            :content="activeTab.content"
            :enable-ai-actions="props.enableMarkdownAiActions"
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
