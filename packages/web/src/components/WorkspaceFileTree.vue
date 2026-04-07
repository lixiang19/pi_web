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
    class="flex h-full flex-col overflow-hidden"
  >
    <div class="border-b px-4 py-2.5 bg-muted/20">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <p class="text-[9px] font-black uppercase tracking-widest text-foreground/40">Explorer</p>
        </div>
        <button
          class="p-1 text-foreground/30 hover:text-foreground transition-colors"
          @click="refreshTree"
        >
          <RefreshCw
            class="size-3"
            :class="isDirectoryLoading(rootPath) ? 'animate-spin' : ''"
          />
        </button>
      </div>
      <p
        class="mt-2 break-all border border-muted bg-muted/10 px-2 py-1 font-mono text-[9px] text-foreground/30"
      >
        {{ rootPath || "NO_ROOT" }}
      </p>
    </div>

    <div class="flex-1 overflow-auto scrollbar-thin">
      <div v-if="!rootPath" class="px-4 py-8 text-[9px] font-black uppercase text-foreground/20">
        No directory.
      </div>

      <div
        v-else-if="visibleNodes.length === 0 && isDirectoryLoading(rootPath)"
        class="flex items-center gap-3 px-4 py-8 text-[9px] font-black uppercase text-foreground/40"
      >
        <LoaderCircle class="size-3 animate-spin" />
        Loading...
      </div>

      <div
        v-else-if="fileTreeError"
        class="px-4 py-6 text-[9px] font-mono text-destructive"
      >
        {{ fileTreeError }}
      </div>

      <div
        v-else class="py-1">
        <button
          v-for="node in visibleNodes"
          :key="node.entry.path"
          type="button"
          class="group flex w-full items-center gap-1.5 border-l-2 border-transparent px-2 py-1 text-left transition hover:bg-accent/40"
          :class="isDirectoryExpanded(node.entry.path) ? 'border-primary/10' : ''"
          :style="{ paddingLeft: `${node.depth * 8 + 8}px` }"
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
            class="size-2.5 shrink-0"
            :class="
              node.entry.kind === 'directory'
                ? 'text-foreground/20'
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
            class="size-3 shrink-0"
            :class="
              node.entry.kind === 'directory'
                ? 'text-foreground/40'
                : 'text-foreground/60'
            "
          />

          <span
            class="min-w-0 flex-1 truncate text-[11px] font-medium tracking-tight"
            :class="node.entry.kind === 'directory' ? 'text-foreground/60 uppercase text-[10px] font-black' : 'text-foreground/80'"
          >
            {{ node.entry.name }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
