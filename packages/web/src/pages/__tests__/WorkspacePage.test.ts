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
	mockCloseTab,
	mockFindTabAcrossPanes,
	mockCreateTerminal,
	mockCloseTerminal,
	mockLoadTerminalOptions,
	mockProvideWorkspaceTasks,
	mockUseWorkspaceTasks,
	mockProvideWorkspaceInbox,
	mockUseWorkspaceInbox,
	mockAllPaneGroups,
	mockSessions,
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
	mockCloseTab: vi.fn(),
	mockFindTabAcrossPanes: vi.fn(() => null),
	mockCreateTerminal: vi.fn(),
	mockCloseTerminal: vi.fn(),
	mockLoadTerminalOptions: vi.fn(),
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
	mockAllPaneGroups: {
		value: [
			{
				id: "pane-1",
				tabs: [{ id: "home-1", kind: "home", title: "主页", sessionId: undefined as string | undefined }],
				activeTabId: "home-1",
			},
		],
	},
	mockSessions: { value: [] as Array<{ id: string; title: string; updatedAt?: number }> },
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
		allPaneGroups: mockAllPaneGroups,
		rootNode: {
			value: {
				id: "root",
				type: "leaf",
				tabs: [{ id: "home-1", kind: "home", title: "主页" }],
			},
		},
		setActiveTab: mockSetActiveTab,
		closeTab: mockCloseTab,
		splitRight: vi.fn(),
		resizeSplit: vi.fn(),
		findTabAcrossPanes: mockFindTabAcrossPanes,
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
			kind: "conversation",
			sessionId,
			...options,
			status: "idle",
		};
		lastCreatedChatTab.value = tab;
		return tab;
	},
	createSingletonFeatureTab: (featureId: string, title: string) => ({
		id: `feature:${featureId}`,
		title,
		kind: "singleton_feature",
		featureId,
		status: "idle",
	}),
	createTerminalTab: (terminalId: string, title: string) => ({
		id: `terminal-tab:${terminalId}`,
		title,
		kind: "terminal",
		terminalId,
		status: "idle",
	}),
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
		sessions: mockSessions,
		models: { value: [{ label: "GPT-4", value: "gpt-4" }] },
		agents: { value: [] },
		defaultModel: { value: "gpt-4" },
	}),
}));

vi.mock("@/composables/useTerminalPool", () => ({
	useTerminalPool: () => ({
		createNewTerminal: mockCreateTerminal,
		closeTerminal: mockCloseTerminal,
	}),
}));

vi.mock("@/composables/useTerminalContextOptions", () => ({
	useTerminalContextOptions: () => ({
		load: mockLoadTerminalOptions,
		createDefaultPayload: vi.fn().mockReturnValue({}),
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
		mockCreateTerminal
			.mockResolvedValueOnce({ id: "terminal-1", title: "终端 1" })
			.mockResolvedValueOnce({ id: "terminal-2", title: "终端 2" });
		mockLoadTerminalOptions.mockResolvedValue(undefined);
		mockAllPaneGroups.value = [
			{
				id: "pane-1",
				tabs: [{ id: "home-1", kind: "home", title: "主页", sessionId: undefined }],
				activeTabId: "home-1",
			},
		];
		mockSessions.value = [];
		mockFindTabAcrossPanes.mockReturnValue(null);
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

	it("左侧固定入口完整且不包含主页入口", () => {
		const wrapper = mountWorkspace();
		const text = wrapper.text();
		for (const label of ["闪念", "搜索", "通知", "任务", "文件", "终端", "自动化", "Skill", "设置"]) {
			expect(text).toContain(label);
		}
		const navButtons = wrapper.findAll("[data-test='workspace-fixed-entry']");
		expect(navButtons.map((button) => button.text())).not.toContain("主页");
	});

	it("点击任务固定入口创建 singleton_feature 标签", async () => {
		const wrapper = mountWorkspace();
		const buttons = wrapper.findAll("button");
		const taskBtn = buttons.find((b) => b.text().includes("任务"));
		if (taskBtn) {
			await taskBtn.trigger("click");
			expect(mockOpenTab).toHaveBeenCalledWith(
				"pane-1",
				expect.objectContaining({
					id: "feature:tasks",
					kind: "singleton_feature",
					featureId: "tasks",
				}),
			);
		}
	});

	it("连续点击终端入口创建多个终端标签", async () => {
		const wrapper = mountWorkspace();
		const terminalBtn = wrapper.findAll("button").find((button) => button.text().includes("终端"));
		expect(terminalBtn).toBeTruthy();

		await terminalBtn!.trigger("click");
		await terminalBtn!.trigger("click");

		expect(mockCreateTerminal).toHaveBeenCalledTimes(2);
		expect(mockOpenTab).toHaveBeenCalledWith(
			"pane-1",
			expect.objectContaining({ kind: "terminal", terminalId: "terminal-1" }),
		);
		expect(mockOpenTab).toHaveBeenCalledWith(
			"pane-1",
			expect.objectContaining({ kind: "terminal", terminalId: "terminal-2" }),
		);
	});

	it("关闭空主页标签不会创建会话", () => {
		const wrapper = mountWorkspace();
		const vm = wrapper.vm as unknown as {
			handleCloseTab: (payload: { paneGroupId: string; tabId: string }) => void;
		};

		vm.handleCloseTab({ paneGroupId: "pane-1", tabId: "home-1" });

		expect(mockCloseTab).toHaveBeenCalledWith("pane-1", "home-1");
		expect(mockCreateSession).not.toHaveBeenCalled();
	});

	it("打开已存在的同一会话只激活已有标签", () => {
		mockAllPaneGroups.value = [
			{
				id: "pane-1",
				tabs: [
					{ id: "home-1", kind: "home", title: "主页", sessionId: undefined },
					{ id: "chat-existing", kind: "conversation", sessionId: "session-existing", title: "旧会话" },
				],
				activeTabId: "home-1",
			},
		];
		mockSessions.value = [{ id: "session-existing", title: "旧会话" }];
		const wrapper = mountWorkspace();
		const vm = wrapper.vm as unknown as {
			handleOpenSession: (sessionId: string) => void;
		};

		vm.handleOpenSession("session-existing");

		expect(mockSetActiveTab).toHaveBeenCalledWith("pane-1", "chat-existing");
		expect(mockOpenTab).not.toHaveBeenCalledWith(
			"pane-1",
			expect.objectContaining({ sessionId: "session-existing" }),
		);
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
				kind: "conversation",
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
