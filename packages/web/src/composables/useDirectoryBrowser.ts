import { computed, ref } from "vue";

import { browseFilesystem } from "@/lib/api";
import type { FileTreeEntry } from "@/lib/types";

const normalizePath = (value: string) =>
  value.replace(/\\/g, "/").replace(/\/+$/, "");

export function useDirectoryBrowser() {
  const homeDir = ref("");
  const currentPath = ref("");
  const parentPath = ref<string | null>(null);
  const entries = ref<FileTreeEntry[]>([]);
  const isLoading = ref(false);
  const error = ref("");

  const breadcrumbs = computed(() => {
    const normalizedHome = normalizePath(homeDir.value);
    const normalizedCurrent = normalizePath(currentPath.value);

    if (!normalizedHome || !normalizedCurrent) {
      return [] as Array<{ label: string; path: string }>;
    }

    if (normalizedCurrent === normalizedHome) {
      return [{ label: "Home", path: normalizedHome }];
    }

    const suffix = normalizedCurrent.slice(normalizedHome.length).replace(/^\//, "");
    const segments = suffix.split("/").filter(Boolean);
    let cursor = normalizedHome;

    return [
      { label: "Home", path: normalizedHome },
      ...segments.map((segment) => {
        cursor = `${cursor}/${segment}`;
        return {
          label: segment,
          path: cursor,
        };
      }),
    ];
  });

  const load = async (path?: string) => {
    isLoading.value = true;
    error.value = "";

    try {
      const payload = await browseFilesystem(path);
      homeDir.value = payload.homeDir;
      currentPath.value = payload.path;
      parentPath.value = payload.parent;
      entries.value = payload.entries;
      return payload;
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      throw caughtError;
    } finally {
      isLoading.value = false;
    }
  };

  const openDirectory = async (nextPath: string) => load(nextPath);
  const goParent = async () => {
    if (!parentPath.value) {
      return null;
    }

    return load(parentPath.value);
  };

  return {
    breadcrumbs,
    currentPath,
    entries,
    error,
    goParent,
    homeDir,
    isLoading,
    load,
    openDirectory,
    parentPath,
  };
}