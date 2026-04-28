import { computed, ref, watch, type Ref } from "vue";

import {
  createFileEntry,
  getFileTree,
  moveFileEntry,
  trashFileEntry,
  uploadFiles,
} from "@/lib/api";
import type { FileTreeEntry } from "@/lib/types";

export type FileManagerSortKey = "name" | "modifiedAt" | "size";

const normalizePath = (value: string) =>
  value.replace(/\\/g, "/").replace(/\/+$/, "");

const isDirectory = (entry: FileTreeEntry) => entry.kind === "directory";

const compareByName = (left: FileTreeEntry, right: FileTreeEntry) => {
  if (left.kind !== right.kind) {
    return isDirectory(left) ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
};

export function useFileManager(rootDir: Ref<string>) {
  const currentDirectory = ref("");
  const entries = ref<FileTreeEntry[]>([]);
  const query = ref("");
  const sortKey = ref<FileManagerSortKey>("name");
  const isLoading = ref(false);
  const isMutating = ref(false);
  const error = ref("");

  const rootPath = computed(() => normalizePath(rootDir.value || ""));

  const relativeDirectory = computed(() => {
    if (!currentDirectory.value || !rootPath.value) {
      return "";
    }

    return currentDirectory.value
      .replace(rootPath.value, "")
      .replace(/^\/+/, "");
  });

  const breadcrumbs = computed(() => {
    const root = rootPath.value;
    if (!root) {
      return [];
    }

    const parts = relativeDirectory.value.split("/").filter(Boolean);
    let path = root;

    return [
      { label: "工作区", path: root },
      ...parts.map((part) => {
        path = `${path}/${part}`;
        return {
          label: part,
          path,
        };
      }),
    ];
  });

  const visibleEntries = computed(() => {
    const normalizedQuery = query.value.trim().toLowerCase();
    const filtered = normalizedQuery
      ? entries.value.filter((entry) =>
          entry.name.toLowerCase().includes(normalizedQuery),
        )
      : entries.value;

    return [...filtered].sort((left, right) => {
      if (sortKey.value === "modifiedAt") {
        if (left.kind !== right.kind) {
          return isDirectory(left) ? -1 : 1;
        }
        return right.modifiedAt - left.modifiedAt;
      }

      if (sortKey.value === "size") {
        if (left.kind !== right.kind) {
          return isDirectory(left) ? -1 : 1;
        }
        return (right.size ?? -1) - (left.size ?? -1);
      }

      return compareByName(left, right);
    });
  });

  const loadDirectory = async (directory = currentDirectory.value) => {
    const root = rootPath.value;
    if (!root) {
      currentDirectory.value = "";
      entries.value = [];
      error.value = "";
      return;
    }

    isLoading.value = true;
    error.value = "";

    try {
      const targetDirectory = directory || root;
      const response = await getFileTree(targetDirectory, root);
      currentDirectory.value = response.directory;
      entries.value = response.entries;
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
    } finally {
      isLoading.value = false;
    }
  };

  const refresh = async () => {
    await loadDirectory(currentDirectory.value);
  };

  const openDirectory = async (directoryPath: string) => {
    await loadDirectory(directoryPath);
  };

  const createEntry = async (name: string, kind: FileTreeEntry["kind"]) => {
    const root = rootPath.value;
    if (!root || !currentDirectory.value) {
      return;
    }

    isMutating.value = true;
    error.value = "";

    try {
      await createFileEntry({
        root,
        directory: currentDirectory.value,
        name,
        kind,
      });
      await refresh();
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      throw caughtError;
    } finally {
      isMutating.value = false;
    }
  };

  const renameEntry = async (entry: FileTreeEntry, name: string) => {
    const root = rootPath.value;
    if (!root) {
      return;
    }

    isMutating.value = true;
    error.value = "";

    try {
      await moveFileEntry({
        root,
        path: entry.path,
        name,
      });
      await refresh();
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      throw caughtError;
    } finally {
      isMutating.value = false;
    }
  };

  const moveEntry = async (entry: FileTreeEntry, targetDirectory: string) => {
    const root = rootPath.value;
    if (!root) {
      return;
    }

    isMutating.value = true;
    error.value = "";

    try {
      await moveFileEntry({
        root,
        path: entry.path,
        targetDirectory,
      });
      await refresh();
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      throw caughtError;
    } finally {
      isMutating.value = false;
    }
  };

  const trashEntry = async (entry: FileTreeEntry) => {
    const root = rootPath.value;
    if (!root) {
      return;
    }

    isMutating.value = true;
    error.value = "";

    try {
      await trashFileEntry(root, entry.path);
      await refresh();
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      throw caughtError;
    } finally {
      isMutating.value = false;
    }
  };

  const upload = async (files: File[]) => {
    const root = rootPath.value;
    if (!root || !currentDirectory.value || files.length === 0) {
      return;
    }

    isMutating.value = true;
    error.value = "";

    try {
      await uploadFiles(root, currentDirectory.value, files);
      await refresh();
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      throw caughtError;
    } finally {
      isMutating.value = false;
    }
  };

  watch(
    rootPath,
    async (nextRoot) => {
      currentDirectory.value = nextRoot;
      await loadDirectory(nextRoot);
    },
    { immediate: true },
  );

  return {
    breadcrumbs,
    currentDirectory,
    entries,
    error,
    isLoading,
    isMutating,
    query,
    relativeDirectory,
    rootPath,
    sortKey,
    visibleEntries,
    createEntry,
    loadDirectory,
    moveEntry,
    openDirectory,
    refresh,
    renameEntry,
    trashEntry,
    upload,
  };
}
