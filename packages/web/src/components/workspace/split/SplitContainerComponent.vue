<script setup lang="ts">
import type { SplitContainer as SplitContainerType } from "@/composables/useSplitPanes";
import type { DropZone } from "@/composables/useSplitDrag";
import SplitGrid from "./SplitGrid.vue";
import SplitHandle from "./SplitHandle.vue";

const props = defineProps<{
  node: SplitContainerType;
  activePaneGroupId: string;
}>();

const emit = defineEmits<{
  (e: "set-active-tab", payload: { paneGroupId: string; tabId: string }): void;
  (e: "close-tab", payload: { paneGroupId: string; tabId: string }): void;
  (e: "split-right", payload: { paneGroupId: string; tabId?: string }): void;
  (e: "new-tab", payload: { paneGroupId: string }): void;
  (e: "resize-split", payload: { splitContainerId: string; sizes: [number, number] }): void;
  (e: "activate-pane", paneGroupId: string): void;
  (e: "drop-tab", payload: { fromPaneId: string; tabId: string; toPaneId: string; zone: DropZone }): void;
}>();

function handleResize(ratio: number) {
  emit("resize-split", {
    splitContainerId: props.node.id,
    sizes: [ratio, 100 - ratio] as [number, number],
  });
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
    <!-- 第一个子节点 -->
    <SplitGrid
      :node="node.children[0]"
      :active-pane-group-id="activePaneGroupId"
      class="min-h-0 min-w-0 overflow-hidden"
      :style="{ width: node.sizes[0] + '%' }"
      @set-active-tab="emit('set-active-tab', $event)"
      @close-tab="emit('close-tab', $event)"
      @split-right="emit('split-right', $event)"
      @new-tab="emit('new-tab', $event)"
      @resize-split="emit('resize-split', $event)"
      @activate-pane="emit('activate-pane', $event)"
      @drop-tab="emit('drop-tab', $event)"
    >
      <template #default="slotProps">
        <slot v-bind="slotProps" />
      </template>
    </SplitGrid>

    <!-- 分割线 -->
    <SplitHandle
      :initial-ratio="node.sizes[0]"
      @resize="handleResize"
    />

    <!-- 第二个子节点 -->
    <SplitGrid
      :node="node.children[1]"
      :active-pane-group-id="activePaneGroupId"
      class="min-h-0 min-w-0 flex-1 overflow-hidden"
      @set-active-tab="emit('set-active-tab', $event)"
      @close-tab="emit('close-tab', $event)"
      @split-right="emit('split-right', $event)"
      @new-tab="emit('new-tab', $event)"
      @resize-split="emit('resize-split', $event)"
      @activate-pane="emit('activate-pane', $event)"
      @drop-tab="emit('drop-tab', $event)"
    >
      <template #default="slotProps">
        <slot v-bind="slotProps" />
      </template>
    </SplitGrid>
  </div>
</template>
