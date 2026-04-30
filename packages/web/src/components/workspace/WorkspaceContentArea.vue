<script setup lang="ts">
import { computed } from "vue";
import { LoaderCircle } from "lucide-vue-next";

import OpenWithDefaultApp from "@/components/workspace/OpenWithDefaultApp.vue";
import WorkspaceMarkdownEditor from "@/components/workspace/WorkspaceMarkdownEditor.vue";
import BaseView from "@/components/workspace/BaseView.vue";
import WorkbenchReadonlyFilePreview from "@/components/workbench/file-preview/WorkbenchReadonlyFilePreview.vue";
import { getFileBlobUrl } from "@/lib/api";
import type { WorkspaceFileTab } from "@/composables/useWorkspaceFilePreview";

const props = defineProps<{
	tab: WorkspaceFileTab | null;
	rootDir: string;
}>();

const emit = defineEmits<{
	(e: "open-with-default-app", path: string): void;
	(e: "load-more", tabId: string): void;
	(e: "save-status", tabId: string, status: string): void;
}>();

const activeBlobUrl = computed(() => {
	if (!props.tab || props.tab.previewKind !== "image") return "";
	return getFileBlobUrl(props.tab.path, props.tab.root);
});

const isUnsupported = computed(() => {
	if (!props.tab) return false;
	return (
		props.tab.previewKind === "unsupported" &&
		!props.tab.isLoading &&
		!props.tab.error
	);
});
</script>

<template>
  <div class="h-full min-h-0">
    <!-- 加载中 -->
    <div
      v-if="tab?.isLoading"
      class="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <LoaderCircle class="size-4 animate-spin" />
      正在读取文件内容…
    </div>

    <!-- 不支持预览 -->
    <OpenWithDefaultApp
      v-else-if="tab && isUnsupported"
      :file-name="tab.title"
      :file-path="tab.path"
      @open="emit('open-with-default-app', $event)"
    />

    <!-- Markdown 编辑器 -->
    <WorkspaceMarkdownEditor
      v-else-if="tab && tab.previewKind === 'markdown'"
      :file-path="tab.path"
      :root-dir="tab.root"
      class="h-full"
      @update:save-status="emit('save-status', tab.id, $event)"
    />

    <!-- Base 数据库视图 -->
    <BaseView
      v-else-if="tab && tab.previewKind === 'base'"
      :file-path="tab.path"
      :workspace-dir="tab.root"
      class="h-full"
    />

    <!-- 其他文件：只读预览 -->
    <WorkbenchReadonlyFilePreview
      v-else-if="tab && !tab.isLoading"
      :blob-url="activeBlobUrl"
      :content="tab.content"
      :error="tab.error"
      :extension="tab.extension"
      :file-name="tab.title"
      :is-large-file="tab.isLargeFile"
      :is-loading-more="tab.isLoadingMore"
      :mime-type="tab.mimeType"
      :next-start-line="tab.nextStartLine"
      :preview-line-count="tab.previewLineCount"
      :preview-kind="tab.previewKind"
      class="h-full"
      @load-more="emit('load-more', tab.id)"
    />
  </div>
</template>
