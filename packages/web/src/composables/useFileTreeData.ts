import { computed, ref, watch } from "vue";

import { getFileTree } from "@/lib/api";
import type { FileTreeEntry } from "@/lib/types";

export interface VisibleTreeNode {
	entry: FileTreeEntry;
	depth: number;
}

export function useFileTreeData(rootDir: () => string) {
	const childrenByDirectory = ref<Record<string, FileTreeEntry[]>>({});
	const expandedDirectories = ref<string[]>([]);
	const loadingDirectories = ref<string[]>([]);
	const fileTreeError = ref("");

	const normalizePath = (value: string) =>
		value.replace(/\\/g, "/").replace(/\/+$/, "");

	const rootPath = computed(() => normalizePath(rootDir()));

	const isDirectoryExpanded = (directoryPath: string) =>
		expandedDirectories.value.includes(directoryPath);

	const isDirectoryLoading = (directoryPath: string) =>
		loadingDirectories.value.includes(directoryPath);

	const setDirectoryEntries = (
		directoryPath: string,
		entries: FileTreeEntry[],
	) => {
		childrenByDirectory.value = {
			...childrenByDirectory.value,
			[directoryPath]: entries,
		};
	};

	const loadDirectory = async (
		directoryPath: string,
		options?: { force?: boolean },
	) => {
		const normalizedDirectory = normalizePath(directoryPath);
		if (!normalizedDirectory) {
			return;
		}

		if (!options?.force && childrenByDirectory.value[normalizedDirectory]) {
			return;
		}

		if (isDirectoryLoading(normalizedDirectory)) {
			return;
		}

		loadingDirectories.value = [
			...loadingDirectories.value,
			normalizedDirectory,
		];
		fileTreeError.value = "";

		try {
			const payload = await getFileTree(
				normalizedDirectory,
				rootPath.value || normalizedDirectory,
			);
			setDirectoryEntries(normalizedDirectory, payload.entries);
		} catch (caughtError) {
			fileTreeError.value =
				caughtError instanceof Error
					? caughtError.message
					: String(caughtError);
		} finally {
			loadingDirectories.value = loadingDirectories.value.filter(
				(path) => path !== normalizedDirectory,
			);
		}
	};

	const toggleDirectory = async (entry: FileTreeEntry) => {
		if (entry.kind !== "directory") {
			return;
		}

		if (isDirectoryExpanded(entry.path)) {
			expandedDirectories.value = expandedDirectories.value.filter(
				(path) => path !== entry.path,
			);
			return;
		}

		expandedDirectories.value = [...expandedDirectories.value, entry.path];
		await loadDirectory(entry.path);
	};

	const expandToPath = async (targetPath: string) => {
		const normalizedTarget = normalizePath(targetPath);
		if (!normalizedTarget || !rootPath.value) return;

		const parts = normalizedTarget
			.replace(rootPath.value, "")
			.split("/")
			.filter(Boolean);
		let currentPath = rootPath.value;

		for (const part of parts.slice(0, -1)) {
			currentPath = `${currentPath}/${part}`;
			if (!isDirectoryExpanded(currentPath)) {
				expandedDirectories.value = [...expandedDirectories.value, currentPath];
				await loadDirectory(currentPath);
			}
		}
	};

	const visibleNodes = computed<VisibleTreeNode[]>(() => {
		const root = rootPath.value;
		if (!root) {
			return [];
		}

		const flatten = (
			directoryPath: string,
			depth: number,
		): VisibleTreeNode[] => {
			const entries = childrenByDirectory.value[directoryPath] ?? [];
			const nodes: VisibleTreeNode[] = [];

			for (const entry of entries) {
				nodes.push({ entry, depth });

				if (entry.kind === "directory" && isDirectoryExpanded(entry.path)) {
					nodes.push(...flatten(entry.path, depth + 1));
				}
			}

			return nodes;
		};

		return flatten(root, 0);
	});

	const refreshTree = async () => {
		const root = rootPath.value;
		if (!root) {
			return;
		}

		childrenByDirectory.value = {};
		expandedDirectories.value = [root];
		await loadDirectory(root, { force: true });
	};

	watch(
		rootPath,
		async (nextRoot) => {
			if (!nextRoot) {
				childrenByDirectory.value = {};
				expandedDirectories.value = [];
				fileTreeError.value = "";
				return;
			}

			childrenByDirectory.value = {};
			expandedDirectories.value = [nextRoot];
			await loadDirectory(nextRoot, { force: true });
		},
		{ immediate: true },
	);

	return {
		rootPath,
		childrenByDirectory,
		expandedDirectories,
		loadingDirectories,
		fileTreeError,
		visibleNodes,
		isDirectoryExpanded,
		isDirectoryLoading,
		loadDirectory,
		toggleDirectory,
		expandToPath,
		refreshTree,
	};
}
