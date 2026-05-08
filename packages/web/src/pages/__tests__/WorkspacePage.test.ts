import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkspacePage from "@/pages/WorkspacePage.vue";

// ===== Mocks =====
const {
	mockCreateFileEntry,
	mockCreateBase,
	mockCreateFile,
	mockGetRecentFiles,
	mockRefreshTree,
	mockToggleDirectory,
	mockCreateSession,
	mockReplaceTab,
	mockOpenTab,
	mockSetActiveTab,
	mockProvideWorkspaceTasks,
	mockUseWorkspaceTasks,
	mockProvideWorkspaceInbox,
	mockUseWorkspaceInbox,
} = vi.hoisted(() => ({
	mockCreateFileEntry: vi.fn(),
	mockCreateBase: vi.fn(),
	mockCreateFile: vi.fn(),
	mockGetRecentFiles: vi.fn(),
	mockRefreshTree: vi.fn(),
	mockToggleDirectory: vi.fn(),
	mockCreateSession: vi.fn(),
	mockReplaceTab: vi.fn(),
	mockOpenTab: vi.fn(),
	mockSetActiveTab: vi.fn(),
	mockProvideWorkspaceTasks: vi.fn(() => ({ todayTasks: { value: [] } })),
	mockUseWorkspaceTasks: vi.fn(() => {
		throw new Error("WorkspacePage must reuse provideWorkspaceTasks return value");
	}),
	mockProvideWorkspaceInbox: vi.fn(() => ({
		count: { value: 0 },
		recentItems: { value: [] },
	})),
	mockUseWorkspaceInbox: vi.fn(() => {
		throw new Error("WorkspacePage must reuse provideWorkspaceInbox return value");
	}),
}));

vi.mock("@/lib/api", () => ({
	createFileEntry: mockCreateFileEntry,
	createBase: mockCreateBase,
	createFile: mockCreateFile,
	createNote: vi.fn(),
	getRecentFiles: mockGetRecentFiles,
	createSession: mockCreateSession,
}));

vi.mock("@/composables/useFileTreeData", () => ({
	useFileTreeData: () => ({
		rootPath: { value: "/ws" },
		visibleNodes: { value: [] },
		fileTreeError: { value: "" },
		isDirectoryExpanded: () => false,
		isDirectoryLoading: () => false,
		toggleDirectory: mockToggleDirectory,
		refreshTree: mockRefreshTree,
		expandToPath: vi.fn(),
	}),
}));

vi.mock("@/composables/useFileTreeActions", () => ({
	useFileTreeActions: () => ({
		handleDelete: vi.fn(),
		handleRename: vi.fn(),
		handleCreateFolderInTree: vi.fn(),
	}),
}));

vi.mock("@/composables/useWorkspaceFilePreview", () => ({
	useWorkspaceFilePreview: () => ({
		openFile: vi.fn(),
		closeTab: vi.fn(),
		tabs: { value: [] },
		loadMore: vi.fn(),
	}),
}));

const lastCreatedChatTab = { value: null as Record<string, unknown> | null };

vi.mock("@/composables/useSplitPanes", () => ({
	useSplitPanes: () => ({
		openTab: mockOpenTab,
		activePaneGroupId: { value: "pane-1" },
		allPaneGroups: {
			value: [
				{
					id: "pane-1",
					tabs: [{ id: "home-1", kind: "home", title: "主页" }],
					activeTabId: "home-1",
				},
			],
		},
		rootNode: {
			value: {
				id: "root",
				type: "leaf",
				tabs: [{ id: "home-1", kind: "home", title: "主页" }],
			},
		},
		setActiveTab: mockSetActiveTab,
		closeTab: vi.fn(),
		splitRight: vi.fn(),
		resizeSplit: vi.fn(),
		findTabAcrossPanes: () => null,
		moveTab: vi.fn(),
		dropTabToEdge: vi.fn(),
		replaceTab: mockReplaceTab,
	}),
	createHomeTab: () => ({
		id: "home-1",
		title: "主页",
		kind: "home",
		status: "idle",
	}),
	createChatTab: (
		sessionId: string,
		title: string,
		options?: Record<string, unknown>,
	) => {
		const tab = {
			id: "chat-1",
			title,
			kind: "chat",
			sessionId,
			...options,
			status: "idle",
		};
		lastCreatedChatTab.value = tab;
		return tab;
	},
}));

vi.mock("@/composables/useWorkspaceTasks", () => ({
	provideWorkspaceTasks: mockProvideWorkspaceTasks,
	useWorkspaceTasks: mockUseWorkspaceTasks,
}));

vi.mock("@/composables/useInbox", () => ({
	provideWorkspaceInbox: mockProvideWorkspaceInbox,
	useWorkspaceInbox: mockUseWorkspaceInbox,
}));

vi.mock("@/composables/usePiChatCore", () => ({
	usePiChatCore: () => ({
		info: { value: { workspaceDir: "/ws" } },
		sessions: { value: [] },
		models: { value: [{ label: "GPT-4", value: "gpt-4" }] },
		agents: { value: [] },
		defaultModel: { value: "gpt-4" },
	}),
}));

vi.mock("@/composables/useDashboard", () => ({
	useDashboard: () => ({
		todayJournalPath: { value: "" },
		hasTodayJournal: { value: false },
	}),
}));

vi.mock("@/composables/useRecentActivity", () => ({
	useRecentActivity: () => ({ items: { value: [] } }),
}));

vi.mock("@/stores/favorites", () => ({
	useFavoritesStore: () => ({
		itemsByType: new Map(),
		add: vi.fn(),
		remove: vi.fn(),
	}),
}));

vi.mock("@/stores/settings", () => ({
	useSettingsStore: () => ({
		defaultModel: "gpt-4",
		defaultAgent: "",
		defaultThinkingLevel: "medium",
		setDefaultModel: vi.fn(),
		setDefaultAgent: vi.fn(),
		setDefaultThinkingLevel: vi.fn(),
	}),
}));

// ===== Helpers =====

function mountWorkspace() {
	return mount(WorkspacePage, {
		global: {
			stubs: {
				FileTreePanel: true,
				SplitGrid: true,
				Tooltip: { template: "<slot />" },
				TooltipTrigger: { template: "<slot />" },
				TooltipContent: { template: "<span />" },
				Separator: { template: "<hr />" },
				Badge: { template: "<span />" },
			},
		},
	});
}

// ===== Tests =====

describe("WorkspacePage - AI 启动台集成", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetRecentFiles.mockResolvedValue({ files: [] });
		lastCreatedChatTab.value = null;
	});

	it("左侧面板不再包含仪表盘入口", () => {
		const wrapper = mountWorkspace();
		const text = wrapper.text();
		expect(text).not.toContain("仪表盘");
	});

	it("复用当前页面 provide 返回的任务和收件箱 store", () => {
		mountWorkspace();

		expect(mockProvideWorkspaceTasks).toHaveBeenCalledOnce();
		expect(mockUseWorkspaceTasks).not.toHaveBeenCalled();
		expect(mockProvideWorkspaceInbox).toHaveBeenCalledOnce();
		expect(mockUseWorkspaceInbox).not.toHaveBeenCalled();
	});

	it("左侧面板包含主页入口", () => {
		const wrapper = mountWorkspace();
		const text = wrapper.text();
		expect(text).toContain("主页");
	});

	it("点击主页入口调用 openTab 创建 home 标签", async () => {
		const wrapper = mountWorkspace();
		const buttons = wrapper.findAll("button");
		const homeBtn = buttons.find((b) => b.text().includes("主页"));
		expect(homeBtn).toBeTruthy();
		await homeBtn!.trigger("click");
		expect(mockOpenTab).toHaveBeenCalled();
	});

	it("点击待办视图创建 view 标签", async () => {
		const wrapper = mountWorkspace();
		const buttons = wrapper.findAll("button");
		const taskBtn = buttons.find((b) => b.text().includes("待办"));
		if (taskBtn) {
			await taskBtn.trigger("click");
			expect(mockOpenTab).toHaveBeenCalledWith(
				"pane-1",
				expect.objectContaining({ kind: "view", viewId: "tasks" }),
			);
		}
	});
});

describe("WorkspacePage - 首页→会话转换", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetRecentFiles.mockResolvedValue({ files: [] });
		lastCreatedChatTab.value = null;
	});

	it("handleHomeSubmit 创建带 initialPrompt 的 chat 标签", async () => {
		mockCreateSession.mockResolvedValue({
			id: "session-new",
			title: "帮我写个函数",
			status: "idle",
		});

		const wrapper = mountWorkspace();
		const vm = wrapper.vm as unknown as {
			handleHomeSubmit: (
				homeTabId: string,
				payload: {
					text: string;
					model: string;
					agent: string;
					thinkingLevel: string;
				},
			) => Promise<void>;
		};

		await vm.handleHomeSubmit("home-1", {
			text: "帮我写个函数",
			model: "gpt-4",
			agent: "__pi-no-agent__",
			thinkingLevel: "medium",
		});

		// 验证 createSession 被调用，带正确的 cwd 和 title
		expect(mockCreateSession).toHaveBeenCalledWith(
			expect.objectContaining({
				cwd: "/ws",
				title: "帮我写个函数",
			}),
		);

		// 验证 replaceTab 被调用
		expect(mockReplaceTab).toHaveBeenCalledWith(
			"home-1",
			expect.objectContaining({
				kind: "chat",
				sessionId: "session-new",
				initialPrompt: "帮我写个函数",
			}),
		);
	});

	it("handleHomeSubmit 传递模型/Agent/思考级别到 createSession 和 chatTab", async () => {
		mockCreateSession.mockResolvedValue({
			id: "session-new-2",
			title: "测试",
			status: "idle",
		});

		const wrapper = mountWorkspace();
		const vm = wrapper.vm as unknown as {
			handleHomeSubmit: (
				homeTabId: string,
				payload: {
					text: string;
					model: string;
					agent: string;
					thinkingLevel: string;
				},
			) => Promise<void>;
		};

		await vm.handleHomeSubmit("home-1", {
			text: "测试",
			model: "claude-3",
			agent: "coding-agent",
			thinkingLevel: "high",
		});

		// createSession 带模型和 agent
		expect(mockCreateSession).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "claude-3",
				agent: "coding-agent",
			}),
		);

		// chatTab 携带 initialPrompt/Model/Agent
		expect(mockReplaceTab).toHaveBeenCalledWith(
			"home-1",
			expect.objectContaining({
				initialPrompt: "测试",
				initialModel: "claude-3",
				initialAgent: "coding-agent",
			}),
		);
	});

	it("handleHomeSubmit 对 NO_AGENT_VALUE 传 null 给 createSession", async () => {
		mockCreateSession.mockResolvedValue({
			id: "session-no-agent",
			title: "无 Agent",
			status: "idle",
		});

		const wrapper = mountWorkspace();
		const vm = wrapper.vm as unknown as {
			handleHomeSubmit: (
				homeTabId: string,
				payload: {
					text: string;
					model: string;
					agent: string;
					thinkingLevel: string;
				},
			) => Promise<void>;
		};

		await vm.handleHomeSubmit("home-1", {
			text: "直接对话",
			model: "gpt-4",
			agent: "__pi-no-agent__",
			thinkingLevel: "medium",
		});

		expect(mockCreateSession).toHaveBeenCalledWith(
			expect.objectContaining({
				agent: null,
			}),
		);
	});
});
