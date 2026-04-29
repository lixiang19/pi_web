import { type InjectionKey, computed, inject, provide, ref, watch } from "vue";
import { toast } from "vue-sonner";

import { createNote, deleteNote, getFileTree, getNoteContent, moveFileEntry, renameNote } from "@/lib/api";
import type { NoteContentResponse } from "@/lib/types";

export type InboxFileItem = {
	path: string;
	name: string;
	relativePath: string;
	modifiedAt: number;
	extension: string;
	preview: string;
};

export type InboxSortKey = "modified" | "created" | "name";

// Provide/Inject key for shared inbox store
export const WORKSPACE_INBOX_KEY: InjectionKey<ReturnType<typeof useInboxInner>> =
	Symbol("workspace-inbox");

export function provideWorkspaceInbox(workspaceDir: () => string) {
	const store = useInboxInner(workspaceDir);
	provide(WORKSPACE_INBOX_KEY, store);
	return store;
}

export function useWorkspaceInbox(workspaceDir?: () => string) {
	const injected = inject(WORKSPACE_INBOX_KEY, undefined);
	if (injected) return injected;
	return useInboxInner(workspaceDir!);
}

// Relative time formatting
function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (seconds < 60) return "刚刚";
	if (minutes < 60) return `${minutes} 分钟前`;
	if (hours < 24) return `${hours} 小时前`;
	if (days < 7) return `${days} 天前`;

	return new Intl.DateTimeFormat("zh-CN", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(timestamp);
}

// Extract first meaningful line from content (skip frontmatter, headings, empty lines)
function extractPreview(content: string): string {
	let body = content;

	// Skip frontmatter
	if (body.startsWith("---")) {
		const fmEnd = body.indexOf("\n---", 4);
		if (fmEnd > 0) {
			body = body.slice(fmEnd + 4).trim();
		}
	}

	const lines = body.split("\n").filter((l) => l.trim());
	// Skip heading line if it's just the auto-generated title
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith("# ")) continue;
		if (!trimmed) continue;
		// Return first non-heading, non-empty line, truncated
		return trimmed.length > 80 ? trimmed.slice(0, 80) + "…" : trimmed;
	}

	return "";
}

function useInboxInner(workspaceDir: () => string) {
	const inboxFiles = ref<InboxFileItem[]>([]);
	const isLoading = ref(false);
	const error = ref("");
	const searchQuery = ref("");
	const sortKey = ref<InboxSortKey>("modified");

	const INBOX_DIR = "收件箱";

	const load = async () => {
		const dir = workspaceDir();
		if (!dir) return;

		isLoading.value = true;
		error.value = "";
		try {
			const res = await getFileTree(`${dir}/${INBOX_DIR}`, dir);
			const files = res.entries
				.filter((e) => e.kind === "file")
				.sort((a, b) => b.modifiedAt - a.modifiedAt);

			// Load previews for each file (limit to first 20 for performance)
			const previewLimit = 20;
			const items: InboxFileItem[] = [];

			const slice = files.slice(0, previewLimit);
			const previews = await Promise.allSettled(
				slice.map((f) => getNoteContent(f.relativePath || f.path.replace(dir + "/", ""))),
			);

			for (let i = 0; i < slice.length; i++) {
				const f = slice[i]!;
				const previewResult = previews[i]!;
				const preview =
					previewResult.status === "fulfilled"
						? extractPreview((previewResult as PromiseFulfilledResult<NoteContentResponse>).value.content)
						: "";
				items.push({
					path: f.path,
					name: f.name,
					relativePath: f.relativePath,
					modifiedAt: f.modifiedAt,
					extension: f.extension,
					preview,
				});
			}

			// Add remaining files without preview
			for (let i = previewLimit; i < files.length; i++) {
				const f = files[i]!;
				items.push({
					path: f.path,
					name: f.name,
					relativePath: f.relativePath,
					modifiedAt: f.modifiedAt,
					extension: f.extension,
					preview: "",
				});
			}

			inboxFiles.value = items;
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
			inboxFiles.value = [];
		} finally {
			isLoading.value = false;
		}
	};

	// Filtered & sorted list
	const filteredFiles = computed(() => {
		let list = inboxFiles.value;

		// Search filter
		const q = searchQuery.value.trim().toLowerCase();
		if (q) {
			list = list.filter(
				(f) =>
					f.name.toLowerCase().includes(q) ||
					f.preview.toLowerCase().includes(q),
			);
		}

		// Sort
		const sorted = [...list];
		switch (sortKey.value) {
			case "modified":
				sorted.sort((a, b) => b.modifiedAt - a.modifiedAt);
				break;
			case "created":
				// Fallback: filename contains timestamp for inbox notes
				sorted.sort((a, b) => b.name.localeCompare(a.name));
				break;
			case "name":
				sorted.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
				break;
		}

		return sorted;
	});

	const count = computed(() => inboxFiles.value.length);

	// Capture a new fleeting note
	const captureNote = async (text: string) => {
		const dir = workspaceDir();
		if (!text.trim() || !dir) return;

		const now = new Date();
		const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
		const relPath = `${INBOX_DIR}/闪念_${timestamp}`;

		const response = await createNote({ path: relPath, content: text });
		toast.success("已捕捉到收件箱");
		await load();
		return response;
	};

	// Delete a note
	const deleteItem = async (relativePath: string) => {
		const prev = [...inboxFiles.value];
		inboxFiles.value = inboxFiles.value.filter((f) => f.relativePath !== relativePath);

		try {
			await deleteNote(relativePath);
			toast.success("笔记已删除");
		} catch (err) {
			inboxFiles.value = prev;
			toast.error("删除失败", {
				description: err instanceof Error ? err.message : String(err),
			});
			throw err;
		}
	};

	// Rename a note
	const renameItem = async (relativePath: string, newName: string) => {
		try {
			await renameNote(relativePath, newName);
			toast.success("已重命名");
			await load();
		} catch (err) {
			toast.error("重命名失败", {
				description: err instanceof Error ? err.message : String(err),
			});
			throw err;
		}
	};

	// Archive (move) a note to a target directory
	const archiveItem = async (relativePath: string, targetDir: string) => {
		const dir = workspaceDir();
		if (!dir) return;

		try {
			await moveFileEntry({
				root: dir,
				path: `${dir}/${relativePath}`,
				targetDirectory: `${dir}/${targetDir}`,
			});
			toast.success(`已归档到 ${targetDir}`);
			await load();
		} catch (err) {
			toast.error("归档失败", {
				description: err instanceof Error ? err.message : String(err),
			});
			throw err;
		}
	};

	// Format relative time for display
	const formatTime = (ts: number) => formatRelativeTime(ts);

	watch(
		() => workspaceDir(),
		(dir) => {
			if (dir) load();
		},
		{ immediate: true },
	);

	return {
		inboxFiles,
		filteredFiles,
		isLoading,
		error,
		searchQuery,
		sortKey,
		count,
		load,
		captureNote,
		deleteItem,
		renameItem,
		archiveItem,
		formatTime,
	};
}
