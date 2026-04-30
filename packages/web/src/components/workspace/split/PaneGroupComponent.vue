<script setup lang="ts">
import type { PaneGroup as PaneGroupType } from "@/composables/useSplitPanes";
import type { DropZone } from "@/composables/useSplitDrag";
import { useSplitDrag } from "@/composables/useSplitDrag";
import TabBar from "@/components/common/TabBar.vue";
import type { TabItem } from "@/components/common/TabBar.vue";
import { computed, ref } from "vue";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

const props = defineProps<{
  node: PaneGroupType;
  isActive: boolean;
}>();

const emit = defineEmits<{
  (e: "set-active-tab", tabId: string): void;
  (e: "close-tab", tabId: string): void;
  (e: "split-right", tabId?: string): void;
  (e: "new-tab"): void;
  (e: "activate-pane"): void;
  (e: "drop-tab", payload: { fromPaneId: string; tabId: string; zone: DropZone }): void;
}>();

const drag = useSplitDrag();

const items = computed<TabItem[]>(() =>
  props.node.tabs.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
  })),
);

// ===== 拖拽放置 =====

const contentEl = ref<HTMLElement | null>(null);

/** 计算鼠标在内容区中的热区（仅左右 + 中心） */
function computeDropZone(e: DragEvent): DropZone {
  const el = contentEl.value;
  if (!el) return "center";

  const rect = el.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;

  const edge = 0.25;

  if (x < edge) return "left";
  if (x > 1 - edge) return "right";
  return "center";
}

function onContentDragOver(e: DragEvent) {
  if (!drag.isDragging.value) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

  const zone = computeDropZone(e);
  drag.setDropTarget(props.node.id, zone);
}

function onContentDragLeave(e: DragEvent) {
  const el = contentEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (
    e.clientX < rect.left || e.clientX > rect.right ||
    e.clientY < rect.top || e.clientY > rect.bottom
  ) {
    drag.setDropTarget(null, null);
  }
}

function onContentDrop(e: DragEvent) {
  e.preventDefault();
  const zone = computeDropZone(e);
  if (drag.fromPaneId.value && drag.tabId.value) {
    emit("drop-tab", {
      fromPaneId: drag.fromPaneId.value,
      tabId: drag.tabId.value,
      zone,
    });
  }
  drag.endDrag();
}

const isDropTarget = computed(() => drag.dropTargetPaneId.value === props.node.id);
const activeZone = computed(() => isDropTarget.value ? drag.dropZone.value : null);

// ===== 标签栏拖拽 =====

function onTabDragStart(tabId: string, paneGroupId: string) {
  drag.startDrag(tabId, paneGroupId);
}

function onTabDragEnd() {
  drag.endDrag();
}
</script>

<template>
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    :class="isActive ? '' : 'opacity-90'"
    @mousedown="emit('activate-pane')"
  >
    <!-- 标签栏 + 右键菜单 -->
    <ContextMenu>
      <ContextMenuTrigger as-child>
        <div class="shrink-0">
          <TabBar
            :tabs="items"
            :active-tab-id="node.activeTabId"
            :pane-group-id="node.id"
            @select="emit('set-active-tab', $event)"
            @close="emit('close-tab', $event)"
            @new-tab="emit('new-tab')"
            @drag-start="onTabDragStart"
            @drag-end="onTabDragEnd"
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent class="w-48">
        <ContextMenuItem @click="emit('split-right', node.activeTabId)">
          向右拆分
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @click="emit('close-tab', node.activeTabId)">
          关闭标签页
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>

    <!-- 内容区 + 拖放目标 -->
    <div
      ref="contentEl"
      class="relative min-h-0 flex-1 overflow-hidden"
      @dragover="onContentDragOver"
      @dragleave="onContentDragLeave"
      @drop="onContentDrop"
    >
      <slot :tabs="node.tabs" :active-tab-id="node.activeTabId" :pane-group-id="node.id" />

      <!-- 拖拽指示器覆盖层 -->
      <Transition name="drop-overlay">
        <div
          v-if="isDropTarget && activeZone"
          class="pointer-events-none absolute inset-0 z-50"
        >
          <!-- 左边缘 -->
          <div
            v-if="activeZone === 'left'"
            class="absolute inset-y-0 left-0 w-1/4 border-l-2 border-primary/80 bg-primary/10"
          />
          <!-- 右边缘 -->
          <div
            v-if="activeZone === 'right'"
            class="absolute inset-y-0 right-0 w-1/4 border-r-2 border-primary/80 bg-primary/10"
          />
          <!-- 中心 -->
          <div
            v-if="activeZone === 'center'"
            class="absolute inset-x-[25%] inset-y-[25%] rounded-sm border-2 border-primary/80 bg-primary/10"
          />
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.drop-overlay-enter-active { transition: opacity 100ms ease-out; }
.drop-overlay-leave-active { transition: opacity 150ms ease-in; }
.drop-overlay-enter-from,
.drop-overlay-leave-to { opacity: 0; }
</style>
