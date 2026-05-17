<script setup lang="ts">
import { ref, watch } from "vue";
import { FileCode2, LoaderCircle, X } from "lucide-vue-next";

import { workspaceVersionShowDiff } from "@/lib/api";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

const props = defineProps<{
	open: boolean;
	root: string;
	filePath: string;
}>();

const emit = defineEmits<{
	"update:open": [value: boolean];
}>();

const diffText = ref("");
const isLoading = ref(false);
const error = ref("");

const loadDiff = async () => {
	if (!props.filePath || !props.root) return;
	isLoading.value = true;
	error.value = "";
	try {
		const res = await workspaceVersionShowDiff({
			root: props.root,
			filePath: props.filePath,
		});
		diffText.value = res.diff;
	} catch (err) {
		error.value = err instanceof Error ? err.message : "加载 diff 失败";
	} finally {
		isLoading.value = false;
	}
};

watch(
	() => [props.open, props.filePath],
	() => {
		if (props.open && props.filePath) {
			diffText.value = "";
			void loadDiff();
		}
	},
);

const formatDiff = (text: string) =>
	text.split("\n").map((line) => {
		let type: "add" | "del" | "meta" | "normal" = "normal";
		if (line.startsWith("+")) type = "add";
		else if (line.startsWith("-")) type = "del";
		else if (line.startsWith("@@")) type = "meta";
		return { text: line, type };
	});
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-2xl max-h-[80vh] p-0 overflow-hidden flex flex-col">
      <DialogHeader class="shrink-0 px-4 py-3 border-b border-border/15">
        <div class="flex items-center gap-2">
          <FileCode2 class="size-4 text-muted-foreground/40" />
          <DialogTitle class="text-[13px] font-medium truncate">{{ filePath }}</DialogTitle>
        </div>
        <DialogDescription class="sr-only">工作空间版本差异</DialogDescription>
      </DialogHeader>

      <div class="flex-1 overflow-auto bg-[#1e1e1e] dark:bg-[#1e1e1e]">
        <div v-if="isLoading" class="flex flex-col items-center py-12 gap-2">
          <LoaderCircle class="size-5 animate-spin text-muted-foreground/20" />
          <p class="text-[11px] text-muted-foreground/30">加载 diff...</p>
        </div>

        <div v-else-if="error" class="flex flex-col items-center py-12 px-4 gap-2">
          <X class="size-5 text-destructive/30" />
          <p class="text-[11px] text-destructive/60 text-center">{{ error }}</p>
        </div>

        <div v-else-if="diffText" class="py-3">
          <div
            v-for="(line, i) in formatDiff(diffText)"
            :key="i"
            class="px-4 font-mono text-[11px] leading-5 whitespace-pre"
            :class="{
              'bg-emerald-500/10 text-emerald-400': line.type === 'add',
              'bg-red-500/10 text-red-400': line.type === 'del',
              'text-amber-400/70': line.type === 'meta',
              'text-gray-400': line.type === 'normal',
            }"
          >
            {{ line.text }}
          </div>
        </div>

        <div v-else class="flex flex-col items-center py-12">
          <p class="text-[11px] text-muted-foreground/30">没有可显示的变更</p>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
