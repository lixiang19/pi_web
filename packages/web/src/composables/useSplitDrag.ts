import { ref } from "vue";

export type DropZone = "center" | "left" | "right";

// ===== 模块级单例 —— 同一时间只有一个分屏网格在拖拽 =====

const isDragging = ref(false);
const tabId = ref<string | null>(null);
const fromPaneId = ref<string | null>(null);
const dropTargetPaneId = ref<string | null>(null);
const dropZone = ref<DropZone | null>(null);

function startDrag(tTabId: string, tPaneId: string) {
	isDragging.value = true;
	tabId.value = tTabId;
	fromPaneId.value = tPaneId;
	dropTargetPaneId.value = null;
	dropZone.value = null;
}

function endDrag() {
	isDragging.value = false;
	tabId.value = null;
	fromPaneId.value = null;
	dropTargetPaneId.value = null;
	dropZone.value = null;
}

function setDropTarget(paneId: string | null, zone: DropZone | null) {
	dropTargetPaneId.value = paneId;
	dropZone.value = zone;
}

export function useSplitDrag() {
	return {
		isDragging,
		tabId,
		fromPaneId,
		dropTargetPaneId,
		dropZone,
		startDrag,
		endDrag,
		setDropTarget,
	};
}
