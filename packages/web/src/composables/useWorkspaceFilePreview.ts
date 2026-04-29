import { computed, type Ref, ref, watch } from "vue";

import {
	getFilePreview,
	getFilePreviewWindow,
	openFileWithDefaultApp,
} from "@/lib/api";
import type { FilePreviewKind, FilePreviewPayload } from "@/lib/types";

const FILE_PREVIEW_WINDOW_LINE_COUNT = 1000;

export type WorkspaceFileTab = {
	id: string;
	path: string;
	root: string;
	title: string;
	extension: string;
	mimeType: string;
	previewKind: FilePreviewKind;
	content: string;
	isLoading: boolean;
	error: string;
	isLargeFile: boolean;
	previewLineCount: number;
	nextStartLine: number | null;
	isLoadingMore: boolean;
};

const getFileName = (filePath: string) =>
	filePath.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) || filePath;

const createTab = (root: string, filePath: string): WorkspaceFileTab => ({
	id: filePath,
	path: filePath,
	root,
	title: getFileName(filePath),
	extension: "",
	mimeType: "",
	previewKind: "unsupported",
	content: "",
	isLoading: true,
	error: "",
	isLargeFile: false,
	previewLineCount: 0,
	nextStartLine: null,
	isLoadingMore: false,
});

const applyPayload = (tab: WorkspaceFileTab, payload: FilePreviewPayload) => {
	tab.root = payload.root;
	tab.path = payload.path;
	tab.title = payload.name;
	tab.extension = payload.extension;
	tab.mimeType = payload.mimeType;
	tab.previewKind = payload.previewKind;
	tab.content = payload.content ?? "";
	tab.isLoading = false;
	tab.isLargeFile = payload.isLargeFile === true;
	tab.previewLineCount = payload.previewLineCount ?? 0;
	tab.nextStartLine = payload.nextStartLine ?? null;
	tab.isLoadingMore = false;
	tab.error = "";
};

export function useWorkspaceFilePreview(rootDir: Ref<string>) {
	const tabs = ref<WorkspaceFileTab[]>([]);
	const activeTabId = ref("");

	const activeTab = computed(
		() => tabs.value.find((t) => t.id === activeTabId.value) ?? null,
	);

	const findTab = (tabId: string) =>
		tabs.value.find((t) => t.id === tabId) ?? null;

	const openFile = async (filePath: string) => {
		const root = rootDir.value;
		if (!root) return;

		const existing = tabs.value.find((t) => t.path === filePath);
		if (existing) {
			activeTabId.value = existing.id;
			return;
		}

		const tab = createTab(root, filePath);
		tabs.value = [...tabs.value, tab];
		activeTabId.value = tab.id;

		try {
			const payload = await getFilePreview(filePath, root);
			const current = findTab(tab.id);
			if (current) applyPayload(current, payload);
		} catch (err) {
			const current = findTab(tab.id);
			if (current) {
				current.isLoading = false;
				current.previewKind = "unsupported";
				current.error = err instanceof Error ? err.message : String(err);
			}
		}
	};

	const activateTab = (tabId: string) => {
		activeTabId.value = tabId;
	};

	const closeTab = (tabId: string) => {
		const index = tabs.value.findIndex((t) => t.id === tabId);
		if (index < 0) return;
		tabs.value = tabs.value.filter((t) => t.id !== tabId);

		if (activeTabId.value === tabId) {
			const next = tabs.value[Math.min(index, tabs.value.length - 1)];
			activeTabId.value = next?.id ?? "";
		}
	};

	const loadMore = async (tabId: string) => {
		const tab = findTab(tabId);
		if (
			!tab ||
			tab.isLoading ||
			tab.isLoadingMore ||
			!tab.isLargeFile ||
			tab.nextStartLine === null ||
			(tab.previewKind !== "code" && tab.previewKind !== "text")
		)
			return;

		const startLine = tab.nextStartLine;
		tab.isLoadingMore = true;
		tab.error = "";

		try {
			const payload = await getFilePreviewWindow(
				tab.path,
				tab.root,
				startLine,
				FILE_PREVIEW_WINDOW_LINE_COUNT,
			);
			const current = findTab(tabId);
			if (!current) return;

			current.content += "\n" + payload.content;
			current.previewLineCount += payload.lineCount;
			current.nextStartLine = payload.nextStartLine ?? null;
			current.isLoadingMore = false;
		} catch (err) {
			const current = findTab(tabId);
			if (current) {
				current.isLoadingMore = false;
				current.error = err instanceof Error ? err.message : String(err);
			}
		}
	};

	const openWithDefaultApp = async (filePath: string) => {
		const root = rootDir.value;
		if (!root) return;
		await openFileWithDefaultApp(root, filePath);
	};

	watch(rootDir, (nextRoot, previousRoot) => {
		if (previousRoot && nextRoot !== previousRoot) {
			tabs.value = [];
			activeTabId.value = "";
		}
	});

	return {
		tabs,
		activeTabId,
		activeTab,
		openFile,
		activateTab,
		closeTab,
		loadMore,
		openWithDefaultApp,
	};
}
