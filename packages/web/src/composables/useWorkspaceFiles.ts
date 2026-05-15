import { ref } from "vue";
import {
	createFileEntry,
	getWorkspaceFilesTree,
	moveFileEntry,
	retryFileProcessing,
	convertFile,
	trashFileEntry,
	uploadFiles,
} from "@/lib/api";
import type { FileTreeEntry } from "@/lib/types";

export function getParentPath(currentPath: string): string | null {
	const normalized = currentPath.replace(/\\/g, "/").replace(/\/+$/, "");
	if (!normalized || normalized === "/") return null;
	const lastIndex = normalized.lastIndexOf("/");
	if (lastIndex <= 0) return null;
	const parent = normalized.slice(0, lastIndex);
	if (!parent || parent === normalized) return null;
	return parent;
}

export function useWorkspaceFiles() {
	const entries = ref<FileTreeEntry[]>([]);
	const workspaceRoot = ref("");
	const currentPath = ref("");
	const loading = ref(false);
	const error = ref("");

	const load = async (targetPath: string) => {
		loading.value = true;
		error.value = "";
		try {
			const res = await getWorkspaceFilesTree(targetPath);
			entries.value = res.entries;
			workspaceRoot.value = res.root;
			currentPath.value = res.directory;
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
			entries.value = [];
		} finally {
			loading.value = false;
		}
	};

	const navigate = async (targetPath: string) => {
		await load(targetPath);
	};

	const navigateBack = async () => {
		if (currentPath.value === workspaceRoot.value) return;
		const parent = getParentPath(currentPath.value);
		if (!parent) return;
		await load(parent);
	};

	const retry = async (filePath: string) => {
		error.value = "";
		try {
			await retryFileProcessing(filePath);
			// Refresh current directory to show updated status
			await load(currentPath.value);
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
		}
	};

	/**
	 * Manual re-convert a file (with force option to overwrite user-edited markdown).
	 * This provides the "重新转换" product-level entry point for files whose
	 * original has already been moved to .originals/.
	 */
	const convert = async (filePath: string, force = false) => {
		error.value = "";
		try {
			await convertFile(filePath, force);
			// Refresh current directory to show updated status
			await load(currentPath.value);
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
		}
	};

	const refreshCurrentDirectory = async () => {
		await load(currentPath.value || workspaceRoot.value);
	};

	const upload = async (files: File[]) => {
		if (!workspaceRoot.value || !currentPath.value || files.length === 0) return;
		error.value = "";
		try {
			await uploadFiles(workspaceRoot.value, currentPath.value, files);
			await refreshCurrentDirectory();
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
		}
	};

	const createFolder = async (name: string) => {
		if (!workspaceRoot.value || !currentPath.value || !name.trim()) return;
		error.value = "";
		try {
			await createFileEntry({
				root: workspaceRoot.value,
				directory: currentPath.value,
				name: name.trim(),
				kind: "directory",
			});
			await refreshCurrentDirectory();
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
		}
	};

	const rename = async (filePath: string, name: string) => {
		if (!workspaceRoot.value || !name.trim()) return;
		error.value = "";
		try {
			await moveFileEntry({
				root: workspaceRoot.value,
				path: filePath,
				name: name.trim(),
			});
			await refreshCurrentDirectory();
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
		}
	};

	const move = async (filePath: string, targetDirectory: string) => {
		if (!workspaceRoot.value || !targetDirectory.trim()) return;
		error.value = "";
		try {
			await moveFileEntry({
				root: workspaceRoot.value,
				path: filePath,
				targetDirectory: targetDirectory.trim(),
			});
			await refreshCurrentDirectory();
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
		}
	};

	const remove = async (filePath: string) => {
		if (!workspaceRoot.value) return;
		error.value = "";
		try {
			await trashFileEntry(workspaceRoot.value, filePath);
			await refreshCurrentDirectory();
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
		}
	};

	return {
		entries,
		workspaceRoot,
		currentPath,
		loading,
		error,
		load,
		navigate,
		navigateBack,
		retry,
		convert,
		upload,
		createFolder,
		rename,
		move,
		remove,
	};
}
