<script setup lang="ts">
import { computed } from "vue";
import {
	ChevronRight,
	Folder,
	FileText,
	LoaderCircle,
	ArrowLeft,
} from "lucide-vue-next";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FileTreeEntry } from "@/lib/types";

const props = defineProps<{
	workspaceRoot: string;
	entries: FileTreeEntry[];
	currentPath: string;
	loading: boolean;
}>();

const emit = defineEmits<{
	(e: "open-file", path: string): void;
	(e: "navigate", path: string): void;
	(e: "navigate-back"): void;
}>();

const statusLabelMap: Record<string, string> = {
	pending: "待处理",
	converting: "转换中",
	converted: "已转换",
	indexed: "已索引",
	convert_failed: "转换失败",
	index_failed: "索引失败",
};

const statusVariantMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
	pending: "secondary",
	converting: "default",
	converted: "default",
	indexed: "default",
	convert_failed: "destructive",
	index_failed: "destructive",
};

const breadcrumbSegments = computed(() => {
	const ws = props.workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
	const current = props.currentPath.replace(/\\/g, "/").replace(/\/+$/, "");
	if (!current || current === ws) return [];
	const prefix = ws + "/";
	if (!current.startsWith(prefix)) return [];
	const relative = current.slice(prefix.length);
	return relative.split("/").filter((s) => s !== ".ridge");
});

const isInWorkspaceRoot = computed(() => {
	const ws = props.workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
	const current = props.currentPath.replace(/\\/g, "/").replace(/\/+$/, "");
	return current === ws;
});

const directoryEntries = computed(() =>
	props.entries.filter((e) => e.kind === "directory"),
);

const fileEntries = computed(() =>
	props.entries.filter((e) => e.kind === "file"),
);

const handleClick = (entry: FileTreeEntry) => {
	if (entry.kind === "directory") {
		emit("navigate", entry.path);
	} else {
		emit("open-file", entry.path);
	}
};

const navigateToSegment = (index: number) => {
	const segments = breadcrumbSegments.value.slice(0, index + 1);
	const ws = props.workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
	const target = ws + (segments.length ? "/" + segments.join("/") : "");
	emit("navigate", target);
};
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <!-- Header -->
    <header class="shrink-0 border-b border-border/40 px-4 py-3">
      <div class="flex items-center gap-2 text-sm">
        <button
          v-if="!isInWorkspaceRoot"
          type="button"
          class="mr-1 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          @click="$emit('navigate-back')"
        >
          <ArrowLeft class="size-4" />
        </button>
        <span class="font-semibold text-foreground">文件</span>
        <ChevronRight class="size-3.5 text-muted-foreground" />
        <span data-test="breadcrumb" class="flex items-center gap-1 text-muted-foreground">
          <button
            v-for="(segment, index) in breadcrumbSegments"
            :key="index"
            type="button"
            class="hover:text-foreground"
            @click="navigateToSegment(index)"
          >
            {{ segment }}
            <span v-if="index < breadcrumbSegments.length - 1" class="mx-1 text-muted-foreground">/</span>
          </button>
          <span v-if="breadcrumbSegments.length === 0">工作空间</span>
        </span>
      </div>
    </header>

    <!-- Content -->
    <ScrollArea class="flex-1">
      <div v-if="loading" class="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <LoaderCircle class="size-4 animate-spin" />
        加载中...
      </div>

      <div v-else-if="entries.length === 0" class="flex flex-col items-center py-12 text-sm text-muted-foreground">
        <Folder class="mb-2 size-8 text-muted-foreground/40" />
        空文件夹
      </div>

      <div v-else class="divide-y divide-border/30">
        <!-- Directories -->
        <button
          v-for="entry in directoryEntries"
          :key="entry.path"
          type="button"
          data-test="file-row"
          class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/40"
          @click="handleClick(entry)"
        >
          <Folder class="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ entry.name }}</span>
        </button>

        <!-- Files -->
        <button
          v-for="entry in fileEntries"
          :key="entry.path"
          type="button"
          data-test="file-row"
          class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/40"
          @click="handleClick(entry)"
        >
          <FileText class="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1 truncate text-sm">{{ entry.name }}</span>
          <Badge
            v-if="entry.processingStatus"
            :variant="statusVariantMap[entry.processingStatus] ?? 'secondary'"
            class="shrink-0 text-[10px]"
          >
            {{ statusLabelMap[entry.processingStatus] ?? entry.processingStatus }}
          </Badge>
        </button>
      </div>
    </ScrollArea>
  </div>
</template>
