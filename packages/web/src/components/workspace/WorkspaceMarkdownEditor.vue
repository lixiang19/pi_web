<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { LoaderCircle } from "lucide-vue-next";
import { toast } from "vue-sonner";

import NoteMilkdownEditor from "@/components/workspace/NoteMilkdownEditor.vue";
import { Button } from "@/components/ui/button";
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
	if (saveStatus.value !== "unsaved" && saveStatus.value !== "error") return true;

	saveStatus.value = "saving";
	emit("update:save-status", saveStatus.value);

	try {
		await saveNoteContent(props.filePath, content.value);
		savedContent.value = content.value;
		saveStatus.value = "saved";
		saveError.value = "";
		emit("update:save-status", saveStatus.value);
		return true;
	} catch (err) {
		saveError.value = err instanceof Error ? err.message : String(err);
		saveStatus.value = "error";
		toast.error("笔记保存失败", { description: saveError.value });
		emit("update:save-status", saveStatus.value);
		return false;
	}
};

const handleRetrySave = () => {
	void flushAutoSave();
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

onBeforeUnmount(() => {
	if (saveStatus.value === "unsaved") {
		void flushAutoSave();
		return;
	}
	clearSaveTimer();
});

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

    <div v-else class="flex h-full min-h-0 flex-col">
      <div class="flex shrink-0 items-center justify-between border-b border-border/40 px-3 py-2 text-xs text-muted-foreground">
        <span data-test="save-status">
          <template v-if="saveStatus === 'unsaved'">未保存</template>
          <template v-else-if="saveStatus === 'saving'">保存中...</template>
          <template v-else-if="saveStatus === 'error'">保存失败</template>
          <template v-else>已保存</template>
        </span>
        <div v-if="saveStatus === 'error'" class="flex items-center gap-2">
          <span data-test="save-error" class="max-w-[24rem] truncate text-destructive">
            {{ saveError }}
          </span>
          <Button data-test="retry-save" variant="outline" size="sm" class="h-7 text-xs" @click="handleRetrySave">
            重试保存
          </Button>
        </div>
      </div>
      <!-- 编辑器 -->
      <NoteMilkdownEditor
        :content="content"
        class="min-h-0 flex-1"
        @markdown-updated="handleMarkdownUpdated"
      />
    </div>
  </div>
</template>
