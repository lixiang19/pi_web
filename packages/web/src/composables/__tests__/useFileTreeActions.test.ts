import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useFileTreeActions } from "@/composables/useFileTreeActions";

vi.mock("@/lib/api", () => ({
	trashFileEntry: vi.fn(),
	moveFileEntry: vi.fn(),
	createFileEntry: vi.fn(),
}));

vi.mock("vue-sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

import type { FileTreeEntry } from "@/lib/types";
import { toast } from "vue-sonner";
import { createFileEntry, moveFileEntry, trashFileEntry } from "@/lib/api";

const mockTrashFileEntry = vi.mocked(trashFileEntry);
const mockMoveFileEntry = vi.mocked(moveFileEntry);
const mockCreateFileEntry = vi.mocked(createFileEntry);
const mockToastSuccess = vi.mocked(toast.success);
const mockToastError = vi.mocked(toast.error);

function makeEntry(
	name: string,
	kind: "file" | "directory" = "file",
	path?: string,
): FileTreeEntry {
	return {
		name,
		path: path ?? `/workspace/${name}`,
		kind,
		relativePath: name,
		size: kind === "file" ? 100 : null,
		modifiedAt: Date.now(),
		extension: kind === "file" ? ".ts" : "",
	};
}

describe("useFileTreeActions", () => {
	const workspaceDir = ref("/workspace");
	const refreshTree = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	const { handleDelete, handleRename, handleCreateFolderInTree } =
		useFileTreeActions(workspaceDir, refreshTree);

	// ── handleDelete ────────────────────────────────────────────

	it("handleDelete 成功时：调用 trashFileEntry + refreshTree + toast.success", async () => {
		mockTrashFileEntry.mockResolvedValue({
			root: "/workspace",
			path: "/workspace/foo.ts",
			trashedAt: Date.now(),
		});

		await handleDelete(makeEntry("foo.ts"));

		expect(mockTrashFileEntry).toHaveBeenCalledWith(
			"/workspace",
			"/workspace/foo.ts",
		);
		expect(refreshTree).toHaveBeenCalled();
		expect(mockToastSuccess).toHaveBeenCalledWith("已删除 foo.ts");
	});

	it("handleDelete 失败时：调用 toast.error，不调 refreshTree", async () => {
		mockTrashFileEntry.mockRejectedValue(new Error("disk error"));

		await handleDelete(makeEntry("bar.ts"));

		expect(mockToastError).toHaveBeenCalledWith("删除失败: disk error");
		expect(refreshTree).not.toHaveBeenCalled();
	});

	// ── handleRename ────────────────────────────────────────────

	it("handleRename 成功时：调用 moveFileEntry + refreshTree + toast.success", async () => {
		mockMoveFileEntry.mockResolvedValue({ entry: makeEntry("new.ts") });

		await handleRename({ oldPath: "/workspace/old.ts", newName: "new.ts" });

		expect(mockMoveFileEntry).toHaveBeenCalledWith({
			root: "/workspace",
			path: "/workspace/old.ts",
			name: "new.ts",
		});
		expect(refreshTree).toHaveBeenCalled();
		expect(mockToastSuccess).toHaveBeenCalledWith("已重命名为 new.ts");
	});

	it("handleRename 失败时：调用 toast.error", async () => {
		mockMoveFileEntry.mockRejectedValue(new Error("name conflict"));

		await handleRename({ oldPath: "/workspace/a.ts", newName: "b.ts" });

		expect(mockToastError).toHaveBeenCalledWith("重命名失败: name conflict");
		expect(refreshTree).not.toHaveBeenCalled();
	});

	// ── handleCreateFolderInTree ────────────────────────────────

	it("handleCreateFolderInTree 成功时：调用 createFileEntry + refreshTree + toast.success", async () => {
		mockCreateFileEntry.mockResolvedValue({
			entry: makeEntry("utils", "directory", "/workspace/src/utils"),
		});

		await handleCreateFolderInTree({
			parentPath: "/workspace/src",
			name: "utils",
		});

		expect(mockCreateFileEntry).toHaveBeenCalledWith({
			root: "/workspace",
			directory: "/workspace/src",
			name: "utils",
			kind: "directory",
		});
		expect(refreshTree).toHaveBeenCalled();
		expect(mockToastSuccess).toHaveBeenCalledWith("已创建文件夹 utils");
	});

	it("handleCreateFolderInTree 失败时：调用 toast.error", async () => {
		mockCreateFileEntry.mockRejectedValue(new Error("exists"));

		await handleCreateFolderInTree({ parentPath: "/workspace", name: "dup" });

		expect(mockToastError).toHaveBeenCalledWith("创建文件夹失败: exists");
		expect(refreshTree).not.toHaveBeenCalled();
	});
});
