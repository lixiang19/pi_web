<script setup lang="ts">
import { computed } from "vue";
import { FileCode2, Minus, Plus } from "lucide-vue-next";
import { Checkbox } from "@/components/ui/checkbox";
import type { GitFileStatusItem } from "@/lib/types";

const props = defineProps<{
  files: GitFileStatusItem[];
  selectedPaths: Set<string>;
}>();

const emit = defineEmits<{
  "toggle-path": [path: string];
  "toggle-all": [];
}>();

const handleToggleAll = () => {
  if (props.files.length === 0) return;
  emit("toggle-all");
};

const handleHeaderKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  handleToggleAll();
};

const allSelected = computed(
  () =>
    props.files.length > 0 &&
    props.files.every((f) => props.selectedPaths.has(f.path)),
);

const statusLabel = (file: GitFileStatusItem) => {
  const code = file.index !== " " ? file.index : file.working_dir;
  const map: Record<string, string> = {
    M: "modified",
    A: "added",
    D: "deleted",
    R: "renamed",
    C: "copied",
    U: "unmerged",
    "?": "untracked",
    "!": "ignored",
  };
  return map[code] ?? code;
};

const statusColor = (file: GitFileStatusItem) => {
  const code = file.index !== " " ? file.index : file.working_dir;
  const map: Record<string, string> = {
    M: "text-amber-500",
    A: "text-emerald-500",
    D: "text-destructive",
    R: "text-blue-500",
    "?": "text-muted-foreground",
  };
  return map[code] ?? "text-muted-foreground";
};

const statusIcon = (file: GitFileStatusItem) => {
  const code = file.index !== " " ? file.index : file.working_dir;
  if (code === "D") return Minus;
  if (code === "A" || code === "?") return Plus;
  return FileCode2;
};
</script>

<template>
  <div class="flex flex-col flex-1 min-h-0">
    <!-- Header -->
    <div
      class="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-accent/40"
      :class="files.length === 0 ? 'cursor-default hover:bg-transparent opacity-70' : 'cursor-pointer'"
      role="button"
      :tabindex="files.length === 0 ? -1 : 0"
      :aria-disabled="files.length === 0"
      @click="handleToggleAll"
      @keydown="handleHeaderKeydown"
    >
      <div class="flex items-center gap-2">
        <Checkbox
          :model-value="allSelected"
          @update:model-value="handleToggleAll"
          @click.stop
        />
        <span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Changes
        </span>
        <span
          v-if="files.length > 0"
          class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground tabular-nums"
        >
          {{ files.length }}
        </span>
      </div>
      <span class="text-[10px] text-muted-foreground tabular-nums">
        {{ selectedPaths.size }}/{{ files.length }}
      </span>
    </div>

    <!-- Empty State -->
    <div v-if="files.length === 0" class="px-3 py-6 text-center">
      <p class="text-xs text-muted-foreground">暂无变更</p>
    </div>

    <!-- File List -->
    <div v-else class="flex-1 overflow-auto scrollbar-thin">
      <div
        v-for="file in files"
        :key="file.path"
        class="group flex items-center gap-2 px-3 py-1 transition-colors hover:bg-accent/50"
      >
        <Checkbox
          :model-value="selectedPaths.has(file.path)"
          @update:model-value="emit('toggle-path', file.path)"
        />
        <component
          :is="statusIcon(file)"
          class="size-3.5 shrink-0"
          :class="statusColor(file)"
        />
        <span class="min-w-0 flex-1 truncate text-[13px] text-foreground">
          {{ file.path }}
        </span>
        <span
          class="shrink-0 text-[9px] font-bold uppercase tracking-wider"
          :class="statusColor(file)"
        >
          {{ statusLabel(file) }}
        </span>
      </div>
    </div>
  </div>
</template>
