import { computed, ref } from "vue";

// ===== 类型定义 =====

export interface PaneGroup {
	type: "pane";
	id: string;
	tabs: SplitTabItem[];
	activeTabId: string;
}

export interface SplitContainer {
	type: "split";
	id: string;
	children: [GridNode, GridNode];
	sizes: [number, number];
}

export type GridNode = PaneGroup | SplitContainer;

export interface SplitTabItem {
	id: string;
	title: string;
	kind: "view" | "file" | "home" | "session" | "terminal" | "automation" | "settings";
	viewId?: string;
	filePath?: string;
	sessionId?: string;
	terminalId?: string;
	status?: "idle" | "saving" | "unsaved" | "error" | "loading";
	onClose?: (tab: SplitTabItem) => void;
}

// 序列化类型
export type SerializableGridNode =
	| {
			type: "pane";
			id: string;
			tabs: {
				id: string;
				kind: string;
				viewId?: string;
				filePath?: string;
				sessionId?: string;
				terminalId?: string;
				title: string;
			}[];
			activeTabId: string;
	  }
	| {
			type: "split";
			id: string;
			sizes: [number, number];
			children: [SerializableGridNode, SerializableGridNode];
	  };

// ===== ID 生成 =====

let idCounter = 0;
const generateId = () => `sp-${++idCounter}-${Date.now().toString(36)}`;
let homeCounter = 0;
let terminalCounter = 0;
export const generateHomeId = () => `home-${++homeCounter}`;
export const generateTerminalTabId = () => `terminal-tab-${++terminalCounter}`;

export const createHomeTab = (): SplitTabItem => ({
	id: generateHomeId(),
	title: "主页",
	kind: "home",
	status: "idle",
});

export const createTerminalTab = (
	terminalId: string,
	title?: string,
): SplitTabItem => ({
	id: generateTerminalTabId(),
	title: title ?? `终端 ${terminalCounter}`,
	kind: "terminal",
	terminalId,
	status: "idle",
});

export const createAutomationTab = (): SplitTabItem => ({
	id: "automation",
	title: "自动化",
	kind: "automation",
	status: "idle",
});

export const createSettingsTab = (): SplitTabItem => ({
	id: "settings",
	title: "设置",
	kind: "settings",
	status: "idle",
});

// ===== 初始布局 =====

export function createInitialGrid(): PaneGroup {
	const homeTab = createHomeTab();
	return {
		type: "pane",
		id: generateId(),
		tabs: [homeTab],
		activeTabId: homeTab.id,
	};
}

// ===== 树操作辅助 =====

type NodeReplacer = (node: GridNode) => GridNode;

function replaceNode(
	root: GridNode,
	targetId: string,
	replacer: NodeReplacer,
): GridNode {
	if (root.type === "pane") {
		return root.id === targetId ? replacer(root) : root;
	}
	if (root.id === targetId) return replacer(root);
	const newChildren: [GridNode, GridNode] = [
		replaceNode(root.children[0], targetId, replacer),
		replaceNode(root.children[1], targetId, replacer),
	];
	return { ...root, children: newChildren };
}

function replaceNodeWith(
	root: GridNode,
	targetId: string,
	replacement: GridNode,
): GridNode {
	return replaceNode(root, targetId, () => replacement);
}

function findPaneGroup(root: GridNode, id: string): PaneGroup | null {
	if (root.type === "pane") return root.id === id ? root : null;
	return (
		findPaneGroup(root.children[0], id) ?? findPaneGroup(root.children[1], id)
	);
}

function findParentSplit(
	root: GridNode,
	targetId: string,
): SplitContainer | null {
	if (root.type === "pane") return null;
	if (root.children[0].id === targetId || root.children[1].id === targetId)
		return root;
	return (
		findParentSplit(root.children[0], targetId) ??
		findParentSplit(root.children[1], targetId)
	);
}

function flattenPaneGroups(root: GridNode): PaneGroup[] {
	if (root.type === "pane") return [root];
	return [
		...flattenPaneGroups(root.children[0]),
		...flattenPaneGroups(root.children[1]),
	];
}

// ===== Composable =====

export function useSplitPanes() {
	const rootNode = ref<GridNode>(createInitialGrid());
	const activePaneGroupId = ref(rootNode.value.id);

	const allPaneGroups = computed(() => flattenPaneGroups(rootNode.value));

	const activePaneGroup = computed(
		() =>
			allPaneGroups.value.find((p) => p.id === activePaneGroupId.value) ??
			allPaneGroups.value[0],
	);

	function findTabAcrossPanes(
		tabId: string,
	): { pane: PaneGroup; tab: SplitTabItem } | null {
		for (const pane of allPaneGroups.value) {
			const tab = pane.tabs.find((t) => t.id === tabId);
			if (tab) return { pane, tab };
		}
		return null;
	}

	// ===== PaneGroup 操作 =====

	function openTab(paneGroupId: string, tab: SplitTabItem) {
		const existing = findTabAcrossPanes(tab.id);
		if (existing) {
			setActiveTab(existing.pane.id, tab.id);
			return;
		}

		const root = rootNode.value;
		const pane = findPaneGroup(root, paneGroupId);
		if (!pane) return;

		const newTabs = [...pane.tabs, tab];
		const newPane: PaneGroup = { ...pane, tabs: newTabs, activeTabId: tab.id };
		rootNode.value = replaceNodeWith(root, paneGroupId, newPane);
		activePaneGroupId.value = newPane.id;
	}

	function closeTab(paneGroupId: string, tabId: string) {
		const root = rootNode.value;
		const pane = findPaneGroup(root, paneGroupId);
		if (!pane) return;

		const closedTab = pane.tabs.find((t) => t.id === tabId);
		if (closedTab?.onClose) {
			closedTab.onClose(closedTab);
		}

		const newTabs = pane.tabs.filter((t) => t.id !== tabId);

		// 关完标签 → 补一个主页，面板永不为空
		if (newTabs.length === 0) {
			const homeTab = createHomeTab();
			const newPane: PaneGroup = {
				...pane,
				tabs: [homeTab],
				activeTabId: homeTab.id,
			};
			rootNode.value = replaceNodeWith(root, paneGroupId, newPane);
			activePaneGroupId.value = newPane.id;
			return;
		}

		let newActiveTabId = pane.activeTabId;
		if (newActiveTabId === tabId) {
			const closedIndex = pane.tabs.findIndex((t) => t.id === tabId);
			newActiveTabId = newTabs[Math.min(closedIndex, newTabs.length - 1)]!.id;
		}

		const newPane: PaneGroup = {
			...pane,
			tabs: newTabs,
			activeTabId: newActiveTabId,
		};
		rootNode.value = replaceNodeWith(root, paneGroupId, newPane);
	}

	function setActiveTab(paneGroupId: string, tabId: string) {
		const root = rootNode.value;
		const pane = findPaneGroup(root, paneGroupId);
		if (!pane || pane.activeTabId === tabId) return;

		const newPane: PaneGroup = { ...pane, activeTabId: tabId };
		rootNode.value = replaceNodeWith(root, paneGroupId, newPane);
		activePaneGroupId.value = newPane.id;
	}

	function moveTab(fromPaneId: string, toPaneId: string, tabId: string) {
		if (fromPaneId === toPaneId) return;

		const root = rootNode.value;
		const fromPane = findPaneGroup(root, fromPaneId);
		const toPane = findPaneGroup(root, toPaneId);
		if (!fromPane || !toPane) return;

		const tab = fromPane.tabs.find((t) => t.id === tabId);
		if (!tab) return;

		// 从源面板移除
		const newFromTabs = fromPane.tabs.filter((t) => t.id !== tabId);

		let newFromActiveTabId = fromPane.activeTabId;
		if (newFromActiveTabId === tabId) {
			if (newFromTabs.length > 0) {
				const closedIndex = fromPane.tabs.findIndex((t) => t.id === tabId);
				newFromActiveTabId =
					newFromTabs[Math.min(closedIndex, newFromTabs.length - 1)]!.id;
			} else {
				const homeTab = createHomeTab();
				newFromTabs.push(homeTab);
				newFromActiveTabId = homeTab.id;
			}
		}

		const newFromPane: PaneGroup = {
			...fromPane,
			tabs: newFromTabs,
			activeTabId: newFromActiveTabId,
		};
		const newToTabs = [...toPane.tabs, tab];
		const newToPane: PaneGroup = {
			...toPane,
			tabs: newToTabs,
			activeTabId: tab.id,
		};

		let newRoot = replaceNodeWith(root, fromPaneId, newFromPane);
		newRoot = replaceNodeWith(newRoot, toPaneId, newToPane);
		rootNode.value = newRoot;
		activePaneGroupId.value = newToPane.id;
	}

	// ===== 分屏操作（仅水平） =====

	function splitRight(paneGroupId: string, tabIdToMove?: string) {
		const root = rootNode.value;
		const pane = findPaneGroup(root, paneGroupId);
		if (!pane) return;

		const newPane: PaneGroup = {
			type: "pane",
			id: generateId(),
			tabs: [],
			activeTabId: "",
		};

		let leftTabs = pane.tabs;
		let rightTabs: SplitTabItem[] = [];

		if (tabIdToMove) {
			const tab = pane.tabs.find((t) => t.id === tabIdToMove);
			if (tab) {
				leftTabs = pane.tabs.filter((t) => t.id !== tabIdToMove);
				rightTabs = [tab];
				newPane.activeTabId = tab.id;
			}
		}

		// 左侧为空 → 补主页
		if (leftTabs.length === 0) {
			const homeTab = createHomeTab();
			leftTabs = [homeTab];
		}

		// 右侧为空 → 补主页
		if (rightTabs.length === 0) {
			const homeTab = createHomeTab();
			rightTabs = [homeTab];
			newPane.activeTabId = homeTab.id;
		}

		const updatedPane: PaneGroup = {
			...pane,
			tabs: leftTabs,
			activeTabId: leftTabs[leftTabs.length - 1]!.id,
		};

		newPane.tabs = rightTabs;
		if (!newPane.activeTabId) {
			newPane.activeTabId = rightTabs[0]!.id;
		}

		const split: SplitContainer = {
			type: "split",
			id: generateId(),
			children: [updatedPane, newPane],
			sizes: [50, 50],
		};

		rootNode.value = replaceNodeWith(root, paneGroupId, split);
		activePaneGroupId.value = newPane.id;
	}

	function dropTabToEdge(
		fromPaneId: string,
		tabId: string,
		targetPaneId: string,
		side: "left" | "right",
	) {
		const root = rootNode.value;
		const fromPane = findPaneGroup(root, fromPaneId);
		const target = findPaneGroup(root, targetPaneId);
		if (!fromPane || !target) return;

		const tab = fromPane.tabs.find((t) => t.id === tabId);
		if (!tab) return;

		// 从源面板移除标签
		const newFromTabs = fromPane.tabs.filter((t) => t.id !== tabId);
		if (newFromTabs.length === 0) {
			const homeTab = createHomeTab();
			newFromTabs.push(homeTab);
			let newActiveTabId = fromPane.activeTabId;
			if (newActiveTabId === tabId) newActiveTabId = homeTab.id;
			const newFromPane: PaneGroup = {
				...fromPane,
				tabs: newFromTabs,
				activeTabId: newActiveTabId,
			};
			rootNode.value = replaceNodeWith(rootNode.value, fromPaneId, newFromPane);
		} else {
			let newActiveTabId = fromPane.activeTabId;
			if (newActiveTabId === tabId) {
				const idx = fromPane.tabs.findIndex((t) => t.id === tabId);
				newActiveTabId = newFromTabs[Math.min(idx, newFromTabs.length - 1)]!.id;
			}
			const newFromPane: PaneGroup = {
				...fromPane,
				tabs: newFromTabs,
				activeTabId: newActiveTabId,
			};
			rootNode.value = replaceNodeWith(rootNode.value, fromPaneId, newFromPane);
		}

		const newPane: PaneGroup = {
			type: "pane",
			id: generateId(),
			tabs: [tab],
			activeTabId: tab.id,
		};

		const updatedTargetPane = findPaneGroup(rootNode.value, targetPaneId);
		if (!updatedTargetPane) return;

		const split: SplitContainer = {
			type: "split",
			id: generateId(),
			children:
				side === "left"
					? [newPane, updatedTargetPane]
					: [updatedTargetPane, newPane],
			sizes: [50, 50],
		};

		rootNode.value = replaceNodeWith(rootNode.value, targetPaneId, split);
		activePaneGroupId.value = newPane.id;
	}

	function resizeSplit(splitContainerId: string, sizes: [number, number]) {
		const root = rootNode.value;
		const clamp = (v: number) => Math.max(15, Math.min(85, v));
		const clamped: [number, number] = [clamp(sizes[0]), clamp(sizes[1])];

		rootNode.value = replaceNode(root, splitContainerId, (node) => {
			if (node.type === "split") return { ...node, sizes: clamped };
			return node;
		});
	}

	function closePaneGroup(paneGroupId: string) {
		const root = rootNode.value;
		if (root.type === "pane" && root.id === paneGroupId) return;

		const parent = findParentSplit(root, paneGroupId);
		if (!parent) return;

		const sibling =
			parent.children[0].id === paneGroupId
				? parent.children[1]
				: parent.children[0];
		rootNode.value = replaceNodeWith(root, parent.id, sibling);

		if (activePaneGroupId.value === paneGroupId) {
			const newPanes = flattenPaneGroups(sibling);
			activePaneGroupId.value = newPanes[0]?.id ?? sibling.id;
		}
	}

	// ===== 序列化 =====

	function exportSnapshot(): SerializableGridNode {
		return serializeNode(rootNode.value);
	}

	function importSnapshot(snapshot: SerializableGridNode) {
		rootNode.value = deserializeNode(snapshot);
		const panes = flattenPaneGroups(rootNode.value);
		activePaneGroupId.value = panes[0]?.id ?? rootNode.value.id;
	}

	return {
		rootNode,
		activePaneGroupId,
		allPaneGroups,
		activePaneGroup,
		openTab,
		closeTab,
		setActiveTab,
		moveTab,
		splitRight,
		dropTabToEdge,
		resizeSplit,
		closePaneGroup,
		findTabAcrossPanes,
		exportSnapshot,
		importSnapshot,
	};
}

// ===== 序列化/反序列化 =====

function serializeNode(node: GridNode): SerializableGridNode {
	if (node.type === "pane") {
		return {
			type: "pane",
			id: node.id,
			tabs: node.tabs.map((t) => ({
				id: t.id,
				kind: t.kind,
				viewId: t.viewId,
				filePath: t.filePath,
				sessionId: t.sessionId,
				terminalId: t.terminalId,
				title: t.title,
			})),
			activeTabId: node.activeTabId,
		};
	}
	return {
		type: "split",
		id: node.id,
		sizes: node.sizes,
		children: [
			serializeNode(node.children[0]),
			serializeNode(node.children[1]),
		],
	};
}

function deserializeNode(node: SerializableGridNode): GridNode {
	if (node.type === "pane") {
		return {
			type: "pane",
			id: node.id,
			tabs: node.tabs.map((t) => ({
				id: t.id,
				title: t.title,
				kind: t.kind as SplitTabItem["kind"],
				viewId: t.viewId,
				filePath: t.filePath,
				sessionId: t.sessionId,
				terminalId: t.terminalId,
				status: "idle" as const,
			})),
			activeTabId: node.activeTabId,
		};
	}
	return {
		type: "split",
		id: node.id,
		sizes: node.sizes,
		children: [
			deserializeNode(node.children[0]),
			deserializeNode(node.children[1]),
		],
	};
}
