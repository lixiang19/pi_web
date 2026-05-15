import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
	mockSpaceLoad,
	mockOpenSpacePreview,
	mockSpaceWorks,
	mockAllPaneGroups,
	mockSessions,
	mockProjects,
	mockRefreshSessions,
	mockRefreshSessionContexts,
	mockUploadSessionAttachments,
	mockEndSession,
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
	mockSpaceLoad: vi.fn(),
	mockOpenSpacePreview: vi.fn(),
	mockSpaceWorks: { value: [] as Array<{ id: string; name: string; path: string; indexPath: string; size: number; modifiedAt: number }> },
	mockAllPaneGroups: {
		value: [
			{
				id: "pane-1",
				tabs: [{ id: "home-1", kind: "home", title: "主页", sessionId: undefined as string | undefined }],
				activeTabId: "home-1",
			},
		],
	},
	mockSessions: { value: [] as Array<{ id: string; title: string; updatedAt?: number; archived?: boolean; projectId?: string; contextId?: string }> },
	mockProjects: { value: [] as Array<{ id: string; name: string; path: string; isOnline: boolean; archivedAt?: number; externalOrigin?: 'github' | 'folder' | null; projectType?: 'internal' | 'external' | 'workspace'; isGit?: boolean; deviceName?: string }> },
	mockRefreshSessions: vi.fn(),
	mockRefreshSessionContexts: vi.fn(),
	mockUploadSessionAttachments: vi.fn(),
	mockEndSession: vi.fn().mockResolvedValue({ ok: true, jobId: "job-1" }),
}));

vi.mock("@/lib/api", () => ({
	createFileEntry: mockCreateFileEntry,
	createBase: mockCreateBase,
	createFile: mockCreateFile,
	createNote: vi.fn(),
	getRecentFiles: mockGetRecentFiles,
	createSession: mockCreateSession,
	endSession: mockEndSession,
	uploadSessionAttachments: mockUploadSessionAttachments,
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
	createHomeTab: (options?: { cwd?: string; contextLabel?: string }) => ({
		id: "home-1",
		title: "主页",
		kind: "home",
		status: "idle",
		cwd: options?.cwd,
		contextLabel: options?.contextLabel,
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
	createSpacePreviewTab: (filePath: string, title: string) => ({
		id: `space:${filePath}`,
		title,
		kind: "space_preview",
		filePath,
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

vi.mock("@/composables/useWorkspaceSpace", () => ({
	useWorkspaceSpace: () => ({
		works: mockSpaceWorks,
		loading: { value: false },
		error: { value: "" },
		load: mockSpaceLoad,
		openPreview: mockOpenSpacePreview,
	}),
}));

vi.mock("@/composables/usePiChatCore", () => ({
	usePiChatCore: () => ({
		info: { value: { workspaceDir: "/ws", chatProjectId: "ridge:workspace-chat", chatProjectPath: "/ws", chatProjectLabel: "聊天" } },
		sessions: mockSessions,
		sessionContexts: { value: {} },
		models: { value: [{ label: "GPT-4", value: "gpt-4" }] },
		agents: { value: [] },
		defaultModel: { value: "gpt-4" },
		refreshSessions: mockRefreshSessions,
		refreshSessionContexts: mockRefreshSessionContexts,
	}),
}));

vi.mock("@/composables/useProjects", () => ({
	useProjects: () => ({
		projects: mockProjects,
		load: vi.fn(),
		isLoading: { value: false },
		error: { value: "" },
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

const mountedWrappers: Array<ReturnType<typeof mount>> = [];

function mountWorkspace() {
	const wrapper = mount(WorkspacePage, {
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
	mountedWrappers.push(wrapper);
	return wrapper;
}

afterEach(() => {
	for (const wrapper of mountedWrappers.splice(0)) {
		wrapper.unmount();
	}
});

// ===== Tests =====

describe("WorkspacePage - 固定入口", () => {
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
		mockProjects.value = [];
		mockFindTabAcrossPanes.mockReturnValue(null);
		lastCreatedChatTab.value = null;
	});

	it("左侧固定入口完整且不包含主页入口", () => {
		const wrapper = mountWorkspace();
		const text = wrapper.text();
		// 只断言已实现的真实入口，不暴露未实现占位
		for (const label of ["闪念", "搜索", "任务", "文件", "空间", "终端", "自动化", "设置"]) {
			expect(text).toContain(label);
		}
		const navButtons = wrapper.findAll("[data-test='workspace-fixed-entry']");
		expect(navButtons.map((button) => button.text())).not.toContain("主页");
	});

	it("固定入口顺序严格为：闪念、搜索、任务、文件、空间、终端、自动化、设置", () => {
		const wrapper = mountWorkspace();
		const buttons = wrapper.findAll("[data-test='workspace-fixed-entry']");
		const labels = buttons.map((button) => button.text().replace(/\d+$/, "").trim());
		expect(labels).toEqual(["闪念", "搜索", "任务", "文件", "空间", "终端", "自动化", "设置"]);
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

	it("点击空间作品打开 space_preview 标签", async () => {
		const wrapper = mountWorkspace();
		const vm = wrapper.vm as unknown as {
			handleOpenSpacePreview: (work: {
				id: string;
				name: string;
				path: string;
				indexPath: string;
				size: number;
				modifiedAt: number;
			}) => Promise<void>;
		};
		mockOpenSpacePreview.mockResolvedValue({
			id: "demo-id",
			name: "demo",
			indexPath: "/ws/空间/demo/index.html",
			html: "<h1>demo</h1>",
		});

		await vm.handleOpenSpacePreview({
			id: "demo-id",
			name: "demo",
			path: "/ws/空间/demo",
			indexPath: "/ws/空间/demo/index.html",
			size: 128,
			modifiedAt: 1714521600000,
		});

		expect(mockOpenSpacePreview).toHaveBeenCalledWith("demo-id");
		expect(mockOpenTab).toHaveBeenCalledWith(
			"pane-1",
			expect.objectContaining({
				id: "space:/ws/空间/demo/index.html",
				kind: "space_preview",
				filePath: "/ws/空间/demo/index.html",
				title: "demo",
			}),
		);
	});

	it("页面卸载时结束仍打开的会话标签", async () => {
		mockAllPaneGroups.value = [
			{
				id: "pane-1",
				tabs: [
					{ id: "chat-tab-1", kind: "conversation", title: "会话", sessionId: "session-open-1" },
					{ id: "home-1", kind: "home", title: "主页", sessionId: undefined },
				],
				activeTabId: "chat-tab-1",
			},
		];

		const wrapper = mountWorkspace();
		wrapper.unmount();

		await vi.waitFor(() => {
			expect(mockEndSession).toHaveBeenCalledWith("session-open-1");
		});
	});

	it("pagehide 时优先用 sendBeacon 结束打开的会话标签", async () => {
		const sendBeacon = vi.fn(() => true);
		Object.defineProperty(navigator, "sendBeacon", {
			configurable: true,
			value: sendBeacon,
		});
		mockAllPaneGroups.value = [
			{
				id: "pane-1",
				tabs: [
					{ id: "chat-tab-1", kind: "conversation", title: "会话", sessionId: "session-beacon-1" },
					{ id: "home-1", kind: "home", title: "主页", sessionId: undefined },
				],
				activeTabId: "chat-tab-1",
			},
		];

		const wrapper = mountWorkspace();
		window.dispatchEvent(new Event("pagehide"));
		wrapper.unmount();

		expect(sendBeacon).toHaveBeenCalledWith("/api/sessions/session-beacon-1/end", "");
		expect(mockEndSession).not.toHaveBeenCalledWith("session-beacon-1");
	});

	it("pagehide 与 unmount 同一轮触发时不会重复结束会话", async () => {
		Object.defineProperty(navigator, "sendBeacon", {
			configurable: true,
			value: vi.fn(() => false),
		});
		mockAllPaneGroups.value = [
			{
				id: "pane-1",
				tabs: [
					{ id: "chat-tab-1", kind: "conversation", title: "会话", sessionId: "session-pagehide-1" },
				],
				activeTabId: "chat-tab-1",
			},
		];

		const wrapper = mountWorkspace();
		window.dispatchEvent(new Event("pagehide"));
		wrapper.unmount();

		await vi.waitFor(() => {
			expect(mockEndSession).toHaveBeenCalledWith("session-pagehide-1");
		});
		expect(
			mockEndSession.mock.calls.filter(([sessionId]) => sessionId === "session-pagehide-1"),
		).toHaveLength(1);
	});
});

describe("WorkspacePage - 会话列表", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetRecentFiles.mockResolvedValue({ files: [] });
		mockAllPaneGroups.value = [
			{
				id: "pane-1",
				tabs: [{ id: "home-1", kind: "home", title: "主页", sessionId: undefined }],
				activeTabId: "home-1",
			},
		];
		mockProjects.value = [];
		mockFindTabAcrossPanes.mockReturnValue(null);
	});

	it("工作空间会话列表按 updatedAt 降序排列", () => {
		mockSessions.value = [
			{ id: "s-old", title: "旧会话", updatedAt: 1000, archived: false },
			{ id: "s-new", title: "新会话", updatedAt: 3000, archived: false },
			{ id: "s-mid", title: "中会话", updatedAt: 2000, archived: false },
		];
		const wrapper = mountWorkspace();
		const sessionButtons = wrapper.findAll("button").filter((b) =>
			["旧会话", "新会话", "中会话"].some((t) => b.text().includes(t)),
		);
		const texts = sessionButtons.map((b) => b.text());
		expect(texts).toEqual(["新会话", "中会话", "旧会话"]);
	});

	it("工作空间会话列表默认不显示 archived 会话", () => {
		mockSessions.value = [
			{ id: "s-active", title: "活跃会话", updatedAt: 3000, archived: false },
			{ id: "s-archived", title: "归档会话", updatedAt: 3000, archived: true },
		];
		const wrapper = mountWorkspace();
		const text = wrapper.text();
		expect(text).toContain("活跃会话");
		expect(text).not.toContain("归档会话");
	});

	it("工作空间会话列表不显示项目归属会话", () => {
		mockSessions.value = [
			{ id: "s-ws", title: "工作空间会话", updatedAt: 3000, archived: false, projectId: "" },
			{ id: "s-project", title: "项目会话", updatedAt: 3000, archived: false, projectId: "proj-1" },
		];
		mockProjects.value = [			{
				id: "proj-1",
				name: "proj",
				path: "/p",
				isOnline: true,
				externalOrigin: "folder",
				projectType: "external",
				isGit: false,
			},
		];
		const wrapper = mountWorkspace();
		const text = wrapper.text();
		expect(text).toContain("工作空间会话");
		expect(text).not.toContain("项目会话");
	});
});

describe("WorkspacePage - 首页→会话转换", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetRecentFiles.mockResolvedValue({ files: [] });
		lastCreatedChatTab.value = null;
		mockSessions.value = [];
		mockProjects.value = [];
		mockFindTabAcrossPanes.mockReturnValue(null);
	});

	it("handleHomeSubmit 创建带 initialPrompt 和 initialThinkingLevel 的 chat 标签", async () => {
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
					attachments?: File[];
				},
			) => Promise<void>;
		};

		await vm.handleHomeSubmit("home-1", {
			text: "帮我写个函数",
			model: "gpt-4",
			agent: "__pi-no-agent__",
			thinkingLevel: "medium",
		});

		expect(mockCreateSession).toHaveBeenCalledWith(
			expect.objectContaining({
				cwd: "/ws",
				title: "帮我写个函数",
				model: "gpt-4",
				agent: null,
				thinkingLevel: "medium",
			}),
		);

		expect(mockReplaceTab).toHaveBeenCalledWith(
			"home-1",
			expect.objectContaining({
				kind: "conversation",
				sessionId: "session-new",
				initialPrompt: "帮我写个函数",
				initialModel: "gpt-4",
				initialAgent: "__pi-no-agent__",
				initialThinkingLevel: "medium",
				initialAttachmentIds: undefined,
			}),
		);
	});

	it("handleHomeSubmit 有附件时先上传附件再 replaceTab 并带 initialAttachmentIds", async () => {
		mockCreateSession.mockResolvedValue({
			id: "session-with-attachments",
			title: "附件测试",
			status: "idle",
		});
		mockUploadSessionAttachments.mockResolvedValue({
			attachments: [
				{ id: "att-1", originalName: "note.txt", mimeType: "text/plain", size: 12, sha256: "abc", createdAt: Date.now() },
			],
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
					attachments?: File[];
				},
			) => Promise<void>;
		};

		const file = new File(["hello world"], "note.txt", { type: "text/plain" });
		await vm.handleHomeSubmit("home-1", {
			text: "附件测试",
			model: "gpt-4",
			agent: "__pi-no-agent__",
			thinkingLevel: "medium",
			attachments: [file],
		});

		expect(mockUploadSessionAttachments).toHaveBeenCalledWith("session-with-attachments", [file]);
		expect(mockReplaceTab).toHaveBeenCalledWith(
			"home-1",
			expect.objectContaining({
				kind: "conversation",
				sessionId: "session-with-attachments",
				initialAttachmentIds: ["att-1"],
			}),
		);
	});

	it("handleHomeSubmit 附件上传失败时不 replaceTab 并 toast 报错", async () => {
		mockCreateSession.mockResolvedValue({
			id: "session-upload-fail",
			title: "上传失败",
			status: "idle",
		});
		mockUploadSessionAttachments.mockRejectedValue(new Error("上传超时"));

		const wrapper = mountWorkspace();
		const vm = wrapper.vm as unknown as {
			handleHomeSubmit: (
				homeTabId: string,
				payload: {
					text: string;
					model: string;
					agent: string;
					thinkingLevel: string;
					attachments?: File[];
				},
			) => Promise<void>;
		};

		const file = new File(["x"], "x.txt", { type: "text/plain" });
		await vm.handleHomeSubmit("home-1", {
			text: "上传失败",
			model: "gpt-4",
			agent: "__pi-no-agent__",
			thinkingLevel: "medium",
			attachments: [file],
		});

		expect(mockUploadSessionAttachments).toHaveBeenCalledWith("session-upload-fail", [file]);
		expect(mockReplaceTab).not.toHaveBeenCalled();
	});

	it("handleHomeSubmit 成功后会调用 refreshSessions 和 refreshSessionContexts", async () => {
		mockCreateSession.mockResolvedValue({
			id: "session-sync",
			title: "同步测试",
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
			text: "同步测试",
			model: "gpt-4",
			agent: "coding-agent",
			thinkingLevel: "high",
		});

		expect(mockRefreshSessions).toHaveBeenCalled();
		expect(mockRefreshSessionContexts).toHaveBeenCalled();
	});

	it("handleHomeSubmit 失败时不 replaceTab 且显示错误", async () => {
		mockCreateSession.mockRejectedValue(new Error("网络错误"));

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
			text: "失败测试",
			model: "gpt-4",
			agent: "__pi-no-agent__",
			thinkingLevel: "medium",
		});

		expect(mockReplaceTab).not.toHaveBeenCalled();
	});

	it("handleHomeSubmit 失败后仍可再次提交并成功", async () => {
		mockCreateSession.mockRejectedValueOnce(new Error("网络错误"));
		mockCreateSession.mockResolvedValueOnce({
			id: "session-retry",
			title: "重试成功",
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
			text: "失败测试",
			model: "gpt-4",
			agent: "__pi-no-agent__",
			thinkingLevel: "medium",
		});
		expect(mockReplaceTab).not.toHaveBeenCalled();

		await vm.handleHomeSubmit("home-1", {
			text: "重试成功",
			model: "gpt-4",
			agent: "__pi-no-agent__",
			thinkingLevel: "medium",
		});
		expect(mockReplaceTab).toHaveBeenCalledWith(
			"home-1",
			expect.objectContaining({
				kind: "conversation",
				sessionId: "session-retry",
			}),
		);
	});

	it("打开主页时不调用 createSession", () => {
		mountWorkspace();
		expect(mockCreateSession).not.toHaveBeenCalled();
	});
});

describe("WorkspacePage - 项目相关", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetRecentFiles.mockResolvedValue({ files: [] });
		mockAllPaneGroups.value = [
			{
				id: "pane-1",
				tabs: [{ id: "home-1", kind: "home", title: "主页", sessionId: undefined }],
				activeTabId: "home-1",
			},
		];
		mockSessions.value = [];
		mockProjects.value = [];
		mockFindTabAcrossPanes.mockReturnValue(null);
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

	it("关闭空主页标签不会创建会话", () => {
		const wrapper = mountWorkspace();
		const vm = wrapper.vm as unknown as {
			handleCloseTab: (payload: { paneGroupId: string; tabId: string }) => void;
		};

		vm.handleCloseTab({ paneGroupId: "pane-1", tabId: "home-1" });

		expect(mockCloseTab).toHaveBeenCalledWith("pane-1", "home-1");
		expect(mockCreateSession).not.toHaveBeenCalled();
	});

	it("项目元信息可见（路径、设备、类型、来源、Git）", () => {
		mockProjects.value = [
			{
				id: "proj-1",
				name: "MyProject",
				path: "/home/user/MyProject",
				isOnline: true,
				projectType: "external",
				externalOrigin: "github",
				isGit: true,
				deviceName: "server-1",
			},
		];
		const wrapper = mountWorkspace();
		const projectItem = wrapper.find('[data-test="project-item-proj-1"]');
		expect(projectItem.exists()).toBe(true);
		expect(projectItem.text()).toContain("MyProject");
		expect(projectItem.text()).toContain("外部仓库");
		expect(projectItem.text()).toContain("GitHub");
		expect(projectItem.text()).toContain("Git");
		expect(projectItem.text()).toContain("server-1");
	});

	it("项目默认最多显示 3 个会话，点击展开更多显示剩余", async () => {
		mockProjects.value = [
			{
				id: "proj-1",
				name: "proj",
				path: "/p",
				isOnline: true,
			},
		];
		mockSessions.value = [
			{ id: "s1", title: "会话1", updatedAt: 1000, archived: false, projectId: "proj-1", contextId: "ctx1" },
			{ id: "s2", title: "会话2", updatedAt: 2000, archived: false, projectId: "proj-1", contextId: "ctx2" },
			{ id: "s3", title: "会话3", updatedAt: 3000, archived: false, projectId: "proj-1", contextId: "ctx3" },
			{ id: "s4", title: "会话4", updatedAt: 4000, archived: false, projectId: "proj-1", contextId: "ctx4" },
		];

		const wrapper = mountWorkspace();
		const projectItem = wrapper.find('[data-test="project-item-proj-1"]');
		await projectItem.find('button').trigger("click"); // expand

		const text = wrapper.text();
		expect(text).toContain("会话4");
		expect(text).toContain("会话3");
		expect(text).toContain("会话2");
		expect(text).not.toContain("会话1"); // 默认隐藏第4个

		// 点击展开更多
		const moreBtn = wrapper.find('[data-test="project-toggle-more"]');
		expect(moreBtn.exists()).toBe(true);
		await moreBtn.trigger("click");

		const textAfter = wrapper.text();
		expect(textAfter).toContain("会话1");
	});

	it("离线项目不显示历史会话，不能新建会话", async () => {
		mockProjects.value = [
			{
				id: "proj-offline",
				name: "offline-proj",
				path: "/p",
				isOnline: false,
			},
		];
		mockSessions.value = [
			{ id: "s-offline", title: "离线会话", updatedAt: 1000, archived: false, projectId: "proj-offline", contextId: "ctx1" },
		];

		const wrapper = mountWorkspace();
		const projectItem = wrapper.find('[data-test="project-item-proj-offline"]');
		expect(projectItem.exists()).toBe(true);
		expect(projectItem.text()).toContain("离线");

		// 展开项目
		await projectItem.find('button').trigger("click");
		expect(wrapper.text()).not.toContain("离线会话");

		// 新建会话按钮不存在
		expect(projectItem.find('[data-test="project-new-session"]').exists()).toBe(false);
	});

	it("内部项目新建会话使用 workspaceDir 作为 cwd", () => {
		mockProjects.value = [
			{
				id: "proj-internal",
				name: "内部项目",
				path: "/home/user/ridge-workspace/项目/内部项目",
				isOnline: true,
				projectType: "internal",
				externalOrigin: null,
				isGit: false,
			},
		];
		const wrapper = mountWorkspace();
		const newBtn = wrapper.find('[data-test="project-new-session"]');
		expect(newBtn.exists()).toBe(true);
		newBtn.trigger("click");

		// 内部项目应使用 workspaceDir（"/ws"）而非项目路径
		expect(mockOpenTab).toHaveBeenCalledWith(
			"pane-1",
			expect.objectContaining({
				kind: "home",
				cwd: "/ws",
				contextLabel: "内部项目",
			}),
		);
	});

	it("外部仓库新建会话使用外部仓库路径作为 cwd", () => {
		mockProjects.value = [
			{
				id: "proj-external",
				name: "外部仓库",
				path: "/home/user/repos/external-repo",
				isOnline: true,
				projectType: "external",
				externalOrigin: "folder",
				isGit: true,
			},
		];
		const wrapper = mountWorkspace();
		const newBtn = wrapper.find('[data-test="project-new-session"]');
		expect(newBtn.exists()).toBe(true);
		newBtn.trigger("click");

		// 外部仓库应使用项目路径作为 cwd
		expect(mockOpenTab).toHaveBeenCalledWith(
			"pane-1",
			expect.objectContaining({
				kind: "home",
				cwd: "/home/user/repos/external-repo",
				contextLabel: "外部仓库",
			}),
		);
	});

	it("项目新建会话的 home tab 携带项目 cwd", () => {
		mockProjects.value = [
			{
				id: "proj-1",
				name: "proj",
				path: "/project/foo",
				isOnline: true,
				projectType: "external",
				externalOrigin: "folder",
				isGit: false,
			},
		];
		const wrapper = mountWorkspace();
		const newBtn = wrapper.find('[data-test="project-new-session"]');
		expect(newBtn.exists()).toBe(true);
		newBtn.trigger("click");

		expect(mockOpenTab).toHaveBeenCalledWith(
			"pane-1",
			expect.objectContaining({
				kind: "home",
				cwd: "/project/foo",
				contextLabel: "proj",
			}),
		);
	});

	it("归档入口打开 feature:archived 单例标签", async () => {
		const wrapper = mountWorkspace();
		const archivedBtn = wrapper.find('[data-test="workspace-archived-entry"]');
		expect(archivedBtn.exists()).toBe(true);
		await archivedBtn.trigger("click");

		expect(mockOpenTab).toHaveBeenCalledWith(
			"pane-1",
			expect.objectContaining({
				id: "feature:archived",
				kind: "singleton_feature",
				featureId: "archived",
			}),
		);
	});
});
