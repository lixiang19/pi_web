<script setup lang="ts">
import type { SplitContainer as SplitContainerType, SplitTabItem } from "@/composables/useSplitPanes";
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

defineSlots<{
  default(props: { tabs: SplitTabItem[]; activeTabId: string; paneGroupId: string }): unknown;
}>();

function forwardSetActiveTab(paneGroupId: string, tabId: string) {
  emit("set-active-tab", { paneGroupId, tabId });
}

function forwardCloseTab(paneGroupId: string, tabId: string) {
  emit("close-tab", { paneGroupId, tabId });
}

function forwardSplitRight(paneGroupId: string, tabId?: string) {
  emit("split-right", { paneGroupId, tabId });
}

function forwardNewTab(paneGroupId: string) {
  emit("new-tab", { paneGroupId });
}

function forwardResizeSplit(splitContainerId: string, sizes: [number, number]) {
  emit("resize-split", { splitContainerId, sizes });
}

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
      @set-active-tab="forwardSetActiveTab"
      @close-tab="forwardCloseTab"
      @split-right="forwardSplitRight"
      @new-tab="forwardNewTab"
      @resize-split="forwardResizeSplit"
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
      @set-active-tab="forwardSetActiveTab"
      @close-tab="forwardCloseTab"
      @split-right="forwardSplitRight"
      @new-tab="forwardNewTab"
      @resize-split="forwardResizeSplit"
      @activate-pane="emit('activate-pane', $event)"
      @drop-tab="emit('drop-tab', $event)"
    >
      <template #default="slotProps">
        <slot v-bind="slotProps" />
      </template>
    </SplitGrid>
  </div>
</template>
