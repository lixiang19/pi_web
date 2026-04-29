<script setup lang="ts">
import { ref, watch } from "vue";
import { useVModel } from "@vueuse/core";
import { Archive, LoaderCircle } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const props = defineProps<{
	open: boolean;
	noteName: string;
	noteRelativePath: string;
	directories: string[];
}>();

const emit = defineEmits<{
	(e: "update:open", value: boolean): void;
	(e: "archive", relativePath: string, targetDir: string): void;
}>();

const open = useVModel(props, "open", emit);
const selectedDir = ref("");
const isArchiving = ref(false);

watch(open, (nextOpen) => {
	if (nextOpen) {
		isArchiving.value = false;
		selectedDir.value = props.directories[0] ?? "笔记";
	}
});

const handleArchive = async () => {
	if (!selectedDir.value) return;
	isArchiving.value = true;
	try {
		emit("archive", props.noteRelativePath, selectedDir.value);
		open.value = false;
	} finally {
		isArchiving.value = false;
	}
};
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[400px]" :show-close-button="!isArchiving">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Archive class="size-4 text-muted-foreground" />
          归档笔记
        </DialogTitle>
        <DialogDescription>
          将笔记从收件箱移到目标目录
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <div class="rounded-md border border-border/50 bg-muted/30 p-3">
          <p class="text-xs text-muted-foreground mb-1">笔记</p>
          <p class="text-sm text-foreground font-medium truncate">{{ noteName }}</p>
        </div>

        <div>
          <label class="text-xs font-medium text-muted-foreground mb-1.5 block">
            目标目录
          </label>
          <Select v-model="selectedDir">
            <SelectTrigger class="h-8 text-sm">
              <SelectValue placeholder="选择目录" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="dir in directories"
                :key="dir"
                :value="dir"
              >
                📁 {{ dir }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="isArchiving" @click="open = false">
          取消
        </Button>
        <Button :disabled="isArchiving || !selectedDir" @click="handleArchive">
          <LoaderCircle v-if="isArchiving" class="mr-1.5 size-3.5 animate-spin" />
          归档
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
