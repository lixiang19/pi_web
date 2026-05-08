import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Pure function tests (no Vue, no API mocks needed) ──────────
import {
	groupItems,
	type InboxMomentItem,
	isEnoentError,
	parseInboxFile,
} from "@/composables/useInbox";

// ── Composable tests (API mocks) ───────────────────────────────

vi.mock("@/lib/api", () => ({
	getFileTree: vi.fn(),
	getNoteContent: vi.fn(),
	saveNoteContent: vi.fn(),
	createNote: vi.fn(),
}));

vi.mock("vue-sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

import { useInboxInner } from "@/composables/useInbox";
import {
	createNote,
	getFileTree,
	getNoteContent,
	saveNoteContent,
} from "@/lib/api";
import type {
	FileTreeResponse,
	NoteContentResponse,
	NoteCreateResponse,
	NoteSaveResponse,
} from "@/lib/types";

const mockGetFileTree = vi.mocked(getFileTree);
const mockGetNoteContent = vi.mocked(getNoteContent);
const mockSaveNoteContent = vi.mocked(saveNoteContent);
const mockCreateNote = vi.mocked(createNote);

function makeFileTreeRes(
	entries: FileTreeResponse["entries"],
): FileTreeResponse {
	return { root: "/ws", directory: "/ws/收件箱", entries };
}

function makeNoteContentRes(
	overrides: Partial<NoteContentResponse> & { content: string },
): NoteContentResponse {
	return {
		path: "",
		relativePath: "",
		updatedAt: Date.now(),
		size: 0,
		...overrides,
	};
}

function makeNoteCreateRes(
	overrides: Partial<NoteCreateResponse> = {},
): NoteCreateResponse {
	return {
		name: "",
		path: "",
		relativePath: "",
		size: 0,
		updatedAt: Date.now(),
		...overrides,
	};
}

function makeNoteSaveRes(
	overrides: Partial<NoteSaveResponse> = {},
): NoteSaveResponse {
	return {
		path: "",
		relativePath: "",
		size: 0,
		updatedAt: Date.now(),
		...overrides,
	};
}

// ── Helper: today/yesterday dates ──────────────────────────────

function todayStr(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yesterdayStr(): string {
	const d = new Date(Date.now() - 86_400_000);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Pure function: parseInboxFile ──────────────────────────────

describe("parseInboxFile", () => {
	it("解析单条闪念", () => {
		const content = `# 2026-04-30 闪念\n\n## 10:21\n\n想给收件箱加一个快速捕捉入口`;
		const items = parseInboxFile(
			content,
			"2026-04-30",
			"收件箱/2026-04-30.md",
			"/ws/收件箱/2026-04-30.md",
		);
		expect(items).toHaveLength(1);
		expect(items[0]!.time).toBe("10:21");
		expect(items[0]!.content).toBe("想给收件箱加一个快速捕捉入口");
		expect(items[0]!.date).toBe("2026-04-30");
	});

	it("解析条目的 path 为绝对路径", () => {
		const content = `# 2026-04-30 闪念\n\n## 10:21\n\n想法`;
		const items = parseInboxFile(
			content,
			"2026-04-30",
			"收件箱/2026-04-30.md",
			"/ws/收件箱/2026-04-30.md",
		);
		expect(items).toHaveLength(1);
		expect(items[0]!.relativePath).toBe("收件箱/2026-04-30.md");
		expect(items[0]!.path).toBe("/ws/收件箱/2026-04-30.md");
	});

	it("解析多条闪念", () => {
		const content = `# 2026-04-30 闪念\n\n## 10:21\n\n想法 A\n\n## 10:35\n\n想法 B`;
		const items = parseInboxFile(
			content,
			"2026-04-30",
			"收件箱/2026-04-30.md",
			"/ws/收件箱/2026-04-30.md",
		);
		expect(items).toHaveLength(2);
		expect(items[0]!.time).toBe("10:21");
		expect(items[0]!.content).toBe("想法 A");
		expect(items[1]!.time).toBe("10:35");
		expect(items[1]!.content).toBe("想法 B");
	});

	it("保留正文换行", () => {
		const content = `# 2026-04-30 闪念\n\n## 10:21\n\n第一行\n第二行`;
		const items = parseInboxFile(
			content,
			"2026-04-30",
			"收件箱/2026-04-30.md",
			"/ws/收件箱/2026-04-30.md",
		);
		expect(items).toHaveLength(1);
		expect(items[0]!.content).toBe("第一行\n第二行");
	});

	it("空文件返回空数组", () => {
		const content = `# 2026-04-30 闪念\n`;
		const items = parseInboxFile(
			content,
			"2026-04-30",
			"收件箱/2026-04-30.md",
			"/ws/收件箱/2026-04-30.md",
		);
		expect(items).toHaveLength(0);
	});

	it("无标题内容也解析", () => {
		const content = `# 2026-04-30 闪念\n\n## 09:00\n\nsome text\n\n## 09:05\n\nmore text`;
		const items = parseInboxFile(
			content,
			"2026-04-30",
			"收件箱/2026-04-30.md",
			"/ws/收件箱/2026-04-30.md",
		);
		expect(items).toHaveLength(2);
	});

	it("preview 截断长内容", () => {
		const longText = "A".repeat(200);
		const content = `# 2026-04-30 闪念\n\n## 10:21\n\n${longText}`;
		const items = parseInboxFile(
			content,
			"2026-04-30",
			"收件箱/2026-04-30.md",
			"/ws/收件箱/2026-04-30.md",
		);
		expect(items[0]!.preview.length).toBeLessThan(200);
	});
});

// ── Pure function: isEnoentError ──────────────────────────────

describe("isEnoentError", () => {
	it("识别 ENOENT 错误", () => {
		expect(
			isEnoentError("ENOENT: no such file or directory, stat '/ws/收件箱'"),
		).toBe(true);
	});

	it("识别 no such file 错误", () => {
		expect(isEnoentError("Error: no such file or directory")).toBe(true);
	});

	it("识别 not found 错误", () => {
		expect(isEnoentError("ENOENT not found")).toBe(true);
	});

	it("不误判普通错误", () => {
		expect(isEnoentError("network error")).toBe(false);
		expect(isEnoentError("permission denied")).toBe(false);
		expect(isEnoentError("")).toBe(false);
	});
});

// ── Pure function: groupItems ──────────────────────────────────

describe("groupItems", () => {
	it("分组为今天 / 昨天 / 更早", () => {
		const today = todayStr();
		const yesterday = yesterdayStr();
		const older = "2026-01-01";

		const items: InboxMomentItem[] = [
			{
				id: `${today}-10:00-0`,
				date: today,
				time: "10:00",
				content: "today item",
				preview: "today item",
				relativePath: `收件箱/${today}.md`,
				path: `/ws/收件箱/${today}.md`,
				timestamp: new Date(`${today}T10:00`).getTime(),
			},
			{
				id: `${yesterday}-18:00-0`,
				date: yesterday,
				time: "18:00",
				content: "yesterday item",
				preview: "yesterday item",
				relativePath: `收件箱/${yesterday}.md`,
				path: `/ws/收件箱/${yesterday}.md`,
				timestamp: new Date(`${yesterday}T18:00`).getTime(),
			},
			{
				id: `${older}-09:00-0`,
				date: older,
				time: "09:00",
				content: "older item",
				preview: "older item",
				relativePath: `收件箱/${older}.md`,
				path: `/ws/收件箱/${older}.md`,
				timestamp: new Date(`${older}T09:00`).getTime(),
			},
		];

		const groups = groupItems(items);
		expect(groups).toHaveLength(3);

		expect(groups[0]!.label).toBe("今天");
		expect(groups[0]!.items).toHaveLength(1);

		expect(groups[1]!.label).toBe("昨天");
		expect(groups[1]!.items).toHaveLength(1);

		expect(groups[2]!.label).toBe("更早");
		expect(groups[2]!.items).toHaveLength(1);
	});

	it("空列表返回空分组", () => {
		const groups = groupItems([]);
		expect(groups).toHaveLength(0);
	});

	it("只有今天条目时不出现昨天和更早分组", () => {
		const today = todayStr();
		const items: InboxMomentItem[] = [
			{
				id: `${today}-10:00-0`,
				date: today,
				time: "10:00",
				content: "today",
				preview: "today",
				relativePath: `收件箱/${today}.md`,
				path: `/ws/收件箱/${today}.md`,
				timestamp: new Date(`${today}T10:00`).getTime(),
			},
		];
		const groups = groupItems(items);
		expect(groups).toHaveLength(1);
		expect(groups[0]!.label).toBe("今天");
	});
});

// ── Composable: useInboxInner ──────────────────────────────────

describe("useInboxInner", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("load() → 解析日期文件为多条闪念", async () => {
		const today = todayStr();
		mockGetFileTree.mockResolvedValue(
			makeFileTreeRes([
				{
					kind: "file",
					name: `${today}.md`,
					path: `/ws/收件箱/${today}.md`,
					relativePath: `收件箱/${today}.md`,
					extension: ".md",
					modifiedAt: Date.now(),
					size: 100,
				},
			]),
		);
		mockGetNoteContent.mockResolvedValue(
			makeNoteContentRes({
				path: `收件箱/${today}.md`,
				relativePath: `收件箱/${today}.md`,
				content: `# ${today} 闪念\n\n## 10:21\n\n想法 A\n\n## 10:35\n\n想法 B`,
			}),
		);

		const store = useInboxInner(() => "/ws");
		await vi.waitFor(() => {
			expect(mockGetFileTree).toHaveBeenCalled();
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		expect(store.inboxItems.value).toHaveLength(2);
		expect(store.count.value).toBe(2);
		// Verify parsed items have absolute paths
		expect(store.inboxItems.value[0]!.path).toBe(`/ws/收件箱/${today}.md`);
		expect(store.inboxItems.value[0]!.relativePath).toBe(`收件箱/${today}.md`);
	});

	it("load() → 收件箱目录不存在时为空列表且无错误", async () => {
		mockGetFileTree.mockRejectedValue(
			new Error("ENOENT: no such file or directory, stat '/ws/收件箱'"),
		);

		const store = useInboxInner(() => "/ws");
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		expect(store.inboxItems.value).toEqual([]);
		expect(store.error.value).toBe("");
	});

	it("captureNote() → 创建当天日期文件", async () => {
		const today = todayStr();
		// Initial load: empty inbox
		mockGetFileTree.mockResolvedValueOnce(makeFileTreeRes([]));
		mockCreateNote.mockResolvedValue(
			makeNoteCreateRes({
				name: `${today}.md`,
				path: `收件箱/${today}.md`,
				relativePath: `收件箱/${today}.md`,
			}),
		);
		// After capture, load() will be called again
		mockGetFileTree.mockResolvedValueOnce(
			makeFileTreeRes([
				{
					kind: "file",
					name: `${today}.md`,
					path: `/ws/收件箱/${today}.md`,
					relativePath: `收件箱/${today}.md`,
					extension: ".md",
					modifiedAt: Date.now(),
					size: 50,
				},
			]),
		);
		mockGetNoteContent.mockResolvedValue(
			makeNoteContentRes({
				path: `收件箱/${today}.md`,
				relativePath: `收件箱/${today}.md`,
				content: `# ${today} 闪念\n\n## 10:30\n\nNew idea`,
			}),
		);

		const store = useInboxInner(() => "/ws");

		// Wait for initial load
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		await store.captureNote("New idea");
		expect(mockCreateNote).toHaveBeenCalledWith(
			expect.objectContaining({
				path: `收件箱/${today}.md`,
			}),
		);
	});

	it("captureNote() → 追加到已存在的当天文件", async () => {
		const today = todayStr();
		const existingContent = `# ${today} 闪念\n\n## 10:21\n\nFirst idea`;

		mockGetFileTree.mockResolvedValue(
			makeFileTreeRes([
				{
					kind: "file",
					name: `${today}.md`,
					path: `/ws/收件箱/${today}.md`,
					relativePath: `收件箱/${today}.md`,
					extension: ".md",
					modifiedAt: Date.now(),
					size: 100,
				},
			]),
		);
		mockGetNoteContent.mockResolvedValue(
			makeNoteContentRes({
				path: `收件箱/${today}.md`,
				relativePath: `收件箱/${today}.md`,
				content: existingContent,
			}),
		);
		mockSaveNoteContent.mockResolvedValue(
			makeNoteSaveRes({
				path: `收件箱/${today}.md`,
				relativePath: `收件箱/${today}.md`,
			}),
		);

		const store = useInboxInner(() => "/ws");
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		await store.captureNote("Second idea");
		expect(mockSaveNoteContent).toHaveBeenCalledWith(
			`收件箱/${today}.md`,
			expect.stringContaining("Second idea"),
		);
		expect(mockSaveNoteContent).toHaveBeenCalledWith(
			`收件箱/${today}.md`,
			expect.stringContaining("First idea"),
		);
	});

	it("搜索按正文匹配所有条目", async () => {
		const today = todayStr();
		mockGetFileTree.mockResolvedValue(
			makeFileTreeRes([
				{
					kind: "file",
					name: `${today}.md`,
					path: `/ws/收件箱/${today}.md`,
					relativePath: `收件箱/${today}.md`,
					extension: ".md",
					modifiedAt: Date.now(),
					size: 100,
				},
			]),
		);
		mockGetNoteContent.mockResolvedValue(
			makeNoteContentRes({
				path: `收件箱/${today}.md`,
				relativePath: `收件箱/${today}.md`,
				content: `# ${today} 闪念\n\n## 10:21\n\n想法 Alpha\n\n## 10:35\n\n想法 Beta`,
			}),
		);

		const store = useInboxInner(() => "/ws");
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		expect(store.filteredItems.value).toHaveLength(2);

		store.searchQuery.value = "Alpha";
		expect(store.filteredItems.value).toHaveLength(1);

		store.searchQuery.value = "Beta";
		expect(store.filteredItems.value).toHaveLength(1);

		store.searchQuery.value = "不存在";
		expect(store.filteredItems.value).toHaveLength(0);
	});

	it("recentItems 不受搜索影响", async () => {
		const today = todayStr();
		mockGetFileTree.mockResolvedValue(
			makeFileTreeRes([
				{
					kind: "file",
					name: `${today}.md`,
					path: `/ws/收件箱/${today}.md`,
					relativePath: `收件箱/${today}.md`,
					extension: ".md",
					modifiedAt: Date.now(),
					size: 100,
				},
			]),
		);
		mockGetNoteContent.mockResolvedValue(
			makeNoteContentRes({
				path: `收件箱/${today}.md`,
				relativePath: `收件箱/${today}.md`,
				content: `# ${today} 闪念\n\n## 10:21\n\n想法 A\n\n## 10:35\n\n想法 B\n\n## 10:40\n\n想法 C`,
			}),
		);

		const store = useInboxInner(() => "/ws");
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		store.searchQuery.value = "A";
		// recentItems should return latest 3 regardless of search
		expect(store.recentItems.value).toHaveLength(3);
		// filteredItems is filtered
		expect(store.filteredItems.value).toHaveLength(1);
	});

	it("加载失败设置 error", async () => {
		mockGetFileTree.mockRejectedValue(new Error("network error"));

		const store = useInboxInner(() => "/ws");
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		expect(store.error.value).toBe("network error");
		expect(store.inboxItems.value).toHaveLength(0);
	});

	it("收件箱目录不存在时 inboxItems 为空且 error 为空", async () => {
		mockGetFileTree.mockRejectedValue(
			new Error("ENOENT: no such file or directory, stat '/ws/收件箱'"),
		);

		const store = useInboxInner(() => "/ws");
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		expect(store.inboxItems.value).toEqual([]);
		expect(store.error.value).toBe("");
	});

	// --- 边界测试：captureNote 不包含 checklist ---

	it("captureNote 创建新日期文件的 content 不包含 checklist", async () => {
		const today = todayStr();
		mockGetFileTree.mockResolvedValueOnce(makeFileTreeRes([]));
		mockCreateNote.mockResolvedValue(
			makeNoteCreateRes({
				name: `${today}.md`,
				path: `收件箱/${today}.md`,
				relativePath: `收件箱/${today}.md`,
			}),
		);
		// After capture, load() will be called again
		mockGetFileTree.mockResolvedValueOnce(makeFileTreeRes([]));

		const store = useInboxInner(() => "/ws");
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		await store.captureNote("闪念内容");
		const createCall = mockCreateNote.mock.calls[0];
		expect(createCall).toBeTruthy();
		const createdContent = createCall![0]!.content as string;
		expect(createdContent).not.toContain("- [ ]");
		expect(createdContent).not.toContain("- [x]");
	});

	it("captureNote 追加已有日期文件的 content 不包含 checklist", async () => {
		const today = todayStr();
		const existingContent = `# ${today} 闪念\n\n## 10:21\n\nFirst idea`;

		mockGetFileTree.mockResolvedValue(
			makeFileTreeRes([
				{
					kind: "file",
					name: `${today}.md`,
					path: `/ws/收件箱/${today}.md`,
					relativePath: `收件箱/${today}.md`,
					extension: ".md",
					modifiedAt: Date.now(),
					size: 100,
				},
			]),
		);
		mockGetNoteContent.mockResolvedValue(
			makeNoteContentRes({
				path: `收件箱/${today}.md`,
				relativePath: `收件箱/${today}.md`,
				content: existingContent,
			}),
		);
		mockSaveNoteContent.mockResolvedValue(
			makeNoteSaveRes({
				path: `收件箱/${today}.md`,
				relativePath: `收件箱/${today}.md`,
			}),
		);

		const store = useInboxInner(() => "/ws");
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		await store.captureNote("Second idea");
		const saveCall = mockSaveNoteContent.mock.calls[0];
		expect(saveCall).toBeTruthy();
		const savedContent = saveCall![1] as string;
		expect(savedContent).not.toContain("- [ ]");
		expect(savedContent).not.toContain("- [x]");
	});

	// --- 边界测试：只解析 YYYY-MM-DD.md 格式文件 ---

	it("load() 忽略非日期格式的 md 文件（如未命名.md）", async () => {
		const today = todayStr();
		mockGetFileTree.mockResolvedValue(
			makeFileTreeRes([
				{
					kind: "file",
					name: `${today}.md`,
					path: `/ws/收件箱/${today}.md`,
					relativePath: `收件箱/${today}.md`,
					extension: ".md",
					modifiedAt: Date.now(),
					size: 100,
				},
				{
					kind: "file",
					name: "未命名.md",
					path: "/ws/收件箱/未命名.md",
					relativePath: "收件箱/未命名.md",
					extension: ".md",
					modifiedAt: Date.now(),
					size: 50,
				},
				{
					kind: "file",
					name: "notes.md",
					path: "/ws/收件箱/notes.md",
					relativePath: "收件箱/notes.md",
					extension: ".md",
					modifiedAt: Date.now(),
					size: 50,
				},
			]),
		);
		mockGetNoteContent.mockImplementation((relPath: string) => {
			if (relPath === `收件箱/${today}.md`) {
				return Promise.resolve(
					makeNoteContentRes({
						path: `收件箱/${today}.md`,
						relativePath: `收件箱/${today}.md`,
						content: `# ${today} 闪念\n\n## 10:21\n\n想法 A`,
					}),
				);
			}
			return Promise.resolve(
				makeNoteContentRes({
					path: relPath,
					relativePath: relPath,
					content: "# Notes\n\nSome content",
				}),
			);
		});

		const store = useInboxInner(() => "/ws");
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		// Only the date file should be parsed into items
		expect(store.inboxItems.value).toHaveLength(1);
		expect(store.inboxItems.value[0]!.content).toBe("想法 A");
	});

	// --- 边界测试：单个日期文件读取失败 ---

	it("load() 单个日期文件读取失败时静默跳过，不影响其他文件", async () => {
		const today = todayStr();
		mockGetFileTree.mockResolvedValue(
			makeFileTreeRes([
				{
					kind: "file",
					name: `${today}.md`,
					path: `/ws/收件箱/${today}.md`,
					relativePath: `收件箱/${today}.md`,
					extension: ".md",
					modifiedAt: Date.now(),
					size: 100,
				},
				{
					kind: "file",
					name: "2026-04-28.md",
					path: "/ws/收件箱/2026-04-28.md",
					relativePath: "收件箱/2026-04-28.md",
					extension: ".md",
					modifiedAt: Date.now(),
					size: 100,
				},
			]),
		);
		mockGetNoteContent.mockImplementation((relPath: string) => {
			if (relPath === `收件箱/${today}.md`) {
				return Promise.resolve(
					makeNoteContentRes({
						path: `收件箱/${today}.md`,
						relativePath: `收件箱/${today}.md`,
						content: `# ${today} 闪念\n\n## 10:21\n\n想法 A`,
					}),
				);
			}
			// Simulate read failure for the other file
			return Promise.reject(new Error("Failed to read file"));
		});

		const store = useInboxInner(() => "/ws");
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		// Only the successfully-read file produces items
		expect(store.inboxItems.value).toHaveLength(1);
		expect(store.inboxItems.value[0]!.content).toBe("想法 A");
		// No error set because overall load succeeded
		expect(store.error.value).toBe("");
	});

	// --- 边界测试：同一分钟多条闪念 id 不重复 ---

	it("parseInboxFile 同一分钟多条闪念的 id 不重复", () => {
		// Simulate two moments with the same time in one file
		const content = `# 2026-04-30 闪念\n\n## 10:21\n\n第一条\n\n## 10:21\n\n第二条`;
		const items = parseInboxFile(
			content,
			"2026-04-30",
			"收件箱/2026-04-30.md",
			"/ws/收件箱/2026-04-30.md",
		);
		expect(items).toHaveLength(2);
		// IDs follow pattern: date-time-index
		expect(items[0]!.id).toBe("2026-04-30-10:21-0");
		expect(items[1]!.id).toBe("2026-04-30-10:21-1");
		expect(items[0]!.id).not.toBe(items[1]!.id);
	});
});
