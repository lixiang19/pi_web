<script setup lang="ts">
import { ref, watch } from "vue";
import { useVModel } from "@vueuse/core";
import { LoaderCircle, Trash2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

const props = defineProps<{
	open: boolean;
	noteName: string;
	noteRelativePath: string;
}>();

const emit = defineEmits<{
	(e: "update:open", value: boolean): void;
	(e: "delete", relativePath: string): void;
}>();

const open = useVModel(props, "open", emit);
const isDeleting = ref(false);

watch(open, (nextOpen) => {
	if (nextOpen) {
		isDeleting.value = false;
	}
});

const handleDelete = async () => {
	isDeleting.value = true;
	try {
		emit("delete", props.noteRelativePath);
		open.value = false;
	} finally {
		isDeleting.value = false;
	}
};
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[380px]" :show-close-button="!isDeleting">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2 text-destructive">
          <Trash2 class="size-4" />
          删除笔记
        </DialogTitle>
        <DialogDescription>
          此操作不可撤销，笔记将被永久删除。
        </DialogDescription>
      </DialogHeader>

      <div class="rounded-md border border-destructive/20 bg-destructive/5 p-3">
        <p class="text-sm text-foreground font-medium truncate">{{ noteName }}</p>
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="isDeleting" @click="open = false">
          取消
        </Button>
        <Button variant="destructive" :disabled="isDeleting" @click="handleDelete">
          <LoaderCircle v-if="isDeleting" class="mr-1.5 size-3.5 animate-spin" />
          {{ isDeleting ? "删除中..." : "删除" }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
