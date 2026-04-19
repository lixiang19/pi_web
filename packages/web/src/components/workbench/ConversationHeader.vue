<script setup lang="ts">
import { ref, nextTick } from "vue";
import { PanelRight, FolderTree } from "lucide-vue-next";
import { Button } from "@/components/ui/button";

const props = defineProps<{
  title: string;
  isDraftSession: boolean;
  isOperationPanelCollapsed: boolean;
  isFilePanelCollapsed: boolean;
}>();

const emit = defineEmits<{
  "update:title": [title: string];
  "toggle-operation-panel": [];
  "toggle-file-panel": [];
}>();

const isEditing = ref(false);
const editingTitle = ref("");
const inputRef = ref<HTMLInputElement | null>(null);

const startEdit = async () => {
  if (props.isDraftSession) return;
  isEditing.value = true;
  editingTitle.value = props.title;
  await nextTick();
  inputRef.value?.select();
};

const confirmEdit = () => {
  if (!isEditing.value) return;
  isEditing.value = false;
  const trimmed = editingTitle.value.trim();
  if (trimmed && trimmed !== props.title) {
    emit("update:title", trimmed);
  }
};

const cancelEdit = () => {
  isEditing.value = false;
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    confirmEdit();
  } else if (e.key === "Escape") {
    cancelEdit();
  }
};
</script>

<template>
  <header class="flex h-10 shrink-0 items-center justify-between border-b border-border/50 bg-background px-3">
    <!-- 左侧：标题 -->
    <div class="min-w-0 flex-1">
      <input
        v-if="isEditing"
        ref="inputRef"
        v-model="editingTitle"
        class="w-full max-w-xs truncate bg-transparent text-sm font-medium text-foreground outline-none ring-1 ring-primary/50 rounded px-1"
        @blur="confirmEdit"
        @keydown="handleKeydown"
      />
      <button
        v-else
        class="max-w-xs truncate text-sm font-medium text-foreground"
        :class="isDraftSession ? 'cursor-default' : 'cursor-pointer hover:text-foreground/70'"
        :title="isDraftSession ? title : '点击重命名'"
        @click="startEdit"
      >
        {{ title }}
      </button>
    </div>

    <!-- 右侧：按钮组 -->
    <div class="flex shrink-0 items-center gap-0.5">
      <!-- 折叠操作区文件 -->
      <Button
        variant="ghost"
        size="icon-sm"
        class="size-7"
        :class="{ 'text-muted-foreground': isOperationPanelCollapsed }"
        title="折叠/展开操作区"
        @click="emit('toggle-operation-panel')"
      >
        <PanelRight class="size-4" />
      </Button>

      <!-- 折叠 git/文件面板 -->
      <Button
        variant="ghost"
        size="icon-sm"
        class="size-7"
        :class="{ 'text-muted-foreground': isFilePanelCollapsed }"
        title="折叠/展开文件面板"
        @click="emit('toggle-file-panel')"
      >
        <FolderTree class="size-4" />
      </Button>
    </div>
  </header>
</template>
