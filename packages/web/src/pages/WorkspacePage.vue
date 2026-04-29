<script setup lang="ts">
import { computed, ref } from "vue";
import {
	BookOpen,
	Calendar,
	Inbox,
	LayoutDashboard,
	Plus,
	Search,
} from "lucide-vue-next";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import FileTreePanel from "@/components/common/FileTreePanel.vue";
import TabBar from "@/components/common/TabBar.vue";
import type { TabItem } from "@/components/common/TabBar.vue";
import WorkspaceContentArea from "@/components/workspace/WorkspaceContentArea.vue";
import DashboardView from "@/components/workspace/DashboardView.vue";
import TaskView from "@/components/workspace/TaskView.vue";
import CalendarView from "@/components/workspace/CalendarView.vue";
import InboxView from "@/components/workspace/InboxView.vue";
import { useFileTreeData } from "@/composables/useFileTreeData";
import { useWorkspaceFilePreview } from "@/composables/useWorkspaceFilePreview";
import { provideWorkspaceTasks } from "@/composables/useWorkspaceTasks";
import { provideWorkspaceInbox, useWorkspaceInbox } from "@/composables/useInbox";
import { usePiChatCore } from "@/composables/usePiChatCore";
import { useFavoritesStore } from "@/stores/favorites";
import { createNote, createNoteFolder, createBase } from "@/lib/api";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import type { FileTreeEntry } from "@/lib/types";

const core = usePiChatCore();
const favoritesStore = useFavoritesStore();

const workspaceDir = computed(() => core.info.value?.workspaceDir ?? "");

// 共享任务 store（provide/inject 避免重复请求）
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

const searchQuery = ref("");

// 固定视图入口
const fixedViews = [
	{ id: "dashboard", label: "仪表盘", icon: LayoutDashboard },
	{ id: "tasks", label: "待办", icon: BookOpen },
	{ id: "calendar", label: "日历", icon: Calendar },
	{ id: "inbox", label: "收件箱", icon: Inbox },
] as const;

// 收件箱数量（用于 sidebar badge）
const inboxStore = useWorkspaceInbox(() => workspaceDir.value);
const inboxCount = inboxStore.count;

// 视图标签页（固定，始终存在）
type ViewTab = { id: string; title: string };

const viewTabs = ref<ViewTab[]>([{ id: "dashboard", title: "仪表盘" }]);

// .md 文件编辑器保存状态
const saveStatusMap = ref<Record<string, string>>({});

const handleSaveStatusUpdate = (tabId: string, status: string) => {
	saveStatusMap.value = { ...saveStatusMap.value, [tabId]: status };
};

// 合并标签页列表（视图标签 + 文件标签）
const tabBarItems = computed<TabItem[]>(() => {
	const viewItems: TabItem[] = viewTabs.value.map((v) => ({
		id: v.id,
		title: v.title,
		status: "idle" as const,
	}));
	const fileItems: TabItem[] = preview.tabs.value.map((t) => {
		const editorStatus = saveStatusMap.value[t.id];
		const baseStatus: string = t.isLoading
			? "loading"
			: t.error
				? "error"
				: editorStatus ?? "idle";
		return {
			id: t.id,
		title: t.title,
		status: baseStatus as TabItem["status"],
		};
	});
	return [...viewItems, ...fileItems];
});

// 当前活跃标签页 ID（视图 or 文件）
const activeId = ref("dashboard");

const isViewTab = (id: string) => viewTabs.value.some((v) => v.id === id);

const handleSelectView = (viewId: string) => {
	const existing = viewTabs.value.find((v) => v.id === viewId);
	if (!existing) {
		const view = fixedViews.find((v) => v.id === viewId);
		viewTabs.value.push({
			id: viewId,
			title: view?.label ?? viewId,
		});
	}
	activeId.value = viewId;
};

const handleSelectFile = (entry: FileTreeEntry) => {
	if (entry.kind === "directory") {
		toggleDirectory(entry);
		return;
	}
	preview.openFile(entry.path);
	// openFile 会把 activeTabId 设为文件路径，同步到 activeId
	activeId.value = entry.path;
};

const handleToggleExpand = (entry: FileTreeEntry) => {
	toggleDirectory(entry);
};

const handleToggleFavorite = async (path: string) => {
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
};

const handleTabSelect = (id: string) => {
	activeId.value = id;
};

const handleTabClose = (id: string) => {
	if (id === "dashboard") return;

	if (isViewTab(id)) {
		const index = viewTabs.value.findIndex((v) => v.id === id);
		if (index >= 0) viewTabs.value.splice(index, 1);
	} else {
		preview.closeTab(id);
	}

	if (activeId.value === id) {
		const last =
			viewTabs.value[viewTabs.value.length - 1] ??
			preview.tabs.value[preview.tabs.value.length - 1];
		activeId.value = last?.id ?? "dashboard";
	}
};

const handleOpenWithDefaultApp = (path: string) => {
	preview.openWithDefaultApp(path);
};

// 新建笔记
const handleCreateNote = async (subdir: string) => {
	try {
		const dir = workspaceDir.value;
		if (!dir) return;
		const relPath = subdir ? `${subdir}/未命名.md` : "未命名.md";
		const response = await createNote({ path: relPath });
		refreshTree();
		preview.openFile(response.path);
		activeId.value = response.path;
	} catch (err) {
		console.error("Failed to create note", err);
	}
};

// 新建今日日记
const handleCreateJournal = async (dateOverride?: string) => {
	const now = new Date();
	const year = dateOverride ? Number(dateOverride.slice(0, 4)) : now.getFullYear();
	const month = dateOverride ? dateOverride.slice(5, 7) : String(now.getMonth() + 1).padStart(2, "0");
	const dateStr = dateOverride || `${year}-${month}-${String(now.getDate()).padStart(2, "0")}`;
	const journalRelPath = `日记/${year}/${month}/${dateStr}.md`;
	const journalPath = `${workspaceDir.value}/${journalRelPath}`;

	// 先尝试打开已有日记
	const existing = preview.tabs.value.find((t) => t.path === journalPath);
	if (existing) {
		activeId.value = existing.id;
		return;
	}

	// 不存在则新建（后端 createNote 会自动创建父目录）
	try {
		const response = await createNote({ path: journalRelPath });
		refreshTree();
		preview.openFile(response.path);
		activeId.value = response.path;
	} catch (err) {
		console.error("Failed to create journal", err);
	}
};

// 新建文件夹
const handleCreateFolder = async () => {
	try {
		await createNoteFolder();
		refreshTree();
	} catch (err) {
		console.error("Failed to create folder", err);
	}
};

const handleCreateBase = async () => {
	try {
		const result = await createBase("新数据库");
		refreshTree();
		const fullPath = `${workspaceDir.value}/${result.path}`;
		preview.openFile(fullPath);
		activeId.value = fullPath;
	} catch (err) {
		console.error("Failed to create base", err);
	}
};
</script>

<template>
  <div class="flex h-full min-h-0 bg-background text-foreground">
    <!-- 左侧面板 -->
    <aside class="flex w-[260px] shrink-0 flex-col border-r border-border/50 bg-background">
      <!-- 搜索栏 -->
      <div class="shrink-0 px-3 pt-3 pb-2">
        <div class="flex h-8 items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 text-muted-foreground">
          <Search class="size-3.5" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索文件..."
            class="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      <!-- 固定视图入口 -->
      <div class="shrink-0 space-y-0.5 px-2 pb-2">
        <button
          v-for="view in fixedViews"
          :key="view.id"
          type="button"
          class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors"
          :class="
            activeId === view.id
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
          "
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

      <!-- 文件树 -->
      <div class="min-h-0 flex-1 overflow-hidden">
        <FileTreePanel
          title="文件"
          :nodes="visibleNodes"
          :is-root-loading="isDirectoryLoading(rootPath)"
          :error="fileTreeError"
          :is-expanded="isDirectoryExpanded"
          :is-loading="isDirectoryLoading"
          @select="handleSelectFile"
          @toggle-expand="handleToggleExpand"
          @toggle-favorite="handleToggleFavorite"
          @refresh="refreshTree"
        />
      </div>

      <!-- 底部新建按钮 -->
      <div class="shrink-0 border-t border-border/50 px-3 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button
              type="button"
              class="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
            >
              <Plus class="size-3.5" />
              新建
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-48">
            <DropdownMenuItem @click="handleCreateJournal">
              📅 今日日记
            </DropdownMenuItem>
            <DropdownMenuItem @click="handleCreateNote('笔记')">
              📝 新笔记
            </DropdownMenuItem>
            <DropdownMenuItem @click="handleCreateNote('收件箱')">
              💡 闪念笔记
            </DropdownMenuItem>
            <DropdownMenuItem @click="handleCreateFolder">
              📁 新建文件夹
            </DropdownMenuItem>
            <DropdownMenuItem @click="handleCreateBase">
              🗃️ 新建数据库
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>

    <!-- 中间标签页区域 -->
    <main class="flex min-h-0 flex-1 flex-col">
      <TabBar
        :tabs="tabBarItems"
        :active-tab-id="activeId"
        @select="handleTabSelect"
        @close="handleTabClose"
      />

      <!-- 内容区 -->
      <div class="min-h-0 flex-1 overflow-hidden">
        <!-- 视图标签页：仪表盘 -->
        <div
          v-show="activeId === 'dashboard'"
          class="h-full"
        >
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

        <!-- 视图标签页：待办 -->
        <div
          v-show="activeId === 'tasks'"
          class="h-full"
        >
          <TaskView
            :workspace-dir="workspaceDir"
            @open-file="handleSelectFile({ kind: 'file', path: $event, name: '' }) as any"
          />
        </div>

        <!-- 视图标签页：日历 -->
        <div
          v-show="activeId === 'calendar'"
          class="h-full"
        >
          <CalendarView
            :workspace-dir="workspaceDir"
            @open-file="handleSelectFile({ kind: 'file', path: $event, name: '' }) as any"
            @create-journal="handleCreateJournal($event)"
          />
        </div>

        <!-- 视图标签页：收件箱 -->
        <div
          v-show="activeId === 'inbox'"
          class="h-full"
        >
          <InboxView
            :workspace-dir="workspaceDir"
            @open-file="handleSelectFile({ kind: 'file', path: $event, name: '' }) as any"
            @refresh-tree="refreshTree"
          />
        </div>

        <!-- 文件标签页 -->
        <div
          v-for="tab in preview.tabs.value"
          :key="tab.id"
          v-show="activeId === tab.id"
          class="h-full"
        >
          <WorkspaceContentArea
            :tab="tab"
            :root-dir="workspaceDir"
            @open-with-default-app="handleOpenWithDefaultApp"
            @load-more="preview.loadMore"
            @save-status="handleSaveStatusUpdate"
          />
        </div>
      </div>
    </main>
  </div>
</template>
