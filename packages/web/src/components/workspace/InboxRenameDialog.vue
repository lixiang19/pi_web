<script setup lang="ts">
import { ref, watch } from "vue";
import { useVModel } from "@vueuse/core";
import { LoaderCircle, Pencil } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const props = defineProps<{
	open: boolean;
	noteName: string;
	noteRelativePath: string;
}>();

const emit = defineEmits<{
	(e: "update:open", value: boolean): void;
	(e: "rename", relativePath: string, newName: string): void;
}>();

const open = useVModel(props, "open", emit);
const newName = ref("");
const isRenaming = ref(false);

watch(open, (nextOpen) => {
	if (nextOpen) {
		isRenaming.value = false;
		// Strip .md extension for editing
		const baseName = props.noteName.replace(/\.md$/, "");
		newName.value = baseName;
	}
});

const handleRename = async () => {
	const trimmed = newName.value.trim();
	if (!trimmed) return;
	isRenaming.value = true;
	try {
		emit("rename", props.noteRelativePath, trimmed);
		open.value = false;
	} finally {
		isRenaming.value = false;
	}
};

const handleKeydown = (e: KeyboardEvent) => {
	if (e.key === "Enter") handleRename();
};
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[380px]" :show-close-button="!isRenaming">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Pencil class="size-4 text-muted-foreground" />
          重命名笔记
        </DialogTitle>
        <DialogDescription>
          输入新名称，.md 后缀会自动添加
        </DialogDescription>
      </DialogHeader>

      <div class="py-2">
        <Input
          v-model="newName"
          class="h-8 text-sm"
          placeholder="笔记名称"
          :disabled="isRenaming"
          @keydown="handleKeydown"
        />
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="isRenaming" @click="open = false">
          取消
        </Button>
        <Button :disabled="isRenaming || !newName.trim()" @click="handleRename">
          <LoaderCircle v-if="isRenaming" class="mr-1.5 size-3.5 animate-spin" />
          重命名
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
