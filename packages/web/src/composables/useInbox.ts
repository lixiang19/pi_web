import { computed, type InjectionKey, inject, provide, ref, watch } from "vue";
import { toast } from "vue-sonner";

import {
	createNote,
	getFileTree,
	getNoteContent,
	saveNoteContent,
} from "@/lib/api";
import type { NoteContentResponse } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────

export type InboxMomentItem = {
	id: string; // `${date}-${time}-${index}`
	date: string; // YYYY-MM-DD
	time: string; // HH:mm
	content: string; // full text content of the moment
	preview: string; // truncated first line for display
	relativePath: string; // 收件箱/YYYY-MM-DD.md
	path: string; // full path for opening
	timestamp: number; // Date.parse(`${date}T${time}`)
};

export type InboxGroup = {
	label: "今天" | "昨天" | "更早";
	items: InboxMomentItem[];
};

// Provide/Inject key for shared inbox store
export const WORKSPACE_INBOX_KEY: InjectionKey<
	ReturnType<typeof useInboxInner>
> = Symbol("workspace-inbox");

// ── Pure functions (exported for testing) ───────────────────────

/** Parse a date file's content into moment items */
export function parseInboxFile(
	content: string,
	date: string,
	relativePath: string,
	absolutePath: string,
): InboxMomentItem[] {
	const items: InboxMomentItem[] = [];
	// Match all ## HH:mm headings and their content until next ## or end
	const regex = /^## (\d{2}:\d{2})\s*$/gm;
	const matches: { time: string; index: number }[] = [];
	let match: RegExpExecArray | null;

	while ((match = regex.exec(content)) !== null) {
		const time = match[1];
		if (time === undefined) continue;
		matches.push({ time, index: match.index });
	}

	for (let i = 0; i < matches.length; i++) {
		const m = matches[i]!;
		const startIdx = m.index + `## ${m.time}`.length;
		const endIdx =
			i + 1 < matches.length ? matches[i + 1]!.index : content.length;
		const body = content.slice(startIdx, endIdx).trim();

		const content_text = body;
		const preview = makePreview(body);
		const timestamp = Date.parse(`${date}T${m.time}`);

		items.push({
			id: `${date}-${m.time}-${i}`,
			date,
			time: m.time,
			content: content_text,
			preview,
			relativePath,
			path: absolutePath,
			timestamp: Number.isNaN(timestamp) ? 0 : timestamp,
		});
	}

	return items;
}

/** Truncate to first line, max 80 chars */
function makePreview(body: string): string {
	const firstLine = body.split("\n")[0]?.trim() ?? "";
	if (!firstLine) return "";
	return firstLine.length > 80 ? firstLine.slice(0, 80) + "…" : firstLine;
}

/** Check if error message indicates a missing file/directory (ENOENT / not found) */
export function isEnoentError(message: string): boolean {
	const lower = message.toLowerCase();
	return (
		lower.includes("enoent") ||
		lower.includes("no such file") ||
		lower.includes("not found")
	);
}

/** Group items into 今天 / 昨天 / 更早, sorted newest-first within each group */
export function groupItems(items: InboxMomentItem[]): InboxGroup[] {
	const now = new Date();
	const todayStr = formatDateStr(now);
	const yesterdayDate = new Date(now);
	yesterdayDate.setDate(yesterdayDate.getDate() - 1);
	const yesterdayStr = formatDateStr(yesterdayDate);

	const today: InboxMomentItem[] = [];
	const yesterday: InboxMomentItem[] = [];
	const older: InboxMomentItem[] = [];

	for (const item of items) {
		if (item.date === todayStr) {
			today.push(item);
		} else if (item.date === yesterdayStr) {
			yesterday.push(item);
		} else {
			older.push(item);
		}
	}

	// Sort each group newest-first
	const sortNewestFirst = (a: InboxMomentItem, b: InboxMomentItem) =>
		b.timestamp - a.timestamp;
	today.sort(sortNewestFirst);
	yesterday.sort(sortNewestFirst);
	older.sort(sortNewestFirst);

	const groups: InboxGroup[] = [];
	if (today.length > 0) groups.push({ label: "今天", items: today });
	if (yesterday.length > 0) groups.push({ label: "昨天", items: yesterday });
	if (older.length > 0) groups.push({ label: "更早", items: older });

	return groups;
}

function formatDateStr(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayDateStr(): string {
	return formatDateStr(new Date());
}

function todayTimeStr(): string {
	const d = new Date();
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ── Provide / Inject ───────────────────────────────────────────

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

// ── Composable ─────────────────────────────────────────────────

export function useInboxInner(workspaceDir: () => string) {
	const inboxItems = ref<InboxMomentItem[]>([]);
	const isLoading = ref(false);
	const error = ref("");
	const searchQuery = ref("");

	const INBOX_DIR = "收件箱";

	// Cache of file contents to support append on capture
	const fileContentCache = ref<Map<string, string>>(new Map());

	const load = async () => {
		const dir = workspaceDir();
		if (!dir) return;

		isLoading.value = true;
		error.value = "";
		try {
			const res = await getFileTree(`${dir}/${INBOX_DIR}`, dir);
			const files = res.entries
				.filter((e) => e.kind === "file" && e.name.endsWith(".md"))
				.sort((a, b) => b.modifiedAt - a.modifiedAt);

			// Load content of all date files
			const allItems: InboxMomentItem[] = [];
			const cache = new Map<string, string>();

			const results = await Promise.allSettled(
				files.map((f) =>
					getNoteContent(f.relativePath || f.path.replace(dir + "/", "")),
				),
			);

			for (let i = 0; i < files.length; i++) {
				const f = files[i]!;
				const result = results[i]!;
				if (result.status === "fulfilled") {
					const content = (
						result as PromiseFulfilledResult<NoteContentResponse>
					).value.content;
					cache.set(f.relativePath, content);

					// Extract date from filename: YYYY-MM-DD.md
					const dateMatch = f.name.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
					if (!dateMatch) continue;

					const date = dateMatch[1]!;
					const relPath = f.relativePath;
					const absPath = f.path;
					const parsed = parseInboxFile(content, date, relPath, absPath);
					allItems.push(...parsed);
				}
			}

			fileContentCache.value = cache;
			inboxItems.value = allItems;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (isEnoentError(msg)) {
				// Inbox directory doesn't exist yet — treat as empty inbox
				inboxItems.value = [];
			} else {
				error.value = msg;
				inboxItems.value = [];
			}
		} finally {
			isLoading.value = false;
		}
	};

	// Filtered list (affected by searchQuery)
	const filteredItems = computed(() => {
		const q = searchQuery.value.trim().toLowerCase();
		if (!q) return inboxItems.value;

		return inboxItems.value.filter((item) =>
			item.content.toLowerCase().includes(q),
		);
	});

	// Grouped view (affected by searchQuery for InboxView)
	const groupedItems = computed(() => groupItems(filteredItems.value));

	// Unfiltered recent items (for Dashboard — NOT affected by searchQuery)
	const recentItems = computed(() => {
		const sorted = [...inboxItems.value].sort(
			(a, b) => b.timestamp - a.timestamp,
		);
		return sorted.slice(0, 3);
	});

	const count = computed(() => inboxItems.value.length);

	// Capture a new fleeting moment
	const captureNote = async (text: string) => {
		const dir = workspaceDir();
		if (!text.trim() || !dir) return;

		const today = todayDateStr();
		const time = todayTimeStr();
		const relPath = `${INBOX_DIR}/${today}.md`;

		const cached = fileContentCache.value.get(relPath);

		if (cached !== undefined) {
			// File exists: append
			const newContent = `${cached}\n\n## ${time}\n\n${text.trim()}`;
			await saveNoteContent(relPath, newContent);
		} else {
			// File doesn't exist: create
			const fileContent = `# ${today} 闪念\n\n## ${time}\n\n${text.trim()}`;
			await createNote({ path: relPath, content: fileContent });
		}

		toast.success("已捕捉到收件箱");
		await load();
		return { path: relPath };
	};

	// Format time for display
	const formatTime = (item: InboxMomentItem) => {
		return item.time;
	};

	watch(
		() => workspaceDir(),
		(dir) => {
			if (dir) load();
		},
		{ immediate: true },
	);

	return {
		inboxItems,
		filteredItems,
		groupedItems,
		recentItems,
		isLoading,
		error,
		searchQuery,
		count,
		load,
		captureNote,
		formatTime,
	};
}
