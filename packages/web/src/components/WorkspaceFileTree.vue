<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
} from "lucide-vue-next";

import { getFileTree } from "@/lib/api";
import type { FileTreeEntry } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

type VisibleTreeNode = {
  entry: FileTreeEntry;
  depth: number;
};

const props = defineProps<{
  rootDir: string;
}>();

const childrenByDirectory = ref<Record<string, FileTreeEntry[]>>({});
const expandedDirectories = ref<string[]>([]);
const loadingDirectories = ref<string[]>([]);
const fileTreeError = ref("");

const normalizePath = (value: string) =>
  value.replace(/\\/g, "/").replace(/\/+$/, "");

const rootPath = computed(() => normalizePath(props.rootDir || ""));

const isDirectoryExpanded = (directoryPath: string) =>
  expandedDirectories.value.includes(directoryPath);

const isDirectoryLoading = (directoryPath: string) =>
  loadingDirectories.value.includes(directoryPath);

const setDirectoryEntries = (
  directoryPath: string,
  entries: FileTreeEntry[],
) => {
  childrenByDirectory.value = {
    ...childrenByDirectory.value,
    [directoryPath]: entries,
  };
};

const loadDirectory = async (
  directoryPath: string,
  options?: { force?: boolean },
) => {
  const normalizedDirectory = normalizePath(directoryPath);
  if (!normalizedDirectory) {
    return;
  }

  if (!options?.force && childrenByDirectory.value[normalizedDirectory]) {
    return;
  }

  if (isDirectoryLoading(normalizedDirectory)) {
    return;
  }

  loadingDirectories.value = [...loadingDirectories.value, normalizedDirectory];
  fileTreeError.value = "";

  try {
    const payload = await getFileTree(
      normalizedDirectory,
      rootPath.value || normalizedDirectory,
    );
    setDirectoryEntries(normalizedDirectory, payload.entries);
  } catch (caughtError) {
    fileTreeError.value =
      caughtError instanceof Error ? caughtError.message : String(caughtError);
  } finally {
    loadingDirectories.value = loadingDirectories.value.filter(
      (path) => path !== normalizedDirectory,
    );
  }
};

const toggleDirectory = async (entry: FileTreeEntry) => {
  if (entry.kind !== "directory") {
    return;
  }

  if (isDirectoryExpanded(entry.path)) {
    expandedDirectories.value = expandedDirectories.value.filter(
      (path) => path !== entry.path,
    );
    return;
  }

  expandedDirectories.value = [...expandedDirectories.value, entry.path];
  await loadDirectory(entry.path);
};

const visibleNodes = computed<VisibleTreeNode[]>(() => {
  const root = rootPath.value;
  if (!root) {
    return [];
  }

  const flatten = (directoryPath: string, depth: number): VisibleTreeNode[] => {
    const entries = childrenByDirectory.value[directoryPath] ?? [];
    const nodes: VisibleTreeNode[] = [];

    for (const entry of entries) {
      nodes.push({ entry, depth });

      if (entry.kind === "directory" && isDirectoryExpanded(entry.path)) {
        nodes.push(...flatten(entry.path, depth + 1));
      }
    }

    return nodes;
  };

  return flatten(root, 0);
});

const refreshTree = async () => {
  const root = rootPath.value;
  if (!root) {
    return;
  }

  childrenByDirectory.value = {};
  expandedDirectories.value = [root];
  await loadDirectory(root, { force: true });
};

watch(
  rootPath,
  async (nextRoot) => {
    if (!nextRoot) {
      childrenByDirectory.value = {};
      expandedDirectories.value = [];
      fileTreeError.value = "";
      return;
    }

    childrenByDirectory.value = {};
    expandedDirectories.value = [nextRoot];
    await loadDirectory(nextRoot, { force: true });
  },
  { immediate: true },
);
</script>

<template>
  <div
    class="flex h-full flex-col overflow-hidden rounded-[28px] border border-white/10 bg-black/35 backdrop-blur"
  >
    <div class="border-b border-white/10 px-4 py-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-stone-100">文件树</p>
          <p class="mt-1 text-xs text-stone-500">当前会话目录的真实文件结构</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="rounded-full text-stone-400 hover:text-stone-100"
          @click="refreshTree"
        >
          <RefreshCw
            class="size-4"
            :class="isDirectoryLoading(rootPath) ? 'animate-spin' : ''"
          />
        </Button>
      </div>
      <p
        class="mt-3 break-all rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[11px] leading-5 text-stone-400"
      >
        {{ rootPath || "没有可展示的目录" }}
      </p>
    </div>

    <ScrollArea class="flex-1 px-2 py-3">
      <div v-if="!rootPath" class="px-3 py-8 text-sm text-stone-500">
        当前没有可用目录。
      </div>

      <div
        v-else-if="visibleNodes.length === 0 && isDirectoryLoading(rootPath)"
        class="flex items-center gap-3 px-3 py-8 text-sm text-stone-500"
      >
        <LoaderCircle class="size-4 animate-spin text-amber-300" />
        正在加载文件树...
      </div>

      <div
        v-else-if="fileTreeError"
        class="px-3 py-6 text-sm leading-6 text-red-200"
      >
        {{ fileTreeError }}
      </div>

      <div
        v-else-if="visibleNodes.length === 0"
        class="px-3 py-8 text-sm text-stone-500"
      >
        当前目录为空。
      </div>

      <div v-else class="space-y-1 pb-4">
        <button
          v-for="node in visibleNodes"
          :key="node.entry.path"
          type="button"
          class="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-white/[0.05]"
          :style="{ paddingLeft: `${node.depth * 16 + 12}px` }"
          @click="toggleDirectory(node.entry)"
        >
          <component
            :is="
              node.entry.kind === 'directory'
                ? isDirectoryExpanded(node.entry.path)
                  ? ChevronDown
                  : ChevronRight
                : ChevronRight
            "
            class="size-4 shrink-0"
            :class="
              node.entry.kind === 'directory'
                ? 'text-stone-500'
                : 'text-transparent'
            "
          />

          <component
            :is="
              node.entry.kind === 'directory'
                ? isDirectoryExpanded(node.entry.path)
                  ? FolderOpen
                  : Folder
                : FileCode2
            "
            class="size-4 shrink-0"
            :class="
              node.entry.kind === 'directory'
                ? 'text-amber-200'
                : 'text-stone-400'
            "
          />

          <span
            class="min-w-0 flex-1 truncate text-sm"
            :class="
              node.entry.kind === 'directory'
                ? 'text-stone-100'
                : 'text-stone-300'
            "
          >
            {{ node.entry.name }}
          </span>

          <LoaderCircle
            v-if="
              node.entry.kind === 'directory' &&
              isDirectoryLoading(node.entry.path)
            "
            class="size-3.5 shrink-0 animate-spin text-amber-300"
          />
        </button>
      </div>
    </ScrollArea>
  </div>
</template>
