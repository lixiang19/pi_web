<script setup lang="ts">
import { ref, watch } from "vue";
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
import type { TerminalSnapshot } from "@/lib/types";

const props = defineProps<{
  open: boolean;
  terminal: TerminalSnapshot | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  rename: [id: string, title: string];
}>();

const titleDraft = ref("");

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      titleDraft.value = props.terminal?.title || "";
    }
  },
);

const handleRename = () => {
  if (!props.terminal || !titleDraft.value.trim()) return;
  emit("rename", props.terminal.id, titleDraft.value.trim());
  emit("update:open", false);
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter") handleRename();
};
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[440px]">
      <DialogHeader>
        <DialogTitle>重命名终端</DialogTitle>
        <DialogDescription>修改终端的显示名称</DialogDescription>
      </DialogHeader>

      <div class="py-2">
        <Input
          v-model="titleDraft"
          placeholder="输入终端名称"
          class="w-full"
          @keydown="handleKeydown"
        />
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">取消</Button>
        <Button :disabled="!titleDraft.trim()" @click="handleRename">保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
