<script setup lang="ts">
import { computed, ref, onMounted, watch } from "vue";
import {
	BookOpen,
	Calendar,
	Database,
	GitBranch,
	Home,
	Inbox,
	LayoutDashboard,
	FilePlus2,
	FolderPlus,
	LayoutGrid,
} from "lucide-vue-next";

import FileTreePanel from "@/components/common/FileTreePanel.vue";
import WorkspaceContentArea from "@/components/workspace/WorkspaceContentArea.vue";
import HomePage from "@/components/workspace/HomePage.vue";
import DashboardView from "@/components/workspace/DashboardView.vue";
import TaskView from "@/components/workspace/TaskView.vue";
import CalendarView from "@/components/workspace/CalendarView.vue";
import InboxView from "@/components/workspace/InboxView.vue";
import GitChangesView from "@/components/workspace/GitChangesView.vue";
import SplitGrid from "@/components/workspace/split/SplitGrid.vue";
import { useFileTreeData } from "@/composables/useFileTreeData";
import { useWorkspaceFilePreview } from "@/composables/useWorkspaceFilePreview";
import { useSplitPanes, createHomeTab } from "@/composables/useSplitPanes";
import type { SplitTabItem } from "@/composables/useSplitPanes";
import type { DropZone } from "@/composables/useSplitDrag";
import { provideWorkspaceTasks } from "@/composables/useWorkspaceTasks";
import { provideWorkspaceInbox, useWorkspaceInbox } from "@/composables/useInbox";
import { usePiChatCore } from "@/composables/usePiChatCore";
import { useFavoritesStore } from "@/stores/favorites";
import { createNote, createNoteFolder, createFile, createBase, getRecentFiles, type RecentFileItem, moveFileEntry, trashFileEntry, createFileEntry } from "@/lib/api";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FileTreeEntry } from "@/lib/types";

const core = usePiChatCore();
const favoritesStore = useFavoritesStore();

const workspaceDir = computed(() => core.info.value?.workspaceDir ?? "");

// 共享任务 store
provideWorkspaceTasks(() => workspaceDir.value);

// 共享收件箱 store
provideWorkspaceInbox(() => workspaceDir.value);

// 文件树
const {
	rootPath,
	visibleNodes,
	fileTreeError,
	isDirectoryExpanded,
	isDirectoryLoading,
	toggleDirectory,
	refreshTree,
} = useFileTreeData(() => workspaceDir.value);

// 文件预览
const preview = useWorkspaceFilePreview(workspaceDir);

// 分屏管理
const splitPanes = useSplitPanes();

// 最近文件
const recentFiles = ref<RecentFileItem[]>([]);
const isRecentLoading = ref(false);

const loadRecentFiles = async () => {
	if (!workspaceDir.value) return;
	isRecentLoading.value = true;
	try {
		const res = await getRecentFiles(workspaceDir.value);
		recentFiles.value = res.files;
	} catch {
		recentFiles.value = [];
	} finally {
		isRecentLoading.value = false;
	}
};

onMounted(() => {
	loadRecentFiles();
});

// 固定视图入口
const fixedViews = [
	{ id: "dashboard", label: "仪表盘", icon: LayoutDashboard },
	{ id: "tasks", label: "待办", icon: BookOpen },
	{ id: "calendar", label: "日历", icon: Calendar },
	{ id: "inbox", label: "收件箱", icon: Inbox },
	{ id: "git-changes", label: "文件变更", icon: GitBranch },
] as const;

// 主页入口（独立于视图，可创建多个）
const homeEntry = { id: "home", label: "主页", icon: Home };

const viewLabelMap: Record<string, string> = {
	dashboard: "仪表盘",
	tasks: "待办",
	calendar: "日历",
	inbox: "收件箱",
	"git-changes": "文件变更",
};

// 收件箱数量
const inboxStore = useWorkspaceInbox(() => workspaceDir.value);
const inboxCount = inboxStore.count;

// .md 文件编辑器保存状态
const saveStatusMap = ref<Record<string, string>>({});

const handleSaveStatusUpdate = (tabId: string, status: string) => {
	saveStatusMap.value = { ...saveStatusMap.value, [tabId]: status };
};

// ===== 左侧面板 → 分屏面板 交互 =====

/** 左侧面板点击：创建新主页标签页 */
function handleOpenHome() {
	splitPanes.openTab(splitPanes.activePaneGroupId.value, createHomeTab());
}

/** 标签栏 + 按钮点击：创建新主页 */
function handleNewTab(paneGroupId: string) {
	splitPanes.openTab(paneGroupId, createHomeTab());
}

/** 打开视图标签页到当前活跃面板 */
function handleSelectView(viewId: string) {
	const tab: SplitTabItem = {
		id: viewId,
		title: viewLabelMap[viewId] ?? viewId,
		kind: "view",
		viewId,
		status: "idle",
	};
	splitPanes.openTab(splitPanes.activePaneGroupId.value, tab);
}

/** 打开文件标签页到当前活跃面板 */
function handleSelectFile(entry: FileTreeEntry) {
	if (entry.kind === "directory") {
		toggleDirectory(entry);
		return;
	}

	// 先加载文件预览
	preview.openFile(entry.path);

	const fileTab = preview.tabs.value.find((t) => t.path === entry.path);
	if (fileTab) {
		const editorStatus = saveStatusMap.value[fileTab.id];
		const tab: SplitTabItem = {
			id: fileTab.id,
			title: fileTab.title,
			kind: "file",
			filePath: fileTab.path,
			status: fileTab.isLoading ? "loading" : (editorStatus ?? "idle") as SplitTabItem["status"],
		};
		splitPanes.openTab(splitPanes.activePaneGroupId.value, tab);
	}
}

function handleToggleExpand(entry: FileTreeEntry) {
	toggleDirectory(entry);
}

async function handleToggleFavorite(path: string) {
	const isCurrentlyFavorited = favoritesStore.itemsByType
		.get("file")
		?.some((f) => f.data?.["path"] === path);

	if (isCurrentlyFavorited) {
		await favoritesStore.remove(path);
	} else {
		await favoritesStore.add({
			id: path,
			type: "file",
			name: path.split("/").filter(Boolean).at(-1) || path,
			data: { path },
		});
	}
}

// ===== SplitGrid 事件处理 =====

function handleSetActiveTab(paneGroupId: string, tabId: string) {
	splitPanes.setActiveTab(paneGroupId, tabId);
}

function handleCloseTab(paneGroupId: string, tabId: string) {
	// 同步关闭文件预览
	const tab = splitPanes.findTabAcrossPanes(tabId)?.tab;
	if (tab?.kind === "file") {
		preview.closeTab(tabId);
	}
	splitPanes.closeTab(paneGroupId, tabId);
}

function handleSplitRight(paneGroupId: string, tabId?: string) {
	splitPanes.splitRight(paneGroupId, tabId);
}

function handleResizeSplit(splitContainerId: string, sizes: [number, number]) {
	splitPanes.resizeSplit(splitContainerId, sizes);
}

function handleActivatePane(paneGroupId: string) {
	splitPanes.activePaneGroupId.value = paneGroupId;
}

function handleDropTab(payload: { fromPaneId: string; tabId: string; toPaneId: string; zone: DropZone }) {
	const { fromPaneId, tabId, toPaneId, zone } = payload;

	if (zone === "center") {
		splitPanes.moveTab(fromPaneId, toPaneId, tabId);
	} else {
		splitPanes.dropTabToEdge(fromPaneId, tabId, toPaneId, zone);
	}
}

// ===== 其他操作 =====

function handleOpenWithDefaultApp(path: string) {
	preview.openWithDefaultApp(path);
}

// 新建笔记
async function handleCreateNote(subdir: string) {
	try {
		const dir = workspaceDir.value;
		if (!dir) return;
		const relPath = subdir ? `${subdir}/未命名.md` : "未命名.md";
		const response = await createNote({ path: relPath });
		refreshTree();
		handleSelectFile({ kind: "file", path: response.path, name: "" });
	} catch (err) {
		console.error("Failed to create note", err);
	}
};

// 新建今日日记
async function handleCreateJournal(dateOverride?: string) {
	const now = new Date();
	const year = dateOverride ? Number(dateOverride.slice(0, 4)) : now.getFullYear();
	const month = dateOverride ? dateOverride.slice(5, 7) : String(now.getMonth() + 1).padStart(2, "0");
	const dateStr = dateOverride || `${year}-${month}-${String(now.getDate()).padStart(2, "0")}`;
	const journalRelPath = `日记/${year}/${month}/${dateStr}.md`;

	try {
		const response = await createNote({ path: journalRelPath });
		refreshTree();
		handleSelectFile({ kind: "file", path: response.path, name: "" });
	} catch (err) {
		console.error("Failed to create journal", err);
	}
};

// 新建文件夹
async function handleCreateFolder() {
	try {
		await createNoteFolder();
		refreshTree();
	} catch (err) {
		console.error("Failed to create folder", err);
	}
};

// 新建 Canvas
async function handleCreateCanvas() {
	try {
		const dir = workspaceDir.value;
		if (!dir) return;
		const response = await createFile("canvas/未命名.canvas", "{}");
		refreshTree();
		handleSelectFile({ kind: "file", path: response.path, name: "" });
	} catch (err) {
		console.error("Failed to create canvas", err);
	}
};

// 新建 Base
async function handleCreateBase() {
	try {
		const result = await createBase("新数据库");
		refreshTree();
		const fullPath = `${workspaceDir.value}/${result.path}`;
		handleSelectFile({ kind: "file", path: fullPath, name: "" });
	} catch (err) {
		console.error("Failed to create base", err);
	}
};

// 重命名文件/文件夹
async function handleRename(payload: { oldPath: string; newName: string }) {
  try {
    await moveFileEntry({
      root: workspaceDir.value,
      path: payload.oldPath,
      name: payload.newName,
    });
    refreshTree();
  } catch (err) {
    console.error("Failed to rename", err);
  }
}

// 删除文件/文件夹
async function handleDelete(entry: FileTreeEntry) {
  try {
    await trashFileEntry(workspaceDir.value, entry.path);
    refreshTree();
  } catch (err) {
    console.error("Failed to delete", err);
  }
}

// 在文件树中新建文件夹
async function handleCreateFolderInTree(payload: { parentPath: string; name: string }) {
  try {
    await createFileEntry({
      root: workspaceDir.value,
      directory: payload.parentPath,
      name: payload.name,
      kind: 'directory',
    });
    refreshTree();
  } catch (err) {
    console.error("Failed to create folder", err);
  }
}

// ===== 同步文件预览状态到分屏标签页 =====

// 当 preview.tabs 变化时（如文件加载完成），同步 status 到分屏标签
function syncPreviewStatusToSplitPanes() {
	for (const pane of splitPanes.allPaneGroups.value) {
		for (const tab of pane.tabs) {
			if (tab.kind === "file") {
				const fileTab = preview.tabs.value.find((t) => t.id === tab.id);
				if (fileTab) {
					const editorStatus = saveStatusMap.value[fileTab.id];
					const newStatus = fileTab.isLoading
						? "loading"
						: fileTab.error
							? "error"
							: editorStatus ?? "idle";
					if (tab.status !== newStatus) {
						tab.status = newStatus as SplitTabItem["status"];
					}
				}
			}
		}
	}
}

// 每次 preview.tabs 变化时同步
watch(() => preview.tabs.value, syncPreviewStatusToSplitPanes, { deep: true });
watch(saveStatusMap, syncPreviewStatusToSplitPanes, { deep: true });
</script>

<template>
  <div class="flex h-full min-h-0 bg-background text-foreground">
    <!-- 左侧面板 -->
    <aside class="flex w-[260px] shrink-0 flex-col border-r border-border/50 bg-background">
      <!-- 固定视图入口 -->
      <div class="shrink-0 space-y-0.5 px-2 pt-3 pb-2">
        <!-- 主页入口 -->
        <button
          type="button"
          class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          @click="handleOpenHome"
        >
          <component :is="homeEntry.icon" class="size-4" />
          <span class="flex-1">{{ homeEntry.label }}</span>
        </button>

        <Separator class="my-1" />

        <button
          v-for="view in fixedViews"
          :key="view.id"
          type="button"
          class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          @click="handleSelectView(view.id)"
        >
          <component :is="view.icon" class="size-4" />
          <span class="flex-1">{{ view.label }}</span>
          <Badge v-if="view.id === 'inbox' && inboxCount > 0" variant="secondary" class="h-4 min-w-4 px-1 text-[10px]">
            {{ inboxCount }}
          </Badge>
        </button>
      </div>

      <Separator class="mx-3" />

      <!-- 新建按钮行 -->
      <div class="shrink-0 px-3 py-2">
        <div class="flex items-center justify-between gap-1">
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                type="button"
                class="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                @click="handleCreateNote('笔记')"
              >
                <FilePlus2 class="size-3.5" />
                新建
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">新建笔记</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger as-child>
              <button
                type="button"
                class="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                @click="handleCreateFolder"
              >
                <FolderPlus class="size-3.5" />
                文件夹
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">新建文件夹</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger as-child>
              <button
                type="button"
                class="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                @click="handleCreateCanvas"
              >
                <LayoutGrid class="size-3.5" />
                Canvas
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">新建 Canvas</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger as-child>
              <button
                type="button"
                class="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                @click="handleCreateBase"
              >
                <Database class="size-3.5" />
                Base
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">新建数据库</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <!-- 文件树 -->
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <FileTreePanel
          :nodes="visibleNodes"
          :is-root-loading="isDirectoryLoading(rootPath)"
          :error="fileTreeError"
          :is-expanded="isDirectoryExpanded"
          :is-loading="isDirectoryLoading"
          :recent-files="recentFiles"
          :is-recent-loading="isRecentLoading"
          :root-path="rootPath"
          @select="handleSelectFile"
          @toggle-expand="handleToggleExpand"
          @toggle-favorite="handleToggleFavorite"
          @refresh="refreshTree"
          @rename="handleRename"
          @delete="handleDelete"
          @create-folder="handleCreateFolderInTree"
        />
      </div>
    </aside>

    <!-- 中间分屏区域 -->
    <main class="flex min-h-0 flex-1 overflow-hidden">
      <SplitGrid
        :node="splitPanes.rootNode.value"
        :active-pane-group-id="splitPanes.activePaneGroupId.value"
        @set-active-tab="handleSetActiveTab"
        @close-tab="handleCloseTab"
        @split-right="handleSplitRight"
        @new-tab="handleNewTab"
        @resize-split="handleResizeSplit"
        @activate-pane="handleActivatePane"
        @drop-tab="handleDropTab"
      >
        <!-- 每个 PaneGroup 的内容区通过 slot 渲染 -->
        <template #default="{ tabs, activeTabId }">
          <!-- 视图标签页 -->
          <div v-show="activeTabId === 'dashboard'" class="h-full">
            <DashboardView
              :workspace-dir="workspaceDir"
              @open-file="handleSelectFile({ kind: 'file', path: $event, name: '' }) as any"
              @create-journal="handleCreateJournal"
              @create-note="handleCreateNote('笔记')"
              @create-inbox-note="handleCreateNote('收件箱')"
              @open-tasks-view="handleSelectView('tasks')"
              @open-inbox-view="handleSelectView('inbox')"
            />
          </div>

          <div v-show="activeTabId === 'tasks'" class="h-full">
            <TaskView
              :workspace-dir="workspaceDir"
              @open-file="handleSelectFile({ kind: 'file', path: $event, name: '' }) as any"
            />
          </div>

          <div v-show="activeTabId === 'calendar'" class="h-full">
            <CalendarView
              :workspace-dir="workspaceDir"
              @open-file="handleSelectFile({ kind: 'file', path: $event, name: '' }) as any"
              @create-journal="handleCreateJournal($event)"
            />
          </div>

          <div v-show="activeTabId === 'inbox'" class="h-full">
            <InboxView
              :workspace-dir="workspaceDir"
              @open-file="handleSelectFile({ kind: 'file', path: $event, name: '' }) as any"
              @refresh-tree="refreshTree"
            />
          </div>

          <div v-show="activeTabId === 'git-changes'" class="h-full">
            <GitChangesView :workspace-dir="workspaceDir" />
          </div>

          <!-- 主页标签页 -->
          <div
            v-for="tab in tabs"
            :key="tab.id"
            v-show="activeTabId === tab.id && tab.kind === 'home'"
            class="h-full"
          >
            <HomePage v-if="tab.kind === 'home'" />
          </div>

          <!-- 文件标签页 -->
          <div
            v-for="tab in tabs"
            :key="tab.id"
            v-show="activeTabId === tab.id && tab.kind === 'file'"
            class="h-full"
          >
            <WorkspaceContentArea
              v-if="tab.kind === 'file'"
              :tab="preview.tabs.value.find((t) => t.id === tab.id) ?? null"
              :root-dir="workspaceDir"
              @open-with-default-app="handleOpenWithDefaultApp"
              @load-more="preview.loadMore"
              @save-status="handleSaveStatusUpdate"
            />
          </div>
        </template>
      </SplitGrid>
    </main>
  </div>
</template>
