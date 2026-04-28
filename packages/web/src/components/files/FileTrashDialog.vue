<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FileTreeEntry } from "@/lib/types";

defineProps<{
  modelValue: boolean;
  entry: FileTreeEntry | null;
  isSaving: boolean;
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: boolean): void;
  (event: "confirm"): void;
}>();
</script>

<template>
  <Dialog :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>移入回收区</DialogTitle>
        <DialogDescription>
          {{ entry?.name }} 会从当前工作区移入系统回收区。
        </DialogDescription>
      </DialogHeader>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          :disabled="isSaving"
          @click="emit('update:modelValue', false)"
        >
          取消
        </Button>
        <Button
          type="button"
          variant="destructive"
          :disabled="isSaving || !entry"
          @click="emit('confirm')"
        >
          移入回收区
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
