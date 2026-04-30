<script setup lang="ts">
import type { GridNode, SplitTabItem } from "@/composables/useSplitPanes";
import type { DropZone } from "@/composables/useSplitDrag";
import PaneGroupComponent from "./PaneGroupComponent.vue";
import SplitContainerComponent from "./SplitContainerComponent.vue";

defineProps<{
  node: GridNode;
  activePaneGroupId: string;
}>();

const emit = defineEmits<{
  (e: "set-active-tab", paneGroupId: string, tabId: string): void;
  (e: "close-tab", paneGroupId: string, tabId: string): void;
  (e: "split-right", paneGroupId: string, tabId?: string): void;
  (e: "new-tab", paneGroupId: string): void;
  (e: "resize-split", splitContainerId: string, sizes: [number, number]): void;
  (e: "activate-pane", paneGroupId: string): void;
  (e: "drop-tab", payload: { fromPaneId: string; tabId: string; toPaneId: string; zone: DropZone }): void;
}>();

defineSlots<{
  default(props: { tabs: SplitTabItem[]; activeTabId: string; paneGroupId: string }): unknown;
}>();
</script>

<template>
  <SplitContainerComponent
    v-if="node.type === 'split'"
    :node="node"
    :active-pane-group-id="activePaneGroupId"
    @set-active-tab="emit('set-active-tab', $event.paneGroupId, $event.tabId)"
    @close-tab="emit('close-tab', $event.paneGroupId, $event.tabId)"
    @split-right="emit('split-right', $event.paneGroupId, $event.tabId)"
    @new-tab="emit('new-tab', $event.paneGroupId ?? $event)"
    @resize-split="emit('resize-split', $event.splitContainerId, $event.sizes)"
    @activate-pane="emit('activate-pane', $event)"
    @drop-tab="emit('drop-tab', $event)"
  >
    <template #default="slotProps">
      <slot v-bind="slotProps" />
    </template>
  </SplitContainerComponent>

  <PaneGroupComponent
    v-else
    :node="node"
    :is-active="activePaneGroupId === node.id"
    @set-active-tab="emit('set-active-tab', node.id, $event)"
    @close-tab="emit('close-tab', node.id, $event)"
    @split-right="emit('split-right', node.id, $event)"
    @new-tab="emit('new-tab', node.id)"
    @activate-pane="emit('activate-pane', node.id)"
    @drop-tab="emit('drop-tab', { ...$event, toPaneId: node.id })"
  >
    <template #default="slotProps">
      <slot v-bind="slotProps" />
    </template>
  </PaneGroupComponent>
</template>
