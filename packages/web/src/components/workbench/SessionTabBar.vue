<script setup lang="ts">
import { X } from "lucide-vue-next";
import { useSessionTabs } from "@/composables/useSessionTabs";

const { openTabs, activeTabId, switchTab, closeTab } = useSessionTabs();

const handleClose = (e: MouseEvent, tabId: string) => {
  e.stopPropagation();
  closeTab(tabId);
};

// 标签标题截断
const truncateTitle = (title: string, maxLen = 16) => {
  if (title.length <= maxLen) return title;
  return title.slice(0, maxLen - 1) + "…";
};
</script>

<template>
  <div
    class="flex h-9 items-end gap-0.5 overflow-x-auto border-b border-border/40 bg-background/50 px-1 pb-0 scrollbar-none"
  >
    <button
      v-for="tab in openTabs"
      :key="tab.id"
      class="group relative flex h-8 max-w-[180px] min-w-[80px] shrink-0 items-center gap-1.5 rounded-t-md border border-b-0 border-transparent px-3 text-left transition-all"
      :class="
        tab.id === activeTabId
          ? 'border-border/60 bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
      "
      @click="switchTab(tab.id)"
    >
      <!-- Streaming 指示器 -->
      <span
        v-if="tab.status === 'streaming'"
        class="relative flex h-2 w-2 shrink-0"
      >
        <span
          class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"
        />
        <span class="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>

      <!-- 标签标题 -->
      <span class="truncate text-xs font-medium">
        {{ truncateTitle(tab.title || "新会话") }}
      </span>

      <!-- 关闭按钮 -->
      <span
        class="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
        :class="tab.id === activeTabId ? 'opacity-60' : ''"
        @click="handleClose($event, tab.id)"
      >
        <X class="h-3 w-3" />
      </span>
    </button>
  </div>
</template>

<style scoped>
/* 隐藏滚动条但保持滚动功能 */
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
