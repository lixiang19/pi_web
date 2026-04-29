<script setup lang="ts">
import { ref } from "vue";
import {
	Archive,
	FileText,
	Inbox,
	Lightbulb,
	LoaderCircle,
	Pencil,
	Search,
	Trash2,
} from "lucide-vue-next";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

import InboxArchiveDialog from "./InboxArchiveDialog.vue";
import InboxDeleteDialog from "./InboxDeleteDialog.vue";
import InboxRenameDialog from "./InboxRenameDialog.vue";

import {
	useWorkspaceInbox,
	type InboxFileItem,
} from "@/composables/useInbox";
import { getFileTree } from "@/lib/api";

const props = defineProps<{
	workspaceDir: string;
}>();

const emit = defineEmits<{
	(e: "open-file", path: string): void;
	(e: "refresh-tree"): void;
}>();

// Use the inbox composable (provided by WorkspacePage, or standalone fallback)
const {
	filteredFiles,
	isLoading,
	searchQuery,
	sortKey,
	count,
	captureNote,
	deleteItem,
	renameItem,
	archiveItem,
	formatTime,
} = useWorkspaceInbox(() => props.workspaceDir);

// Fleeting note input
const fleetingText = ref("");
const isSaving = ref(false);

// Dialog state
const archiveDialogOpen = ref(false);
const deleteDialogOpen = ref(false);
const renameDialogOpen = ref(false);
const activeNote = ref<InboxFileItem | null>(null);

// Directory list for archive target
const archiveDirectories = ref<string[]>([]);

const handleCapture = async () => {
	const text = fleetingText.value.trim();
	if (!text || !props.workspaceDir) return;

	isSaving.value = true;
	try {
		const response = await captureNote(text);
		fleetingText.value = "";
		emit("refresh-tree");
		emit("open-file", response.path);
	} catch (err) {
		console.error("Failed to capture fleeting note", err);
	} finally {
		isSaving.value = false;
	}
};

// Open archive dialog and load directory list
const openArchiveDialog = async (note: InboxFileItem) => {
	activeNote.value = note;
	archiveDialogOpen.value = true;

	// Fetch root-level directories for archive target
	try {
		const res = await getFileTree(props.workspaceDir, props.workspaceDir);
		archiveDirectories.value = res.entries
			.filter((e) => e.kind === "directory" && e.name !== "收件箱")
			.map((e) => e.name);
	} catch {
		archiveDirectories.value = ["笔记"];
	}
};

const openDeleteDialog = (note: InboxFileItem) => {
	activeNote.value = note;
	deleteDialogOpen.value = true;
};

const openRenameDialog = (note: InboxFileItem) => {
	activeNote.value = note;
	renameDialogOpen.value = true;
};

const handleArchive = async (relativePath: string, targetDir: string) => {
	try {
		await archiveItem(relativePath, targetDir);
		emit("refresh-tree");
	} catch {
		// error handled in composable
	}
};

const handleDelete = async (relativePath: string) => {
	try {
		await deleteItem(relativePath);
		emit("refresh-tree");
	} catch {
		// error handled in composable
	}
};

const handleRename = async (relativePath: string, newName: string) => {
	try {
		await renameItem(relativePath, newName);
		emit("refresh-tree");
	} catch {
		// error handled in composable
	}
};

// Auto-resize textarea
const handleInput = (e: Event) => {
	const target = e.target as HTMLTextAreaElement;
	target.style.height = "auto";
	target.style.height = Math.min(target.scrollHeight, 160) + "px";
};
</script>

<template>
  <div class="h-full overflow-auto p-6">
    <div class="mx-auto max-w-2xl space-y-5">
      <!-- 标题 -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">收件箱</h1>
          <p class="mt-1 text-sm text-muted-foreground">快速捕捉闪念与灵感</p>
        </div>
        <Badge v-if="count > 0" variant="secondary" class="text-xs">
          {{ count }}
        </Badge>
      </div>

      <!-- 闪念捕捉 -->
      <div class="rounded-lg border border-border/50 bg-card p-5">
        <div class="flex items-center gap-2 mb-3">
          <Lightbulb class="size-4 text-amber-500" />
          <h2 class="text-sm font-semibold text-foreground">闪念捕捉</h2>
        </div>

        <Textarea
          v-model="fleetingText"
          placeholder="此刻的想法…"
          class="min-h-20 max-h-40 resize-none text-sm"
          @input="handleInput"
          @keydown.ctrl.enter="handleCapture"
          @keydown.meta.enter="handleCapture"
        />

        <div class="mt-3 flex items-center justify-between">
          <span class="text-[11px] text-muted-foreground">⌘ Enter 发送</span>
          <Button
            size="sm"
            class="h-7 gap-1.5 text-xs"
            :disabled="!fleetingText.trim() || isSaving"
            @click="handleCapture"
          >
            <LoaderCircle v-if="isSaving" class="size-3 animate-spin" />
            <Inbox v-else class="size-3" />
            捕捉
          </Button>
        </div>
      </div>

      <!-- 收件箱笔记列表 -->
      <div class="rounded-lg border border-border/50 bg-card p-5">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <Inbox class="size-4 text-muted-foreground" />
            <h2 class="text-sm font-semibold text-foreground">收件箱笔记</h2>
          </div>

          <!-- Search + Sort -->
          <div v-if="count > 0" class="flex items-center gap-2">
            <div class="flex h-7 items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2">
              <Search class="size-3 text-muted-foreground" />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="搜索..."
                class="min-w-0 w-24 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
              />
            </div>
            <Select v-model="sortKey" class="h-7">
              <SelectTrigger class="h-7 w-24 text-[11px] border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="modified">修改时间</SelectItem>
                <SelectItem value="created">创建时间</SelectItem>
                <SelectItem value="name">名称</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <LoaderCircle class="size-3.5 animate-spin" />
          加载中...
        </div>

        <!-- Empty state -->
        <div v-else-if="count === 0" class="flex flex-col items-center py-8">
          <div class="size-12 rounded-full bg-muted/40 flex items-center justify-center mb-3">
            <Lightbulb class="size-5 text-muted-foreground/40" />
          </div>
          <p class="text-sm text-muted-foreground">收件箱为空</p>
          <p class="mt-1 text-xs text-muted-foreground/60">写下你的第一个闪念吧</p>
        </div>

        <!-- Search no results -->
        <div v-else-if="filteredFiles.length === 0 && searchQuery" class="flex flex-col items-center py-6">
          <Search class="size-5 text-muted-foreground/40 mb-2" />
          <p class="text-xs text-muted-foreground">没有匹配的笔记</p>
        </div>

        <!-- File list -->
        <div v-else class="space-y-0.5">
          <ContextMenu v-for="file in filteredFiles" :key="file.path">
            <ContextMenuTrigger as-child>
              <button
                type="button"
                class="group flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/40"
                @click="emit('open-file', file.path)"
              >
                <FileText class="size-4 shrink-0 mt-0.5 text-muted-foreground" />

                <div class="min-w-0 flex-1">
                  <p class="text-sm text-foreground truncate">{{ file.name.replace(/\.md$/, "") }}</p>
                  <p v-if="file.preview" class="mt-0.5 text-xs text-muted-foreground/70 truncate">
                    {{ file.preview }}
                  </p>
                </div>

                <div class="flex shrink-0 items-center gap-1">
                  <!-- Hover actions -->
                  <TooltipProvider :delay-duration="500">
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <button
                          type="button"
                          class="size-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          @click.stop="openArchiveDialog(file)"
                        >
                          <Archive class="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent class="text-xs">归档</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider :delay-duration="500">
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <button
                          type="button"
                          class="size-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          @click.stop="openRenameDialog(file)"
                        >
                          <Pencil class="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent class="text-xs">重命名</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider :delay-duration="500">
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <button
                          type="button"
                          class="size-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          @click.stop="openDeleteDialog(file)"
                        >
                          <Trash2 class="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent class="text-xs">删除</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <span class="text-[11px] text-muted-foreground tabular-nums ml-1">
                    {{ formatTime(file.modifiedAt) }}
                  </span>
                </div>
              </button>
            </ContextMenuTrigger>

            <ContextMenuContent class="w-48">
              <ContextMenuItem class="text-xs" @click="emit('open-file', file.path)">
                <FileText class="mr-2 size-3.5" />
                打开
              </ContextMenuItem>
              <ContextMenuItem class="text-xs" @click="openRenameDialog(file)">
                <Pencil class="mr-2 size-3.5" />
                重命名
              </ContextMenuItem>
              <ContextMenuItem class="text-xs" @click="openArchiveDialog(file)">
                <Archive class="mr-2 size-3.5" />
                归档到...
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem class="text-xs text-destructive focus:text-destructive" @click="openDeleteDialog(file)">
                <Trash2 class="mr-2 size-3.5" />
                删除
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>
      </div>
    </div>

    <!-- Dialogs -->
    <InboxArchiveDialog
      v-model:open="archiveDialogOpen"
      :note-name="activeNote?.name ?? ''"
      :note-relative-path="activeNote?.relativePath ?? ''"
      :directories="archiveDirectories"
      @archive="handleArchive"
    />

    <InboxDeleteDialog
      v-model:open="deleteDialogOpen"
      :note-name="activeNote?.name ?? ''"
      :note-relative-path="activeNote?.relativePath ?? ''"
      @delete="handleDelete"
    />

    <InboxRenameDialog
      v-model:open="renameDialogOpen"
      :note-name="activeNote?.name ?? ''"
      :note-relative-path="activeNote?.relativePath ?? ''"
      @rename="handleRename"
    />
  </div>
</template>
