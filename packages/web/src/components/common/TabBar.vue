<script setup lang="ts">
import { Plus, X } from "lucide-vue-next";

export interface TabItem {
  id: string;
  title: string;
  /** 'idle' | 'saving' | 'unsaved' | 'error' | 'loading' */
  status?: string;
}

const props = defineProps<{
  tabs: TabItem[];
  activeTabId: string;
  /** 所属 PaneGroup ID，用于拖拽识别 */
  paneGroupId?: string;
}>();

const emit = defineEmits<{
  (e: "select", id: string): void;
  (e: "close", id: string): void;
  (e: "new-tab"): void;
  (e: "drag-start", tabId: string, paneGroupId: string): void;
  (e: "drag-end"): void;
}>();

function onDragStart(e: DragEvent, tabId: string) {
  if (!e.dataTransfer) return;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", tabId);
  emit("drag-start", tabId, props.paneGroupId ?? "");
}

function onDragEnd() {
  emit("drag-end");
}
</script>

<template>
  <div
    v-if="tabs.length > 0"
    class="flex shrink-0 items-center border-b border-border/40 bg-background px-1 pt-1"
  >
    <!-- 标签列表 -->
    <div class="flex min-w-0 flex-1">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        :draggable="true"
        class="group relative flex min-w-0 cursor-pointer items-center gap-1.5 rounded-t-md px-3 pb-1.5 pt-1.5 text-[13px] transition-colors"
        :class="
          activeTabId === tab.id
            ? 'bg-muted/40 text-foreground'
            : 'text-muted-foreground hover:bg-muted/20 hover:text-foreground/70'
        "
        @click="emit('select', tab.id)"
        @dragstart="onDragStart($event, tab.id)"
        @dragend="onDragEnd"
      >
        <!-- Active indicator -->
        <span
          v-if="activeTabId === tab.id"
          class="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-primary"
        />

        <!-- Status dot -->
        <span
          v-if="tab.status === 'loading'"
          class="size-1.5 shrink-0 rounded-full bg-primary animate-pulse"
        />
        <span
          v-else-if="tab.status === 'unsaved'"
          class="size-1.5 shrink-0 rounded-full bg-primary"
        />
        <span
          v-else-if="tab.status === 'saving'"
          class="size-1.5 shrink-0 rounded-full bg-primary animate-pulse"
        />
        <span
          v-else-if="tab.status === 'error'"
          class="size-1.5 shrink-0 rounded-full bg-destructive"
        />

        <span class="truncate">{{ tab.title }}</span>

        <!-- Close button -->
        <button
          type="button"
          class="ml-0.5 flex shrink-0 rounded-sm p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted/60"
          @mousedown.stop
          @click.stop="emit('close', tab.id)"
        >
          <X class="size-3 text-muted-foreground" />
        </button>
      </div>
    </div>

    <!-- + 新建主页按钮 -->
    <button
      type="button"
      class="ml-1 flex shrink-0 items-center justify-center rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
      @click="emit('new-tab')"
    >
      <Plus class="size-4" />
    </button>
  </div>
</template>
