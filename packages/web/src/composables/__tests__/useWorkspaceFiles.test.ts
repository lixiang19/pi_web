import { describe, expect, it, vi } from "vitest";
import { useWorkspaceFiles, getParentPath } from "@/composables/useWorkspaceFiles";
import * as api from "@/lib/api";

describe("useWorkspaceFiles", () => {
	it("navigateBack guards against going above root", async () => {
		const instance = useWorkspaceFiles();

		const spy = vi.spyOn(api, "getWorkspaceFilesTree").mockResolvedValue({
			root: "/workspace",
			directory: "/workspace",
			entries: [],
		} as Awaited<ReturnType<typeof api.getWorkspaceFilesTree>>);

		await instance.load("/workspace");

		spy.mockClear();
		await instance.navigateBack();
		expect(spy).not.toHaveBeenCalled();
		expect(instance.currentPath.value).toBe("/workspace");
	});

	it("navigateBack does nothing when currentPath equals workspaceRoot", async () => {
		const spy = vi.spyOn(api, "getWorkspaceFilesTree").mockResolvedValue({
			root: "/Users/me/ridge-workspace",
			directory: "/Users/me/ridge-workspace",
			entries: [],
		} as Awaited<ReturnType<typeof api.getWorkspaceFilesTree>>);

		const instance = useWorkspaceFiles();
		await instance.load("/Users/me/ridge-workspace");

		spy.mockClear();
		await instance.navigateBack();
		expect(spy).not.toHaveBeenCalled();
		expect(instance.currentPath.value).toBe("/Users/me/ridge-workspace");
	});

	it("navigateBack goes to parent when not at root", async () => {
		const spy = vi
			.spyOn(api, "getWorkspaceFilesTree")
			.mockResolvedValue({
				root: "/workspace",
				directory: "/workspace/notes",
				entries: [],
			} as Awaited<ReturnType<typeof api.getWorkspaceFilesTree>>);

		const instance = useWorkspaceFiles();
		await instance.load("/workspace/notes");

		await instance.navigateBack();
		expect(spy).toHaveBeenLastCalledWith("/workspace");
	});

	it("load updates entries, workspaceRoot and currentPath", async () => {
		const spy = vi.spyOn(api, "getWorkspaceFilesTree").mockResolvedValue({
			root: "/workspace",
			directory: "/workspace/notes",
			entries: [
				{ name: "daily", kind: "directory", path: "/workspace/notes/daily", size: 0, modifiedAt: 1, extension: "" },
			],
		} as Awaited<ReturnType<typeof api.getWorkspaceFilesTree>>);

		const instance = useWorkspaceFiles();
		await instance.load("/workspace/notes");

		expect(instance.workspaceRoot.value).toBe("/workspace");
		expect(instance.currentPath.value).toBe("/workspace/notes");
		expect(instance.entries.value).toHaveLength(1);
		expect(instance.loading.value).toBe(false);
		expect(instance.error.value).toBe("");

		spy.mockRestore();
	});
	it("retry calls retryFileProcessing and refreshes current directory", async () => {
		const treeSpy = vi
			.spyOn(api, "getWorkspaceFilesTree")
			.mockResolvedValue({
				root: "/workspace",
				directory: "/workspace/notes",
				entries: [],
			} as Awaited<ReturnType<typeof api.getWorkspaceFilesTree>>);

		const retrySpy = vi
			.spyOn(api, "retryFileProcessing")
			.mockResolvedValue({ ok: true });

		const instance = useWorkspaceFiles();
		await instance.load("/workspace/notes");

		treeSpy.mockClear();
		await instance.retry("/workspace/notes/failed.pdf");

		expect(retrySpy).toHaveBeenCalledWith("/workspace/notes/failed.pdf");
		expect(treeSpy).toHaveBeenCalledWith("/workspace/notes");
		expect(instance.error.value).toBe("");

		retrySpy.mockRestore();
		treeSpy.mockRestore();
	});

	it("retry captures error on failure", async () => {
		vi.spyOn(api, "getWorkspaceFilesTree").mockResolvedValue({
			root: "/workspace",
			directory: "/workspace/notes",
			entries: [],
		} as Awaited<ReturnType<typeof api.getWorkspaceFilesTree>>);

		const retrySpy = vi
			.spyOn(api, "retryFileProcessing")
			.mockRejectedValue(new Error("Retry failed"));

		const instance = useWorkspaceFiles();
		await instance.load("/workspace/notes");
		await instance.retry("/workspace/notes/failed.pdf");

		expect(instance.error.value).toBe("Retry failed");
		retrySpy.mockRestore();
	});
});

describe("getParentPath", () => {
	it("returns parent for nested paths", () => {
		expect(getParentPath("/workspace/notes")).toBe("/workspace");
		expect(getParentPath("/workspace/notes/daily")).toBe("/workspace/notes");
	});

	it("returns null at root", () => {
		expect(getParentPath("/workspace")).toBeNull();
		expect(getParentPath("/")).toBeNull();
	});

	it("handles trailing slashes and backslashes", () => {
		expect(getParentPath("/workspace/notes/")).toBe("/workspace");
		expect(getParentPath("/workspace\\notes")).toBe("/workspace");
	});

	it("returns null for empty string", () => {
		expect(getParentPath("")).toBeNull();
	});
});
