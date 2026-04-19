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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TerminalCwdOption } from "@/composables/useTerminalContextOptions";
import type { TerminalSnapshot } from "@/lib/types";

const props = defineProps<{
  open: boolean;
  terminal: TerminalSnapshot | null;
  options: TerminalCwdOption[];
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  restart: [id: string, cwd: string];
}>();

const selectedCwd = ref("");

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      selectedCwd.value = props.terminal?.cwd || props.options[0]?.value || "";
    }
  },
);

const handleRestart = () => {
  if (!props.terminal || !selectedCwd.value) return;
  emit("restart", props.terminal.id, selectedCwd.value);
  emit("update:open", false);
};
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[440px]">
      <DialogHeader>
        <DialogTitle>重启终端</DialogTitle>
        <DialogDescription>选择新的工作目录后重启终端进程</DialogDescription>
      </DialogHeader>

      <div class="py-2">
        <Select v-model="selectedCwd">
          <SelectTrigger class="w-full">
            <SelectValue placeholder="选择工作目录" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in options"
              :key="option.value"
              :value="option.value"
            >
              <span class="text-muted-foreground text-xs mr-1">{{ option.group }}</span>
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">取消</Button>
        <Button :disabled="!selectedCwd" @click="handleRestart">重启</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
