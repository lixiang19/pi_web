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
  (e: "set-active-tab", payload: { paneGroupId: string; tabId: string }): void;
  (e: "close-tab", payload: { paneGroupId: string; tabId: string }): void;
  (e: "split-right", payload: { paneGroupId: string; tabId?: string }): void;
  (e: "new-tab", payload: { paneGroupId: string }): void;
  (e: "resize-split", payload: { splitContainerId: string; sizes: [number, number] }): void;
  (e: "activate-pane", paneGroupId: string): void;
  (e: "drop-tab", payload: { fromPaneId: string; tabId: string; toPaneId: string; zone: DropZone }): void;
}>();

defineSlots<{
  default(props: { tabs: SplitTabItem[]; activeTabId: string; paneGroupId: string }): void;
}>();

function handlePaneGroupSetActiveTab(paneGroupId: string, tabId: string) {
  emit("set-active-tab", { paneGroupId, tabId });
}
function handlePaneGroupCloseTab(paneGroupId: string, tabId: string) {
  emit("close-tab", { paneGroupId, tabId });
}
function handlePaneGroupSplitRight(paneGroupId: string, tabId?: string) {
  emit("split-right", { paneGroupId, tabId });
}
function handlePaneGroupNewTab(paneGroupId: string) {
  emit("new-tab", { paneGroupId });
}
function handlePaneGroupActivatePane(paneGroupId: string) {
  emit("activate-pane", paneGroupId);
}
function handlePaneGroupDropTab(event: { fromPaneId: string; tabId: string; zone: DropZone }, paneGroupId: string) {
  emit("drop-tab", { ...event, toPaneId: paneGroupId });
}
</script>

<template>
  <SplitContainerComponent
    v-if="node.type === 'split'"
    :node="node"
    :active-pane-group-id="activePaneGroupId"
    @set-active-tab="emit('set-active-tab', $event)"
    @close-tab="emit('close-tab', $event)"
    @split-right="emit('split-right', $event)"
    @new-tab="emit('new-tab', $event)"
    @resize-split="emit('resize-split', $event)"
    @activate-pane="emit('activate-pane', $event)"
    @drop-tab="emit('drop-tab', $event)"
  >
    <template #default="slotData">
      <slot :tabs="slotData.tabs as SplitTabItem[]" :active-tab-id="slotData.activeTabId as string" :pane-group-id="slotData.paneGroupId as string" />
    </template>
  </SplitContainerComponent>

  <PaneGroupComponent
    v-else
    :node="node"
    :is-active="activePaneGroupId === node.id"
    @set-active-tab="handlePaneGroupSetActiveTab(node.id, $event)"
    @close-tab="handlePaneGroupCloseTab(node.id, $event)"
    @split-right="handlePaneGroupSplitRight(node.id, $event)"
    @new-tab="handlePaneGroupNewTab(node.id)"
    @activate-pane="handlePaneGroupActivatePane(node.id)"
    @drop-tab="handlePaneGroupDropTab($event, node.id)"
  >
    <template #default="slotData">
      <slot :tabs="slotData.tabs as SplitTabItem[]" :active-tab-id="slotData.activeTabId as string" :pane-group-id="slotData.paneGroupId as string" />
    </template>
  </PaneGroupComponent>
</template>
