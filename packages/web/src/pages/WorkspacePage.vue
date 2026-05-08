<script setup lang="ts">
import { computed, ref, onMounted, watch } from "vue";
import {
	BookOpen,
	Bookmark,
	Calendar,
	Database,
	GitBranch,
	Home,
	Inbox,
	FilePlus2,
	FolderPlus,
	LayoutGrid,
} from "lucide-vue-next";

import FileTreePanel from "@/components/common/FileTreePanel.vue";
import WorkspaceContentArea from "@/components/workspace/WorkspaceContentArea.vue";
import HomePage from "@/components/workspace/HomePage.vue";
import TaskView from "@/components/workspace/TaskView.vue";
import CalendarView from "@/components/workspace/CalendarView.vue";
import ClipsView from "@/components/workspace/ClipsView.vue";
import InboxView from "@/components/workspace/InboxView.vue";
import GitChangesView from "@/components/workspace/GitChangesView.vue";
import WorkspaceChatTab from "@/components/workspace/WorkspaceChatTab.vue";
import TerminalTabContent from "@/components/workspace/TerminalTabContent.vue";
import AutomationTabContent from "@/components/workspace/AutomationTabContent.vue";
import SettingsTabContent from "@/components/workspace/SettingsTabContent.vue";
import WorkspaceTopMenu from "@/components/workspace/WorkspaceTopMenu.vue";
import SplitGrid from "@/components/workspace/split/SplitGrid.vue";
import { useFileTreeData } from "@/composables/useFileTreeData";
import { useFileTreeActions } from "@/composables/useFileTreeActions";
import { useWorkspaceFilePreview } from "@/composables/useWorkspaceFilePreview";
import {
	useSplitPanes,
	createHomeTab,
	createChatTab,
	createTerminalTab,
	createAutomationTab,
	createSettingsTab,
} from "@/composables/useSplitPanes";
import type { SplitTabItem } from "@/composables/useSplitPanes";
import type { DropZone } from "@/composables/useSplitDrag";
import { NO_AGENT_VALUE } from "@/composables/useWorkbenchSessionState";
import { provideWorkspaceTasks } from "@/composables/useWorkspaceTasks";
import { provideWorkspaceInbox } from "@/composables/useInbox";
import { usePiChatCore } from "@/composables/usePiChatCore";
import { useTerminalContextOptions } from "@/composables/useTerminalContextOptions";
import { useTerminalPool } from "@/composables/useTerminalPool";
import { useDashboard } from "@/composables/useDashboard";
import { useRecentActivity } from "@/composables/useRecentActivity";
import { useFavoritesStore } from "@/stores/favorites";
import { useSettingsStore } from "@/stores/settings";
import { createNote, createFile, createBase, createFileEntry, getRecentFiles, type RecentFileItem } from "@/lib/api";
import { createSession as createSessionApi } from "@/lib/api";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FileTreeEntry, ThinkingLevel } from "@/lib/types";
import { toast } from "vue-sonner";

/** 从文件绝对路径构造完整的 FileTreeEntry（用于只需路径即可打开文件的场景） */
function createFileTreeEntryFromPath(filePath: string): FileTreeEntry {
	const name = filePath.split("/").pop() ?? "";
	const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
	return {
		name,
		path: filePath,
		kind: "file",
		relativePath: "",
		size: null,
		modifiedAt: 0,
		extension: ext,
	};
}

const core = usePiChatCore();
const settingsStore = useSettingsStore();
const favoritesStore = useFavoritesStore();
const terminalPool = useTerminalPool();
const terminalContextOptions = useTerminalContextOptions();

const workspaceDir = computed(() => core.info.value?.workspaceDir ?? "");

// 共享任务 store
const tasksStore = provideWorkspaceTasks(() => workspaceDir.value);

// 共享收件箱 store
const inboxStore = provideWorkspaceInbox(() => workspaceDir.value);

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

const { handleDelete, handleRename, handleCreateFolderInTree } = useFileTreeActions(workspaceDir, refreshTree);

// 文件预览
const preview = useWorkspaceFilePreview(workspaceDir);

// 分屏管理
const splitPanes = useSplitPanes();

// 最近文件
const recentFiles = ref<RecentFileItem[]>([]);
const isRecentLoading = ref(false);

// 当前选中的目录路径（用于新建操作定位）
const selectedDirPath = ref<string>('');

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

// 固定视图入口（已移除仪表盘，内容并入首页）
const fixedViews = [
	{ id: "tasks", label: "待办", icon: BookOpen },
	{ id: "calendar", label: "日历", icon: Calendar },
	{ id: "inbox", label: "收件箱", icon: Inbox },
	{ id: "clips", label: "剪藏", icon: Bookmark },
	{ id: "git-changes", label: "文件变更", icon: GitBranch },
] as const;

// 主页入口（独立于视图，可创建多个）
const homeEntry = { id: "home", label: "主页", icon: Home };

const viewLabelMap: Record<string, string> = {
	tasks: "待办",
	calendar: "日历",
	inbox: "收件箱",
	clips: "剪藏",
	"git-changes": "文件变更",
};

// 收件箱数量
const inboxCount = inboxStore.count;

// 仪表盘数据（复用最近文件和日记）
const dashboard = useDashboard(() => workspaceDir.value);

// 最近活动
const { items: recentActivity } = useRecentActivity({
	recentFiles: recentFiles,
	todayTasks: tasksStore.todayTasks,
	recentMoments: inboxStore.recentItems,
	sessions: core.sessions,
	todayJournalPath: dashboard.todayJournalPath,
	hasTodayJournal: dashboard.hasTodayJournal,
});

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
function handleNewTab(payload: { paneGroupId: string }) {
	splitPanes.openTab(payload.paneGroupId, createHomeTab());
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
		selectedDirPath.value = entry.path;
		toggleDirectory(entry);
		return;
	}
	// 选中文件时，将父目录设为新建操作的默认位置
	selectedDirPath.value = entry.path.substring(0, entry.path.lastIndexOf('/'));

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

// 获取递增名称（避免重名）
function getNextName(existingNames: string[], baseName: string, ext?: string): string {
	const fullName = ext ? `${baseName}${ext}` : baseName;
	if (!existingNames.includes(fullName)) return fullName;
	let num = 1;
	while (existingNames.includes(ext ? `${baseName}${num}${ext}` : `${baseName}${num}`)) {
		num++;
	}
	return ext ? `${baseName}${num}${ext}` : `${baseName}${num}`;
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

// ===== 顶部系统菜单操作 =====

async function handleOpenTerminal() {
	await terminalContextOptions.load().catch(() => {});
	const terminal = await terminalPool.createNewTerminal(
		terminalContextOptions.createDefaultPayload(),
	);
	const tab = createTerminalTab(terminal.id, terminal.title);
	tab.onClose = (closedTab) => {
		if (closedTab.terminalId) {
			void terminalPool.closeTerminal(closedTab.terminalId);
		}
	};
	splitPanes.openTab(splitPanes.activePaneGroupId.value, tab);
}

function handleOpenAutomation() {
	const existing = splitPanes.findTabAcrossPanes("automation");
	if (existing) {
		splitPanes.setActiveTab(existing.pane.id, "automation");
		return;
	}
	splitPanes.openTab(splitPanes.activePaneGroupId.value, createAutomationTab());
}

function handleOpenSettings() {
	const existing = splitPanes.findTabAcrossPanes("settings");
	if (existing) {
		splitPanes.setActiveTab(existing.pane.id, "settings");
		return;
	}
	splitPanes.openTab(splitPanes.activePaneGroupId.value, createSettingsTab());
}

// ===== SplitGrid 事件处理 =====

function handleSetActiveTab(payload: { paneGroupId: string; tabId: string }) {
	splitPanes.setActiveTab(payload.paneGroupId, payload.tabId);
}

function handleCloseTab(payload: { paneGroupId: string; tabId: string }) {
	// 同步关闭文件预览
	const tab = splitPanes.findTabAcrossPanes(payload.tabId)?.tab;
	if (tab?.kind === "file") {
		const status = saveStatusMap.value[payload.tabId];
		if (status === "unsaved" || status === "saving" || status === "error") {
			toast.error("笔记尚未保存完成", {
				description: "请等待自动保存完成，或在保存失败时重试后再关闭。",
			});
			return;
		}
		preview.closeTab(payload.tabId);
	}
	splitPanes.closeTab(payload.paneGroupId, payload.tabId);
}

function handleSplitRight(payload: { paneGroupId: string; tabId?: string }) {
	splitPanes.splitRight(payload.paneGroupId, payload.tabId);
}

function handleResizeSplit(payload: { splitContainerId: string; sizes: [number, number] }) {
	splitPanes.resizeSplit(payload.splitContainerId, payload.sizes);
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

// 新建笔记（在当前选中目录下创建 md 文件）
async function handleCreateNote() {
	try {
		const dir = workspaceDir.value;
		if (!dir) return;
		const parentDir = selectedDirPath.value || dir;
		const existingNames = visibleNodes.value
			.filter(n => {
				const parent = n.entry.path.substring(0, n.entry.path.lastIndexOf('/'));
				return parent === parentDir;
			})
			.map(n => n.entry.name);
		const name = getNextName(existingNames, '未命名', '.md');
		await createFileEntry({
			root: dir,
			directory: parentDir,
			name,
			kind: 'file',
		});
		refreshTree();
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
		handleSelectFile(createFileTreeEntryFromPath(response.path));
	} catch (err) {
		console.error("Failed to create journal", err);
	}
};

// 新建文件夹（递增名称）
async function handleCreateFolder() {
	try {
		const dir = workspaceDir.value;
		if (!dir) return;
		const parentDir = selectedDirPath.value || dir;
		const existingNames = visibleNodes.value
			.filter(n => {
				const parent = n.entry.path.substring(0, n.entry.path.lastIndexOf('/'));
				return parent === parentDir;
			})
			.map(n => n.entry.name);
		const name = getNextName(existingNames, '未命名文件夹');
		const result = await createFileEntry({
			root: dir,
			directory: parentDir,
			name,
			kind: 'directory',
		});
		selectedDirPath.value = result.entry.path;
		await toggleDirectory(result.entry);
		refreshTree();
	} catch (err) {
		console.error("Failed to create folder", err);
	}
};

// 新建 Canvas（递增名称）
async function handleCreateCanvas() {
	try {
		const dir = workspaceDir.value;
		if (!dir) return;
		const parentDir = selectedDirPath.value || dir;
		const existingNames = visibleNodes.value
			.filter(n => {
				const parent = n.entry.path.substring(0, n.entry.path.lastIndexOf('/'));
				return parent === parentDir;
			})
			.map(n => n.entry.name);
		const name = getNextName(existingNames, '未命名', '.canvas');
		const parentRelDir = parentDir.replace(dir, '').replace(/^\//, '');
		const response = await createFile(`${parentRelDir ? parentRelDir + '/' : ''}${name}`, '{}');
		refreshTree();
		handleSelectFile(createFileTreeEntryFromPath(response.path));
	} catch (err) {
		console.error("Failed to create canvas", err);
	}
};

// 新建 Base（递增名称）
async function handleCreateBase() {
	try {
		const dir = workspaceDir.value;
		if (!dir) return;
		const parentDir = selectedDirPath.value || dir;
		const existingNames = visibleNodes.value
			.filter(n => {
				const parent = n.entry.path.substring(0, n.entry.path.lastIndexOf('/'));
				return parent === parentDir;
			})
			.map(n => n.entry.name);
		const name = getNextName(existingNames, '新数据库', '.base');
		const parentRelDir = parentDir.replace(dir, '').replace(/^\//, '');
		const result = await createBase(name.replace(/\.base$/, ''), parentRelDir || undefined);
		refreshTree();
		const fullPath = `${workspaceDir.value}/${result.path}`;
		handleSelectFile(createFileTreeEntryFromPath(fullPath));
	} catch (err) {
		console.error("Failed to create base", err);
	}
};

// ===== 首页 → 会话转换 =====

/** 首页提交首条消息后，原地将 home tab 替换为 chat tab，并自动发送首条消息 */
async function handleHomeSubmit(homeTabId: string, payload: { text: string; model: string; agent: string; thinkingLevel: string }) {
	const dir = workspaceDir.value;
	if (!dir) return;

	const agentValue = payload.agent === NO_AGENT_VALUE ? null : payload.agent;

	// 创建服务端会话（带模型/Agent/思考级别）
	const snapshot = await createSessionApi({
		cwd: dir,
		title: payload.text.slice(0, 24),
		model: payload.model || undefined,
		agent: agentValue,
		thinkingLevel: (payload.thinkingLevel || undefined) as ThinkingLevel | null | undefined,
	});
	const sessionId = snapshot.id;

	// 原地替换 tab: home → chat，携带首条消息
	const chatTab = createChatTab(sessionId, payload.text.slice(0, 24) || "新会话", {
		initialPrompt: payload.text,
		initialModel: payload.model,
		initialAgent: payload.agent,
	});
	splitPanes.replaceTab(homeTabId, chatTab);
}

/** 首页点击打开会话（最近活动里点击会话条目） */
function handleOpenSession(sessionId: string) {
	const existing = splitPanes.allPaneGroups.value
		.flatMap((pane) => pane.tabs.map((tab) => ({ pane, tab })))
		.find(({ tab }) => tab.kind === "chat" && tab.sessionId === sessionId);
	if (existing) {
		splitPanes.setActiveTab(existing.pane.id, existing.tab.id);
		return;
	}

	// 查找该会话标题
	const sessionSummary = core.sessions.value.find((s) => s.id === sessionId);
	const title = sessionSummary?.title || "新会话";
	const chatTab = createChatTab(sessionId, title);
	splitPanes.openTab(splitPanes.activePaneGroupId.value, chatTab);
}

/** 首页点击打开待办视图 */
function handleOpenTasks() {
	handleSelectView("tasks");
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
  <div class="flex h-screen min-h-0 flex-col bg-background text-foreground">
    <WorkspaceTopMenu
      @open-terminal="handleOpenTerminal"
      @open-automation="handleOpenAutomation"
      @open-settings="handleOpenSettings"
    />

    <div class="flex min-h-0 flex-1">
    <!-- 左侧面板 -->
    <aside class="flex w-[260px] shrink-0 flex-col border-r border-border/50 bg-background">
      <!-- 固定视图入口 -->
      <div class="shrink-0 space-y-0.5 px-2 pt-3 pb-2">
        <!-- 主页入口 -->
        <button
          type="button"
          class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
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
          class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
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
		  <div class="flex items-center justify-between gap-2">
			<Tooltip>
            <TooltipTrigger as-child>
              <button
                type="button"
                class="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                @click="handleCreateNote()"
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
          <div v-show="activeTabId === 'tasks'" class="h-full">
            <TaskView
              :workspace-dir="workspaceDir"
              @open-file="handleSelectFile(createFileTreeEntryFromPath($event))"
            />
          </div>

          <div v-show="activeTabId === 'calendar'" class="h-full">
            <CalendarView
              :workspace-dir="workspaceDir"
              @open-file="handleSelectFile(createFileTreeEntryFromPath($event))"
              @create-journal="handleCreateJournal($event)"
            />
          </div>

		  <div v-show="activeTabId === 'inbox'" class="h-full">
			<InboxView
			  :workspace-dir="workspaceDir"
			  @open-file="handleSelectFile(createFileTreeEntryFromPath($event))"
			  @refresh-tree="refreshTree"
			/>
		  </div>

		  <div v-show="activeTabId === 'clips'" class="h-full">
			<ClipsView />
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
            <HomePage
              v-if="tab.kind === 'home'"
              :workspace-dir="workspaceDir"
              :recent-files="recentFiles"
              :recent-activity="recentActivity"
              :is-recent-loading="isRecentLoading"
              :models="core.models?.value ?? []"
              :agents="core.agents?.value ?? []"
              :default-model="settingsStore.defaultModel || core.defaultModel?.value || ''"
              :default-agent="settingsStore.defaultAgent"
              :default-thinking-level="settingsStore.defaultThinkingLevel"
              @submit="handleHomeSubmit(tab.id, $event)"
              @open-file="handleSelectFile(createFileTreeEntryFromPath($event))"
              @open-session="handleOpenSession($event)"
              @open-tasks="handleOpenTasks"
            />
          </div>

          <!-- 会话标签页 -->
          <div
            v-for="tab in tabs"
            :key="tab.id"
            v-show="activeTabId === tab.id && tab.kind === 'chat'"
            class="h-full"
          >
            <WorkspaceChatTab
              v-if="tab.kind === 'chat'"
              :session-id="tab.sessionId ?? ''"
              :workspace-dir="workspaceDir"
              :initial-prompt="tab.initialPrompt"
              :initial-model="tab.initialModel"
              :initial-agent="tab.initialAgent"
            />
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

          <div
            v-for="tab in tabs"
            :key="tab.id"
            v-show="activeTabId === tab.id && tab.kind === 'terminal'"
            class="h-full"
          >
            <TerminalTabContent
              v-if="tab.kind === 'terminal' && tab.terminalId"
              :terminal-id="tab.terminalId"
            />
          </div>

          <div v-show="activeTabId === 'automation'" class="h-full">
            <AutomationTabContent />
          </div>

          <div v-show="activeTabId === 'settings'" class="h-full">
            <SettingsTabContent />
          </div>
        </template>
      </SplitGrid>
    </main>
    </div>
  </div>
</template>
