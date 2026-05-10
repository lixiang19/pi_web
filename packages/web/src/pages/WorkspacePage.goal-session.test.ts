import { mount } from "@vue/test-utils";
import { computed, defineComponent, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia } from "pinia";

import WorkspacePage from "./WorkspacePage.vue";
import { createSession } from "@/lib/api";
import { NO_AGENT_VALUE } from "@/composables/useWorkbenchSessionState";

const sessions = ref<Array<{ id: string; title: string }>>([]);
const tasks = ref<unknown[]>([]);
const refreshSessions = vi.fn();

vi.mock("@/lib/api", async () => {
	const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
	return {
		...actual,
		getRecentFiles: vi.fn().mockResolvedValue({ files: [] }),
		getFileTree: vi.fn().mockResolvedValue({ root: "/workspace", entries: [] }),
		createSession: vi.fn().mockResolvedValue({ id: "session-1", title: "推进 MVP" }),
	};
});

vi.mock("vue-sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
		warning: vi.fn(),
	},
}));

vi.mock("@/composables/usePiChatCore", () => ({
	usePiChatCore: () => ({
		info: ref({
			appName: "Ridge",
			workspaceDir: "/workspace",
			chatProjectId: "chat",
			chatProjectPath: "/workspace/chat",
			chatProjectLabel: "Chat",
			apiBase: "",
			sdkVersion: "test",
		}),
		sessions,
		sessionContexts: { value: {} },
		refreshSessions,
	}),
}));

vi.mock("@/composables/useWorkspaceTasks", () => ({
	provideWorkspaceTasks: () => ({
		tasks,
		todayTasks: computed(() => []),
		count: computed(() => 0),
		addTask: vi.fn(),
		updateTask: vi.fn(),
	}),
	useWorkspaceTasks: () => ({
		tasks,
		todayTasks: computed(() => []),
	}),
}));

vi.mock("@/composables/useInbox", () => ({
	provideWorkspaceInbox: () => ({
		count: computed(() => 0),
	}),
	useWorkspaceInbox: () => ({
		count: computed(() => 0),
		filteredFiles: computed(() => []),
		formatTime: (value: number) => String(value),
	}),
}));

vi.mock("@/composables/useFileTreeData", () => ({
	useFileTreeData: () => ({
		rootPath: ref("/workspace"),
		visibleNodes: ref([]),
		fileTreeError: ref(""),
		isDirectoryExpanded: vi.fn().mockReturnValue(false),
		isDirectoryLoading: vi.fn().mockReturnValue(false),
		toggleDirectory: vi.fn(),
		refreshTree: vi.fn(),
	}),
}));

vi.mock("@/composables/useProjects", () => ({
	useProjects: () => ({
		projects: ref([]),
		load: vi.fn(),
		isLoading: { value: false },
		error: { value: "" },
	}),
}));

vi.mock("@/composables/useTerminalPool", () => ({
	useTerminalPool: () => ({
		createNewTerminal: vi.fn().mockResolvedValue({ id: "terminal-1", title: "Terminal" }),
		closeTerminal: vi.fn(),
	}),
}));

vi.mock("@/composables/useTerminalContextOptions", () => ({
	useTerminalContextOptions: () => ({
		load: vi.fn().mockResolvedValue(undefined),
		createDefaultPayload: vi.fn().mockReturnValue({}),
	}),
}));

vi.mock("@/composables/useWorkspaceFilePreview", () => ({
	useWorkspaceFilePreview: () => ({
		tabs: ref([]),
		openFile: vi.fn(),
		loadMore: vi.fn(),
	}),
}));

const HomePageStub = defineComponent({
	name: "HomePage",
	template: `<div data-test="home-page-stub" />`,
	emits: ["submit", "open-session"],
});

const mountWorkspace = () =>
	mount(WorkspacePage, {
		global: {
			plugins: [createPinia()],
			stubs: {
				FileTreePanel: true,
				WorkspaceContentArea: true,
				HomePage: HomePageStub,
				TaskView: true,
				CalendarView: true,
				InboxView: true,
				GitChangesView: true,
				TerminalTabContent: true,
				AutomationTabContent: true,
				SettingsTabContent: true,
				WorkspaceChatTab: {
					props: ["sessionId", "workspaceDir", "initialPrompt", "initialModel", "initialAgent"],
					template: `<div data-test="workspace-chat-tab">{{ sessionId }} {{ initialPrompt }}</div>`,
				},
				WorkspaceTopMenu: true,
				Separator: true,
				Badge: true,
				Tooltip: { template: "<div><slot /></div>" },
				TooltipTrigger: { template: "<div><slot /></div>" },
				TooltipContent: { template: "<div><slot /></div>" },
			},
		},
	});

describe("WorkspacePage goal to session orchestration", () => {
	beforeEach(() => {
		sessions.value = [];
		tasks.value = [];
		vi.clearAllMocks();
	});

	it("replaces a home tab with a chat session after first prompt submit", async () => {
		const wrapper = mountWorkspace();

		await wrapper.getComponent(HomePageStub).vm.$emit("submit", {
			text: "推进 MVP",
			model: "gpt-test",
			agent: NO_AGENT_VALUE,
			thinkingLevel: "medium",
		});
		await vi.waitFor(() => {
			expect(createSession).toHaveBeenCalledWith({
				cwd: "/workspace",
				title: "推进 MVP",
				model: "gpt-test",
				agent: null,
				thinkingLevel: "medium",
			});
		});

		expect(wrapper.get('[data-test="workspace-chat-tab"]').text()).toContain("session-1");
		expect(wrapper.text()).toContain("推进 MVP");
	});

	it("opens an existing chat session from home activity", async () => {
		sessions.value = [{ id: "session-existing", title: "旧会话" }];
		const wrapper = mountWorkspace();

		await wrapper.getComponent(HomePageStub).vm.$emit("open-session", "session-existing");

		expect(createSession).not.toHaveBeenCalled();
		expect(wrapper.get('[data-test="workspace-chat-tab"]').text()).toContain("session-existing");
		expect(wrapper.text()).toContain("旧会话");
	});
});
