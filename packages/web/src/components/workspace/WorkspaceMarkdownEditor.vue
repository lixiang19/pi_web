<script setup lang="ts">
import { ref } from "vue";
import { LoaderCircle } from "lucide-vue-next";

import NoteMilkdownEditor from "@/components/workspace/NoteMilkdownEditor.vue";
import { getNoteContent, saveNoteContent } from "@/lib/api";

const AUTO_SAVE_DELAY_MS = 2000;

const props = defineProps<{
	filePath: string;
	rootDir: string;
}>();

const content = ref("");
const savedContent = ref("");
const isLoading = ref(true);
const saveStatus = ref<"saved" | "unsaved" | "saving" | "error">("saved");
const saveError = ref("");

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

const emit = defineEmits<{
	(e: "update:save-status", status: string): void;
}>();

// 加载文件内容
const loadContent = async () => {
	isLoading.value = true;
	try {
		const response = await getNoteContent(props.filePath);
		content.value = response.content;
		savedContent.value = response.content;
		saveStatus.value = "saved";
	} catch (err) {
		saveError.value = err instanceof Error ? err.message : String(err);
	} finally {
		isLoading.value = false;
	}
	emit("update:save-status", saveStatus.value);
};

// 编辑回调
const handleMarkdownUpdated = (markdown: string) => {
	content.value = markdown;
	if (markdown === savedContent.value) return;
	saveStatus.value = "unsaved";
	emit("update:save-status", saveStatus.value);
	scheduleAutoSave();
};

// 自动保存
const scheduleAutoSave = () => {
	clearSaveTimer();
	const timer = setTimeout(() => flushAutoSave(), AUTO_SAVE_DELAY_MS);
	saveTimers.set(props.filePath, timer);
};

const flushAutoSave = async () => {
	clearSaveTimer();
	if (saveStatus.value !== "unsaved") return;

	saveStatus.value = "saving";
	emit("update:save-status", saveStatus.value);

	try {
		await saveNoteContent(props.filePath, content.value);
		savedContent.value = content.value;
		saveStatus.value = "saved";
		saveError.value = "";
	} catch (err) {
		saveError.value = err instanceof Error ? err.message : String(err);
		saveStatus.value = "error";
	}
	emit("update:save-status", saveStatus.value);
};

const clearSaveTimer = () => {
	const timer = saveTimers.get(props.filePath);
	if (timer !== undefined) {
		clearTimeout(timer);
		saveTimers.delete(props.filePath);
	}
};

// 暴露给父组件
defineExpose({ flushAutoSave });

loadContent();
</script>

<template>
  <div class="h-full">
    <!-- 加载中 -->
    <div
      v-if="isLoading"
      class="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <LoaderCircle class="size-4 animate-spin" />
      正在加载笔记...
    </div>

    <!-- 编辑器 -->
    <NoteMilkdownEditor
      v-else
      :content="content"
      @markdown-updated="handleMarkdownUpdated"
    />
  </div>
</template>
