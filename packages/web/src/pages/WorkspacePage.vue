<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from "vue";
import {
	BookOpen,
	Bell,
	Bot,
	Files,
	Inbox,
	ListTodo,
	MonitorPlay,
	Search,
	Settings2,
	TerminalSquare,
} from "lucide-vue-next";

import WorkspaceSidebar from "@/components/workspace/WorkspaceSidebar.vue";
import ErrorBoundary from "@/components/common/ErrorBoundary.vue";
import WorkspaceContentArea from "@/components/workspace/WorkspaceContentArea.vue";
import HomePage from "@/components/workspace/HomePage.vue";
import TaskView from "@/components/workspace/TaskView.vue";
import InboxView from "@/components/workspace/InboxView.vue";
import WorkspaceChatTab from "@/components/workspace/WorkspaceChatTab.vue";
import TerminalTabContent from "@/components/workspace/TerminalTabContent.vue";
import AutomationTabContent from "@/components/workspace/AutomationTabContent.vue";
import SettingsTabContent from "@/components/workspace/SettingsTabContent.vue";
import SpacePreviewTab from "@/components/workspace/SpacePreviewTab.vue";
import SpaceView from "@/components/workspace/SpaceView.vue";
import WorkspaceSearchView from "@/components/workspace/WorkspaceSearchView.vue";
import NotificationCenterView from "@/components/workspace/NotificationCenterView.vue";
import WorkspaceFeaturePlaceholder from "@/components/workspace/WorkspaceFeaturePlaceholder.vue";
import SplitGrid from "@/components/workspace/split/SplitGrid.vue";
import { useFileTreeData } from "@/composables/useFileTreeData";
import { useFileTreeActions } from "@/composables/useFileTreeActions";
import { useWorkspaceFilePreview } from "@/composables/useWorkspaceFilePreview";
import {
	useSplitPanes,
	createHomeTab,
	createChatTab,
	createTerminalTab,
	createSingletonFeatureTab,
	createSpacePreviewTab,
} from "@/composables/useSplitPanes";
import type { SplitTabItem } from "@/composables/useSplitPanes";
import type { DropZone } from "@/composables/useSplitDrag";
import { NO_AGENT_VALUE } from "@/composables/useWorkbenchSessionState";
import { provideWorkspaceTasks } from "@/composables/useWorkspaceTasks";
import { provideWorkspaceInbox } from "@/composables/useInbox";
import { usePiChatCore } from "@/composables/usePiChatCore";
import type { FixedEntry } from "@/components/workspace/WorkspaceSidebar.vue";
import { useTerminalContextOptions } from "@/composables/useTerminalContextOptions";
import { useTerminalPool } from "@/composables/useTerminalPool";
import { useDashboard } from "@/composables/useDashboard";
import { useRecentActivity } from "@/composables/useRecentActivity";
import { useNotifications } from "@/composables/useNotifications";
import { useFavoritesStore } from "@/stores/favorites";
import { useSettingsStore } from "@/stores/settings";
import { useProjects } from "@/composables/useProjects";
import {
	buildSidebarProjects,
	isProjectOffline,
	isProjectArchived,
} from "@/lib/session-sidebar";
import type { SessionProjectView } from "@/lib/session-sidebar";
import { createFile, createBase, createFileEntry, getRecentFiles, type RecentFileItem, uploadSessionAttachments, deleteSession, endSession } from "@/lib/api";
import { createSession as createSessionApi } from "@/lib/api";
import type { FileTreeEntry, ThinkingLevel } from "@/lib/types";
import { toast } from "vue-sonner";
import FilesView from "@/components/workspace/FilesView.vue";
import { useWorkspaceFiles } from "@/composables/useWorkspaceFiles";
import { useWorkspaceSpace } from "@/composables/useWorkspaceSpace";
import type { SpaceWorkItem } from "@/lib/types";

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

// 工作空间文件页
const workspaceFiles = useWorkspaceFiles();

// 文件预览
const previewRootDir = computed(() => workspaceDir.value || workspaceFiles.workspaceRoot.value || rootPath.value);
const preview = useWorkspaceFilePreview(previewRootDir);

// 空间 HTML 作品
const workspaceSpace = useWorkspaceSpace();
const notificationsStore = useNotifications(() => workspaceDir.value);

// 分屏管理
const splitPanes = useSplitPanes();

const endingSessionIds = new Set<string>();

const isConversationTab = (tab: SplitTabItem | undefined): tab is SplitTabItem & { sessionId: string } =>
	(tab?.kind === "conversation" || tab?.kind === "chat" || tab?.kind === "session") &&
	typeof tab.sessionId === "string" &&
	tab.sessionId.length > 0;

const collectOpenSessionIds = () => {
	const sessionIds = new Set<string>();
	for (const pane of splitPanes.allPaneGroups.value) {
		for (const tab of pane.tabs) {
			if (isConversationTab(tab)) {
				sessionIds.add(tab.sessionId);
			}
		}
	}
	return [...sessionIds];
};

const endSessionOnce = async (sessionId: string) => {
	if (endingSessionIds.has(sessionId)) return;
	endingSessionIds.add(sessionId);
	try {
		await endSession(sessionId);
	} catch (error) {
		endingSessionIds.delete(sessionId);
		throw error;
	}
};

const endOpenConversationTabs = async () => {
	await Promise.allSettled(collectOpenSessionIds().map((sessionId) => endSessionOnce(sessionId)));
};

const handlePageHide = () => {
	for (const sessionId of collectOpenSessionIds()) {
		if (endingSessionIds.has(sessionId)) continue;
		endingSessionIds.add(sessionId);
		const endpoint = `/api/sessions/${encodeURIComponent(sessionId)}/end`;
		if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon(endpoint, "")) {
			continue;
		}
		void endSession(sessionId).catch(() => {
			endingSessionIds.delete(sessionId);
		});
	}
};

onMounted(() => {
	window.addEventListener("pagehide", handlePageHide);
});

onBeforeUnmount(() => {
	window.removeEventListener("pagehide", handlePageHide);
	void endOpenConversationTabs();
});

// 主页发送中状态（按 tabId）
const homeSubmittingTabIds = ref<Set<string>>(new Set());

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

const singletonFeatureEntries = [
	{ id: "moments", label: "闪念", icon: Inbox },
	{ id: "search", label: "搜索", icon: Search },
	{ id: "notifications", label: "通知", icon: Bell },
	{ id: "tasks", label: "任务", icon: ListTodo },
	{ id: "files", label: "文件", icon: Files },
	{ id: "space", label: "空间", icon: MonitorPlay },
	{ id: "automation", label: "自动化", icon: Bot },
	{ id: "skills", label: "Skill", icon: BookOpen },
	{ id: "settings", label: "设置", icon: Settings2 },
] as const;

type SingletonFeatureId = (typeof singletonFeatureEntries)[number]["id"];

const fixedEntries = [
	...singletonFeatureEntries
		.filter((e) => ["moments", "search", "notifications", "tasks", "files", "space"].includes(e.id))
		.map((entry) => ({ ...entry, type: "singleton" as const })),
	{ id: "terminal", label: "终端", icon: TerminalSquare, type: "terminal" as const },
	...singletonFeatureEntries
		.filter((e) => ["automation", "settings"].includes(e.id))
		.map((entry) => ({ ...entry, type: "singleton" as const })),
] as const;

const featureLabelMap: Record<SingletonFeatureId, string> = Object.fromEntries(
	singletonFeatureEntries.map((entry) => [entry.id, entry.label]),
) as Record<SingletonFeatureId, string>;

const sortedWorkspaceSessions = computed(() => {
	const storedProjectIds = new Set(projectsStore.projects.value.map((p) => p.id));
	return [...core.sessions.value]
		.filter((session) => {
			if (session.archived) return false;
			const ctx = core.sessionContexts.value[session.contextId ?? ""];
			const projectId = session.projectId || ctx?.projectId;
			if (!projectId) return true;
			return !storedProjectIds.has(projectId);
		})
		.sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
});

// ===== 项目列表 =====
const projectsStore = useProjects();

onMounted(() => {
	void projectsStore.load();
});

const sidebarProjects = computed(() =>
	buildSidebarProjects({
		sessions: core.sessions.value,
		sessionContexts: core.sessionContexts.value,
		storedProjects: projectsStore.projects.value,
		workspaceDir: workspaceDir.value,
		workspaceChat: {
			id: core.info.value?.chatProjectId ?? "ridge:workspace-chat",
			path: core.info.value?.chatProjectPath ?? workspaceDir.value,
			label: core.info.value?.chatProjectLabel ?? "聊天",
		},
	}).projects,
);

const expandedProjectIds = ref<Set<string>>(new Set());
const showAllProjectSessionIds = ref<Set<string>>(new Set());

function toggleProjectExpand(projectId: string) {
	const next = new Set(expandedProjectIds.value);
	if (next.has(projectId)) {
		next.delete(projectId);
		// 收起时同时重置 showAll
		const nextAll = new Set(showAllProjectSessionIds.value);
		nextAll.delete(projectId);
		showAllProjectSessionIds.value = nextAll;
	} else {
		next.add(projectId);
	}
	expandedProjectIds.value = next;
}

function toggleShowAllSessions(projectId: string) {
	const next = new Set(showAllProjectSessionIds.value);
	if (next.has(projectId)) {
		next.delete(projectId);
	} else {
		next.add(projectId);
	}
	showAllProjectSessionIds.value = next;
}

function handleOpenProjectSession(sessionId: string) {
	const existing = splitPanes.allPaneGroups.value
		.flatMap((pane) => pane.tabs.map((tab) => ({ pane, tab })))
		.find(({ tab }) => (tab.kind === "conversation" || tab.kind === "chat") && tab.sessionId === sessionId);
	if (existing) {
		splitPanes.setActiveTab(existing.pane.id, existing.tab.id);
		return;
	}

	const sessionSummary = core.sessions.value.find((s) => s.id === sessionId);
	const title = sessionSummary?.title || "新会话";
	const chatTab = createChatTab(sessionId, title);
	splitPanes.openTab(splitPanes.activePaneGroupId.value, chatTab);
}

/** 打开项目的新主页标签（cwd 设为项目路径） */
function handleOpenProjectHome(project: SessionProjectView) {
	if (isProjectOffline(project) || isProjectArchived(project)) {
		return;
	}
	const cwd = project.projectType === 'internal'
		? (workspaceDir.value || project.projectRoot)
		: project.projectRoot;
	const tab = createHomeTab({ cwd, contextLabel: project.label });
	splitPanes.openTab(splitPanes.activePaneGroupId.value, tab);
}

function handleOpenProjectFromSearch(projectId: string) {
	const project = sidebarProjects.value.find((item) => item.id === projectId);
	if (!project) return;
	handleOpenProjectHome(project);
}

/** 归档入口 */
function handleOpenArchived() {
	splitPanes.openTab(
		splitPanes.activePaneGroupId.value,
		createSingletonFeatureTab("archived", "归档"),
	);
}

// 收件箱数量
const inboxCount = inboxStore.count;
const notificationCount = notificationsStore.unhandledCount;

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

/** 标签栏 + 按钮点击：创建新主页 */
function handleNewTab(payload: { paneGroupId: string }) {
	splitPanes.openTab(payload.paneGroupId, createHomeTab());
}

/** 打开单例功能标签页到当前活跃面板 */
function handleOpenSingletonFeature(featureId: string) {
	splitPanes.openTab(
		splitPanes.activePaneGroupId.value,
		createSingletonFeatureTab(featureId as SingletonFeatureId, featureLabelMap[featureId as SingletonFeatureId]),
	);
}

function handleFixedEntry(entry: FixedEntry) {
	if (entry.type === "terminal") {
		void handleOpenTerminal();
		return;
	}
	if (entry.id === "files") {
		handleOpenFiles();
		return;
	}
	if (entry.id === "space") {
		void handleOpenSpace();
		return;
	}
	handleOpenSingletonFeature(entry.id);
}

async function handleOpenFiles() {
	await workspaceFiles.load(workspaceDir.value);
	handleOpenSingletonFeature("files");
}

function handleOpenSpace() {
	handleOpenSingletonFeature("space");
	void workspaceSpace.load();
}

async function handleOpenSpacePreview(work: SpaceWorkItem) {
	try {
		const previewPayload = await workspaceSpace.openPreview(work.id);
		splitPanes.openTab(
			splitPanes.activePaneGroupId.value,
			createSpacePreviewTab(previewPayload.indexPath, previewPayload.name, {
				spaceWorkId: previewPayload.id,
				html: previewPayload.html,
			}),
		);
	} catch (error) {
		toast.error("空间预览打开失败", {
			description: error instanceof Error ? error.message : "无法读取空间作品 HTML。",
		});
	}
}

async function handleOpenSpacePreviewById(workId: string) {
	try {
		const previewPayload = await workspaceSpace.openPreview(workId);
		splitPanes.openTab(
			splitPanes.activePaneGroupId.value,
			createSpacePreviewTab(previewPayload.indexPath, previewPayload.name, {
				spaceWorkId: previewPayload.id,
				html: previewPayload.html,
			}),
		);
	} catch (error) {
		toast.error("空间预览打开失败", {
			description: error instanceof Error ? error.message : "无法读取空间作品 HTML。",
		});
	}
}

/** 打开文件标签页到当前活跃面板 */
async function handleSelectFile(entry: FileTreeEntry) {
	if (entry.kind === "directory") {
		selectedDirPath.value = entry.path;
		toggleDirectory(entry);
		return;
	}
	// 选中文件时，将父目录设为新建操作的默认位置
	selectedDirPath.value = entry.path.substring(0, entry.path.lastIndexOf('/'));

	// 先加载文件预览
	await preview.openFile(entry.path);

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

// ===== SplitGrid 事件处理 =====

function handleSetActiveTab(payload: { paneGroupId: string; tabId: string }) {
	splitPanes.setActiveTab(payload.paneGroupId, payload.tabId);
}

async function handleCloseTab(payload: { paneGroupId: string; tabId: string }) {
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
	if (isConversationTab(tab)) {
		try {
			await endSessionOnce(tab.sessionId);
		} catch (err) {
			toast.error("会话结束整理失败", {
				description: err instanceof Error ? err.message : String(err),
			});
			return;
		}
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
async function handleHomeSubmit(homeTabId: string, payload: { text: string; model: string; agent: string; thinkingLevel: string; attachments?: File[] }) {
	// 查找对应 home tab，以获取其 cwd（项目主页时 cwd 为项目路径）
	let cwd = workspaceDir.value;
	for (const pane of splitPanes.allPaneGroups.value) {
		const tab = pane.tabs.find((t) => t.id === homeTabId && t.kind === "home");
		if (tab?.cwd) {
			cwd = tab.cwd;
			break;
		}
	}
	if (!cwd) return;

	const agentValue = payload.agent === NO_AGENT_VALUE ? null : payload.agent;

	homeSubmittingTabIds.value = new Set(homeSubmittingTabIds.value).add(homeTabId);
	try {
		// 创建服务端会话（带模型/Agent/思考级别）
		const snapshot = await createSessionApi({
			cwd,
			title: payload.text.slice(0, 24),
			model: payload.model || undefined,
			agent: agentValue,
			thinkingLevel: (payload.thinkingLevel || undefined) as ThinkingLevel | null | undefined,
		});
		const sessionId = snapshot.id;

		// 上传附件（如有）
		let attachmentIds: string[] | undefined;
		if (payload.attachments && payload.attachments.length > 0) {
			try {
				const uploadRes = await uploadSessionAttachments(sessionId, payload.attachments);
				attachmentIds = uploadRes.attachments.map((a) => a.id);
			} catch (uploadErr) {
				toast.error("附件上传失败", {
					description: uploadErr instanceof Error ? uploadErr.message : String(uploadErr),
				});
				// 清理刚创建的会话，避免孤儿会话
				try {
					await deleteSession(sessionId);
				} catch (cleanupErr) {
					// 忽略清理失败，但记录日志以便排查
					console.warn("清理上传失败会话时出错:", cleanupErr);
				}
				return;
			}
		}

		// 原地替换 tab: home → chat，携带首条消息与附件
		const chatTab = createChatTab(sessionId, payload.text.slice(0, 24) || "新会话", {
			initialPrompt: payload.text,
			initialModel: payload.model,
			initialAgent: payload.agent,
			initialThinkingLevel: payload.thinkingLevel,
			initialAttachmentIds: attachmentIds,
		});
		splitPanes.replaceTab(homeTabId, chatTab);

		// 立即刷新左侧会话列表，使新会话出现并保持当前标签选中
		await Promise.all([
			core.refreshSessions(),
			core.refreshSessionContexts(),
		]);
	} catch (err) {
		toast.error("创建会话失败", {
			description: err instanceof Error ? err.message : String(err),
		});
		// 失败时：不替换 home tab，保留输入（HomePage 内部不清空 draft），发送按钮恢复可用
	} finally {
		const next = new Set(homeSubmittingTabIds.value);
		next.delete(homeTabId);
		homeSubmittingTabIds.value = next;
	}
}

/** 首页点击打开会话（最近活动里点击会话条目） */
function handleOpenSession(sessionId: string) {
	const existing = splitPanes.allPaneGroups.value
		.flatMap((pane) => pane.tabs.map((tab) => ({ pane, tab })))
		.find(({ tab }) => (tab.kind === "conversation" || tab.kind === "chat") && tab.sessionId === sessionId);
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
	handleOpenSingletonFeature("tasks");
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
    <div class="flex min-h-0 flex-1">
    <!-- 左侧面板 -->
    <WorkspaceSidebar
      :fixed-entries="fixedEntries"
      :sidebar-projects="sidebarProjects"
      :sorted-workspace-sessions="sortedWorkspaceSessions"
      :inbox-count="inboxCount"
      :notification-count="notificationCount"
      :expanded-project-ids="expandedProjectIds"
      :show-all-project-session-ids="showAllProjectSessionIds"
      :visible-nodes="visibleNodes"
      :root-path="rootPath"
      :file-tree-error="fileTreeError"
      :is-directory-expanded="isDirectoryExpanded"
      :is-directory-loading="isDirectoryLoading"
      :recent-files="recentFiles"
      :is-recent-loading="isRecentLoading"
      @fixed-entry-click="handleFixedEntry($event)"
      @toggle-project-expand="toggleProjectExpand($event)"
      @open-project-home="handleOpenProjectHome($event)"
      @open-project-session="handleOpenProjectSession($event)"
      @toggle-show-all-sessions="toggleShowAllSessions($event)"
      @open-session="handleOpenSession($event)"
      @create-note="handleCreateNote()"
      @create-folder="handleCreateFolder()"
      @create-canvas="handleCreateCanvas()"
      @create-base="handleCreateBase()"
      @open-archived="handleOpenArchived()"
      @select-file="handleSelectFile($event)"
      @toggle-expand="handleToggleExpand($event)"
      @toggle-favorite="handleToggleFavorite($event)"
      @refresh-tree="refreshTree()"
      @rename="handleRename($event)"
      @delete="handleDelete($event)"
      @create-folder-in-tree="handleCreateFolderInTree($event)"
    />

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
          <!-- 单例功能标签页 -->
		  <div
		    v-for="tab in tabs"
		    :key="tab.id"
		    v-show="activeTabId === tab.id && tab.kind === 'singleton_feature'"
		    class="h-full"
		  >
			<ErrorBoundary :scope="tab.title">
			<TaskView
				v-if="tab.featureId === 'tasks'"
				:workspace-dir="workspaceDir"
				@open-file="handleSelectFile(createFileTreeEntryFromPath($event))"
				@open-session="handleOpenSession($event)"
				@notifications-updated="notificationsStore.load()"
			/>
			<InboxView
			  v-else-if="tab.featureId === 'moments'"
			  :workspace-dir="workspaceDir"
			  @open-file="handleSelectFile(createFileTreeEntryFromPath($event))"
			  @refresh-tree="refreshTree"
			/>
			<FilesView
			  v-else-if="tab.featureId === 'files'"
			  :workspace-root="workspaceFiles.workspaceRoot.value"
			  :entries="workspaceFiles.entries.value"
			  :current-path="workspaceFiles.currentPath.value"
			  :loading="workspaceFiles.loading.value"
			  :error="workspaceFiles.error.value"
			  @open-file="handleSelectFile(createFileTreeEntryFromPath($event))"
			  @navigate="workspaceFiles.navigate"
			  @navigate-back="workspaceFiles.navigateBack"
			  @retry="workspaceFiles.retry($event)"
			  @convert="(path: string, force: boolean) => workspaceFiles.convert(path, force)"
			  @upload="workspaceFiles.upload($event)"
			  @create-folder="workspaceFiles.createFolder($event)"
			  @rename="(path: string, name: string) => workspaceFiles.rename(path, name)"
			  @move="(path: string, targetDirectory: string) => workspaceFiles.move(path, targetDirectory)"
			  @delete="workspaceFiles.remove($event)"
			/>
			<WorkspaceSearchView
			  v-else-if="tab.featureId === 'search'"
			  :workspace-dir="workspaceDir"
			  @open-file="handleSelectFile(createFileTreeEntryFromPath($event))"
			  @open-session="handleOpenSession($event)"
			  @open-tasks="handleOpenTasks"
			  @open-project="handleOpenProjectFromSearch"
			  @open-space-work="handleOpenSpacePreviewById"
			/>
			<NotificationCenterView
			  v-else-if="tab.featureId === 'notifications'"
			  :workspace-dir="workspaceDir"
			  @open-file="handleSelectFile(createFileTreeEntryFromPath($event))"
			  @open-session="handleOpenSession($event)"
			  @open-project="handleOpenProjectFromSearch"
			  @open-automation="handleOpenSingletonFeature('automation')"
			  @open-tasks="handleOpenTasks"
			  @notifications-updated="notificationsStore.load()"
			/>
			<SpaceView
			  v-else-if="tab.featureId === 'space'"
			  :works="workspaceSpace.works.value"
			  :loading="workspaceSpace.loading.value"
			  :error="workspaceSpace.error.value"
			  @refresh="workspaceSpace.load"
			  @open-preview="handleOpenSpacePreview"
			/>
			<AutomationTabContent v-else-if="tab.featureId === 'automation'" />
			<SettingsTabContent v-else-if="tab.featureId === 'settings'" />
			<WorkspaceFeaturePlaceholder v-else :title="tab.title" />
			</ErrorBoundary>
          </div>

          <!-- 主页标签页 -->
          <div
            v-for="tab in tabs"
            :key="tab.id"
            v-show="activeTabId === tab.id && tab.kind === 'home'"
            class="h-full"
          >
			<ErrorBoundary :scope="tab.title">
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
              :is-sending="homeSubmittingTabIds.has(tab.id)"
              @submit="handleHomeSubmit(tab.id, $event)"
              @open-file="handleSelectFile(createFileTreeEntryFromPath($event))"
              @open-session="handleOpenSession($event)"
              @open-tasks="handleOpenTasks"
            />
			</ErrorBoundary>
          </div>

          <!-- 会话标签页 -->
          <div
            v-for="tab in tabs"
            :key="tab.id"
            v-show="activeTabId === tab.id && (tab.kind === 'conversation' || tab.kind === 'chat')"
            class="h-full"
          >
			<ErrorBoundary :scope="tab.title">
            <WorkspaceChatTab
              v-if="tab.kind === 'conversation' || tab.kind === 'chat'"
              :session-id="tab.sessionId ?? ''"
              :workspace-dir="workspaceDir"
              :initial-prompt="tab.initialPrompt"
              :initial-model="tab.initialModel"
              :initial-agent="tab.initialAgent"
              :initial-thinking-level="tab.initialThinkingLevel"
              :initial-attachment-ids="tab.initialAttachmentIds"
              @open-chat-tab="handleOpenSession($event)"
            />
			</ErrorBoundary>
          </div>

          <!-- 文件标签页 -->
          <div
            v-for="tab in tabs"
            :key="tab.id"
            v-show="activeTabId === tab.id && tab.kind === 'file'"
            class="h-full"
          >
			<ErrorBoundary :scope="tab.title">
            <WorkspaceContentArea
              v-if="tab.kind === 'file'"
              :tab="preview.tabs.value.find((t) => t.id === tab.id) ?? null"
              :root-dir="workspaceDir"
              @open-with-default-app="handleOpenWithDefaultApp"
              @load-more="preview.loadMore"
              @save-status="handleSaveStatusUpdate"
            />
			</ErrorBoundary>
          </div>

          <div
            v-for="tab in tabs"
            :key="tab.id"
            v-show="activeTabId === tab.id && tab.kind === 'terminal'"
            class="h-full"
          >
			<ErrorBoundary :scope="tab.title">
            <TerminalTabContent
              v-if="tab.kind === 'terminal' && tab.terminalId"
              :terminal-id="tab.terminalId"
            />
			</ErrorBoundary>
          </div>

          <div
            v-for="tab in tabs"
            :key="tab.id"
            v-show="activeTabId === tab.id && tab.kind === 'space_preview'"
            class="h-full"
          >
			<ErrorBoundary :scope="tab.title">
            <SpacePreviewTab
              v-if="tab.kind === 'space_preview'"
              :title="tab.title"
              :html="tab.spacePreviewHtml ?? ''"
              :index-path="tab.filePath"
            />
			</ErrorBoundary>
          </div>
        </template>
      </SplitGrid>
    </main>
    </div>
  </div>
</template>
