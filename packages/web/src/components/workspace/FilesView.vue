<script setup lang="ts">
import { computed, ref } from "vue";
import {
	ChevronRight,
	Folder,
	FileText,
	LoaderCircle,
	ArrowLeft,
	RefreshCw,
	FolderPlus,
	Upload,
	Pencil,
	MoveRight,
	Trash2,
} from "lucide-vue-next";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FileTreeEntry } from "@/lib/types";

const props = defineProps<{
	workspaceRoot: string;
	entries: FileTreeEntry[];
	currentPath: string;
	loading: boolean;
	error?: string;
}>();

const emit = defineEmits<{
	(e: "open-file", path: string): void;
	(e: "navigate", path: string): void;
	(e: "navigate-back"): void;
	(e: "retry", path: string): void;
	(e: "convert", path: string, force: boolean): void;
	(e: "upload", files: File[]): void;
	(e: "create-folder", name: string): void;
	(e: "rename", path: string, name: string): void;
	(e: "move", path: string, targetDirectory: string): void;
	(e: "delete", path: string): void;
}>();

const convertDialogOpen = ref(false);
const convertTargetPath = ref("");
const convertTargetName = ref("");
const entryDialogOpen = ref(false);
const entryDialogMode = ref<"create-folder" | "rename" | "move">("create-folder");
const entryDialogPath = ref("");
const entryDialogName = ref("");
const entryDialogTargetDirectory = ref("");
const uploadInputRef = ref<HTMLInputElement | null>(null);

const currentEntryName = (entry: FileTreeEntry) => entry.name;

const dialogTitle = computed(() => {
	if (entryDialogMode.value === "create-folder") return "新建文件夹";
	if (entryDialogMode.value === "rename") return "重命名";
	return "移动到目录";
});

const openCreateFolderDialog = () => {
	entryDialogMode.value = "create-folder";
	entryDialogPath.value = "";
	entryDialogName.value = "";
	entryDialogTargetDirectory.value = "";
	entryDialogOpen.value = true;
};

const openRenameDialog = (entry: FileTreeEntry) => {
	entryDialogMode.value = "rename";
	entryDialogPath.value = entry.path;
	entryDialogName.value = currentEntryName(entry);
	entryDialogTargetDirectory.value = "";
	entryDialogOpen.value = true;
};

const openMoveDialog = (entry: FileTreeEntry) => {
	entryDialogMode.value = "move";
	entryDialogPath.value = entry.path;
	entryDialogName.value = "";
	entryDialogTargetDirectory.value = props.currentPath;
	entryDialogOpen.value = true;
};

const confirmEntryDialog = () => {
	if (entryDialogMode.value === "create-folder") {
		emit("create-folder", entryDialogName.value);
	} else if (entryDialogMode.value === "rename") {
		emit("rename", entryDialogPath.value, entryDialogName.value);
	} else {
		emit("move", entryDialogPath.value, entryDialogTargetDirectory.value);
	}
	entryDialogOpen.value = false;
};

const handleUploadChange = (event: Event) => {
	const input = event.target as HTMLInputElement;
	const files = Array.from(input.files ?? []);
	if (files.length > 0) {
		emit("upload", files);
	}
	input.value = "";
};

const openUploadPicker = () => {
	uploadInputRef.value?.click();
};

const showConvertDialog = (entry: FileTreeEntry) => {
	// Use originalPath for conversion products (.md files), otherwise use the entry's own path
	convertTargetPath.value = entry.originalPath ?? entry.path;
	convertTargetName.value = entry.name;
	convertDialogOpen.value = true;
};

const handleConvertConfirmed = () => {
	convertDialogOpen.value = false;
	emit("convert", convertTargetPath.value, false);
};

const handleForceConvert = () => {
	convertDialogOpen.value = false;
	emit("convert", convertTargetPath.value, true);
};

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
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <div class="flex min-w-0 flex-1 items-center gap-2">
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
          <span data-test="breadcrumb" class="flex min-w-0 items-center gap-1 text-muted-foreground">
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
        <div class="flex items-center gap-1">
          <input
            ref="uploadInputRef"
            data-test="file-upload-input"
            type="file"
            multiple
            class="hidden"
            @change="handleUploadChange"
          />
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            title="上传文件"
            @click="openUploadPicker"
          >
            <Upload class="size-4" />
          </Button>
          <Button
            data-test="create-folder-action"
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            title="新建文件夹"
            @click="openCreateFolderDialog"
          >
            <FolderPlus class="size-4" />
          </Button>
        </div>
      </div>
      <div v-if="error" class="mt-2 text-xs text-destructive">{{ error }}</div>
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
          @keydown.enter.prevent="handleClick(entry)"
          @keydown.space.prevent="handleClick(entry)"
        >
          <Folder class="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ entry.name }}</span>
          <span class="flex shrink-0 items-center gap-1">
            <button
              type="button"
              data-test="rename-entry-action"
              class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="重命名"
              @click.stop="openRenameDialog(entry)"
            >
              <Pencil class="size-3.5" />
            </button>
            <button
              type="button"
              data-test="move-entry-action"
              class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="移动"
              @click.stop="openMoveDialog(entry)"
            >
              <MoveRight class="size-3.5" />
            </button>
            <button
              type="button"
              data-test="delete-entry-action"
              class="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="删除"
              @click.stop="emit('delete', entry.path)"
            >
              <Trash2 class="size-3.5" />
            </button>
          </span>
        </button>

        <!-- Files -->
        <div
          v-for="entry in fileEntries"
          :key="entry.path"
          role="button"
          tabindex="0"
          data-test="file-row"
          class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/40 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          @click="handleClick(entry)"
          @keydown.enter.prevent="handleClick(entry)"
          @keydown.space.prevent="handleClick(entry)"
        >
          <FileText class="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1 truncate text-sm">{{ entry.name }}</span>
          <div class="flex shrink-0 items-center gap-1">
            <button
              type="button"
              data-test="rename-entry-action"
              class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="重命名"
              @click.stop="openRenameDialog(entry)"
            >
              <Pencil class="size-3.5" />
            </button>
            <button
              type="button"
              data-test="move-entry-action"
              class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="移动"
              @click.stop="openMoveDialog(entry)"
            >
              <MoveRight class="size-3.5" />
            </button>
            <button
              type="button"
              data-test="delete-entry-action"
              class="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="删除"
              @click.stop="emit('delete', entry.path)"
            >
              <Trash2 class="size-3.5" />
            </button>
          </div>
          <div
            v-if="entry.processingStatus === 'convert_failed' || entry.processingStatus === 'index_failed'"
            class="flex items-center gap-1"
          >
            <span
              v-if="entry.processingError"
              class="max-w-[120px] truncate text-[10px] text-destructive"
              :title="entry.processingError"
            >
              {{ entry.processingError }}
            </span>
            <button
              type="button"
              class="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="重试处理"
              @click.stop="emit('retry', entry.path)"
              @keydown.stop="(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }"
            >
              <RefreshCw class="size-3.5" />
            </button>
          </div>
          <div
            v-else-if="entry.processingStatus === 'converted'"
            class="flex items-center gap-1"
          >
            <button
              type="button"
              class="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="重新转换"
              @click.stop="showConvertDialog(entry)"
              @keydown.stop="(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }"
            >
              <RefreshCw class="size-3.5" />
            </button>
          </div>
          <Badge
            v-if="entry.processingStatus"
            :variant="statusVariantMap[entry.processingStatus] ?? 'secondary'"
            class="shrink-0 text-[10px]"
          >
            {{ statusLabelMap[entry.processingStatus] ?? entry.processingStatus }}
          </Badge>
        </div>
      </div>
    </ScrollArea>

    <Dialog v-if="entryDialogOpen" v-model:open="entryDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ dialogTitle }}</DialogTitle>
          <DialogDescription>
            <template v-if="entryDialogMode === 'move'">输入目标目录的工作空间绝对路径。</template>
            <template v-else>输入名称后确认。</template>
          </DialogDescription>
        </DialogHeader>
        <Input
          v-if="entryDialogMode !== 'move'"
          v-model="entryDialogName"
          data-test="entry-name-input"
          placeholder="名称"
          @keydown.enter="confirmEntryDialog"
        />
        <Input
          v-else
          v-model="entryDialogTargetDirectory"
          data-test="entry-target-directory-input"
          placeholder="/workspace/附件"
          @keydown.enter="confirmEntryDialog"
        />
        <DialogFooter class="gap-2 sm:justify-end">
          <Button variant="outline" @click="entryDialogOpen = false">取消</Button>
          <Button data-test="entry-dialog-confirm" @click="confirmEntryDialog">确认</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Re-convert confirmation dialog -->
    <Dialog v-model:open="convertDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重新转换</DialogTitle>
          <DialogDescription>
            将重新转换 <strong>{{ convertTargetName }}</strong>。如果 Markdown 已被用户编辑，强制覆盖会丢失修改。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="gap-2 sm:justify-end">
          <Button variant="outline" @click="convertDialogOpen = false">取消</Button>
          <Button variant="secondary" @click="handleConvertConfirmed">重新转换（保留编辑）</Button>
          <Button variant="default" @click="handleForceConvert">强制覆盖</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
