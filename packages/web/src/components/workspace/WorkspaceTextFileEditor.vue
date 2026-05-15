<script setup lang="ts">
import { ref } from "vue";
import { toast } from "vue-sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveFileContent } from "@/lib/api";

const props = defineProps<{
	filePath: string;
	rootDir: string;
	initialContent: string;
}>();

const emit = defineEmits<{
	(e: "update:save-status", status: string): void;
}>();

const content = ref(props.initialContent);
const savedContent = ref(props.initialContent);
const saveStatus = ref<"saved" | "unsaved" | "saving" | "error">("saved");
const saveError = ref("");

const handleInput = (value: string | number) => {
	const next = String(value);
	content.value = next;
	if (next === savedContent.value) return;
	saveStatus.value = "unsaved";
	emit("update:save-status", saveStatus.value);
};

const flushSave = async () => {
	if (saveStatus.value !== "unsaved" && saveStatus.value !== "error") return true;
	saveStatus.value = "saving";
	emit("update:save-status", saveStatus.value);
	try {
		await saveFileContent({
			root: props.rootDir,
			path: props.filePath,
			content: content.value,
		});
		savedContent.value = content.value;
		saveStatus.value = "saved";
		saveError.value = "";
		emit("update:save-status", saveStatus.value);
		return true;
	} catch (error) {
		saveError.value = error instanceof Error ? error.message : String(error);
		saveStatus.value = "error";
		toast.error("文件保存失败", { description: saveError.value });
		emit("update:save-status", saveStatus.value);
		return false;
	}
};
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex shrink-0 items-center justify-between border-b border-border/40 px-3 py-2 text-xs text-muted-foreground">
      <span>
        <template v-if="saveStatus === 'unsaved'">未保存</template>
        <template v-else-if="saveStatus === 'saving'">保存中...</template>
        <template v-else-if="saveStatus === 'error'">保存失败</template>
        <template v-else>已保存</template>
      </span>
      <div class="flex items-center gap-2">
        <span v-if="saveError" class="max-w-[24rem] truncate text-destructive">{{ saveError }}</span>
        <Button
          v-if="saveStatus === 'unsaved' || saveStatus === 'error'"
          size="sm"
          class="h-7 text-xs"
          @click="flushSave"
        >
          保存
        </Button>
      </div>
    </div>
    <Textarea
      :model-value="content"
      class="min-h-0 flex-1 resize-none rounded-none border-0 font-mono text-xs leading-5 focus-visible:ring-0"
      spellcheck="false"
      @update:model-value="handleInput"
    />
  </div>
</template>
