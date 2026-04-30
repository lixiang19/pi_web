import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFileTreeData } from "@/composables/useFileTreeData";

vi.mock("@/lib/api", () => ({
	getFileTree: vi.fn(),
}));

import { getFileTree } from "@/lib/api";

const mockGetFileTree = vi.mocked(getFileTree);

const makeEntry = (
	name: string,
	kind: "file" | "directory",
	path?: string,
) => ({
	name,
	path: path ?? `/root/${name}`,
	kind,
	relativePath: name,
	size: kind === "file" ? 100 : null,
	modifiedAt: Date.now(),
	extension: kind === "file" ? ".md" : "",
});

describe("useFileTreeData", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("loads root directory on watch", async () => {
		mockGetFileTree.mockResolvedValue({
			root: "/root",
			directory: "/root",
			entries: [makeEntry("file.md", "file"), makeEntry("subdir", "directory")],
		});

		const { visibleNodes } = useFileTreeData(() => "/root");

		await vi.waitFor(() => {
			expect(mockGetFileTree).toHaveBeenCalledWith("/root", "/root");
		});

		expect(visibleNodes.value.length).toBeGreaterThan(0);
	});

	it("toggles directory expansion", async () => {
		const dirEntry = makeEntry("subdir", "directory");
		mockGetFileTree.mockResolvedValue({
			root: "/root",
			directory: "/root",
			entries: [dirEntry],
		});

		const { isDirectoryExpanded, toggleDirectory } = useFileTreeData(
			() => "/root",
		);

		await vi.waitFor(() => {
			expect(mockGetFileTree).toHaveBeenCalled();
		});

		expect(isDirectoryExpanded(dirEntry.path)).toBe(false);

		// Mock subdirectory loading
		mockGetFileTree.mockResolvedValue({
			root: "/root",
			directory: dirEntry.path,
			entries: [makeEntry("child.md", "file")],
		});

		await toggleDirectory(dirEntry);
		expect(isDirectoryExpanded(dirEntry.path)).toBe(true);
	});

	it("refreshes tree", async () => {
		mockGetFileTree.mockResolvedValue({
			root: "/root",
			directory: "/root",
			entries: [],
		});

		const { refreshTree } = useFileTreeData(() => "/root");

		await vi.waitFor(() => {
			expect(mockGetFileTree).toHaveBeenCalled();
		});

		const callCount = mockGetFileTree.mock.calls.length;
		await refreshTree();
		expect(mockGetFileTree.mock.calls.length).toBeGreaterThan(callCount);
	});

	it("handles API error", async () => {
		mockGetFileTree.mockRejectedValue(new Error("network error"));

		const { fileTreeError } = useFileTreeData(() => "/root");

		await vi.waitFor(() => {
			expect(fileTreeError.value).toBe("network error");
		});
	});

	it("skips loading when rootPath is empty", () => {
		mockGetFileTree.mockResolvedValue({ root: "", directory: "", entries: [] });

		const { visibleNodes } = useFileTreeData(() => "");
		expect(visibleNodes.value).toEqual([]);
		expect(mockGetFileTree).not.toHaveBeenCalled();
	});

	it("expandToPath opens intermediate directories", async () => {
		const subDir = makeEntry("subdir", "directory");
		const deepFile = makeEntry("deep.md", "file");
		mockGetFileTree
			.mockResolvedValueOnce({
				root: "/root",
				directory: "/root",
				entries: [subDir],
			})
			.mockResolvedValueOnce({
				root: "/root",
				directory: "/root/subdir",
				entries: [deepFile],
			});

		const { expandToPath, isDirectoryExpanded } = useFileTreeData(
			() => "/root",
		);

		await vi.waitFor(() => {
			expect(mockGetFileTree).toHaveBeenCalled();
		});

		await expandToPath("/root/subdir/deep.md");
		expect(isDirectoryExpanded("/root/subdir")).toBe(true);
	});

	it("does not re-load cached directory", async () => {
		mockGetFileTree.mockResolvedValue({
			root: "/root",
			directory: "/root",
			entries: [makeEntry("file.md", "file")],
		});

		const { loadDirectory } = useFileTreeData(() => "/root");

		await vi.waitFor(() => {
			expect(mockGetFileTree).toHaveBeenCalled();
		});

		const callCount = mockGetFileTree.mock.calls.length;
		await loadDirectory("/root"); // 第二次调用，有缓存，不应再请求
		expect(mockGetFileTree.mock.calls.length).toBe(callCount);
	});

	it("force option bypasses cache", async () => {
		mockGetFileTree.mockResolvedValue({
			root: "/root",
			directory: "/root",
			entries: [makeEntry("file.md", "file")],
		});

		const { loadDirectory } = useFileTreeData(() => "/root");

		await vi.waitFor(() => {
			expect(mockGetFileTree).toHaveBeenCalled();
		});

		const callCount = mockGetFileTree.mock.calls.length;
		await loadDirectory("/root", { force: true });
		expect(mockGetFileTree.mock.calls.length).toBeGreaterThan(callCount);
	});
});
