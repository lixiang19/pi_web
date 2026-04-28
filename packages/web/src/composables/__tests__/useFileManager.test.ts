import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFileManager } from "@/composables/useFileManager";
import type { FileTreeEntry } from "@/lib/types";

const apiMocks = vi.hoisted(() => ({
  createFileEntry: vi.fn(),
  getFileTree: vi.fn(),
  moveFileEntry: vi.fn(),
  trashFileEntry: vi.fn(),
  uploadFiles: vi.fn(),
}));

vi.mock("@/lib/api", () => apiMocks);

const directoryEntry: FileTreeEntry = {
  name: "docs",
  path: "/workspace/docs",
  kind: "directory",
  relativePath: "docs",
  size: null,
  modifiedAt: 100,
  extension: "",
};

const fileEntry: FileTreeEntry = {
  name: "README.md",
  path: "/workspace/README.md",
  kind: "file",
  relativePath: "README.md",
  size: 12,
  modifiedAt: 200,
  extension: ".md",
};

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("useFileManager", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    apiMocks.getFileTree.mockResolvedValue({
      root: "/workspace",
      directory: "/workspace",
      entries: [directoryEntry, fileEntry],
    });
    apiMocks.createFileEntry.mockResolvedValue({ entry: fileEntry });
    apiMocks.moveFileEntry.mockResolvedValue({ entry: fileEntry });
    apiMocks.trashFileEntry.mockResolvedValue({
      root: "/workspace",
      path: fileEntry.path,
      trashedAt: 1,
    });
    apiMocks.uploadFiles.mockResolvedValue({ entries: [fileEntry] });
  });

  it("loads the workspace root and exposes grid entries", async () => {
    const manager = useFileManager(ref("/workspace"));
    await flushPromises();

    expect(apiMocks.getFileTree).toHaveBeenCalledWith("/workspace", "/workspace");
    expect(manager.visibleEntries.value).toEqual([directoryEntry, fileEntry]);
  });

  it("opens directories by reloading the selected path", async () => {
    apiMocks.getFileTree.mockResolvedValueOnce({
      root: "/workspace",
      directory: "/workspace",
      entries: [directoryEntry],
    }).mockResolvedValueOnce({
      root: "/workspace",
      directory: "/workspace/docs",
      entries: [],
    });

    const manager = useFileManager(ref("/workspace"));
    await flushPromises();
    await manager.openDirectory("/workspace/docs");

    expect(apiMocks.getFileTree).toHaveBeenLastCalledWith(
      "/workspace/docs",
      "/workspace",
    );
    expect(manager.currentDirectory.value).toBe("/workspace/docs");
  });

  it("creates, renames, moves, trashes, and uploads through the file APIs", async () => {
    const manager = useFileManager(ref("/workspace"));
    await flushPromises();

    await manager.createEntry("notes.md", "file");
    expect(apiMocks.createFileEntry).toHaveBeenCalledWith({
      root: "/workspace",
      directory: "/workspace",
      name: "notes.md",
      kind: "file",
    });

    await manager.renameEntry(fileEntry, "README2.md");
    expect(apiMocks.moveFileEntry).toHaveBeenCalledWith({
      root: "/workspace",
      path: "/workspace/README.md",
      name: "README2.md",
    });

    await manager.moveEntry(fileEntry, "/workspace/docs");
    expect(apiMocks.moveFileEntry).toHaveBeenCalledWith({
      root: "/workspace",
      path: "/workspace/README.md",
      targetDirectory: "/workspace/docs",
    });

    await manager.trashEntry(fileEntry);
    expect(apiMocks.trashFileEntry).toHaveBeenCalledWith(
      "/workspace",
      "/workspace/README.md",
    );

    const uploadFile = new File(["hello"], "hello.txt", { type: "text/plain" });
    await manager.upload([uploadFile]);
    expect(apiMocks.uploadFiles).toHaveBeenCalledWith(
      "/workspace",
      "/workspace",
      [uploadFile],
    );
  });
});
