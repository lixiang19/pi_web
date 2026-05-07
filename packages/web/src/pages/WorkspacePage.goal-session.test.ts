import { mount } from "@vue/test-utils";
import { computed, defineComponent, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia } from "pinia";

import WorkspacePage from "./WorkspacePage.vue";
import {
	createSession,
	createWorkspaceTask,
	getSessionHydrate,
	sendMessage,
	updateWorkspaceTask,
} from "@/lib/api";
import { toast } from "vue-sonner";

const sessions = ref<Array<{ id: string; title: string }>>([]);
const tasks = ref<unknown[]>([]);
const updateTask = vi.fn();
const refreshSessions = vi.fn();

vi.mock("@/lib/api", async () => {
	const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
	return {
		...actual,
		getRecentFiles: vi.fn().mockResolvedValue({ files: [] }),
		getFileTree: vi.fn().mockResolvedValue({ root: "/workspace", entries: [] }),
		createWorkspaceTask: vi.fn().mockResolvedValue({
			task: { id: "task-goal", title: "推进 MVP" },
			updatedAt: 1,
		}),
		updateWorkspaceTask: vi.fn().mockResolvedValue({ ok: true, updatedAt: 2 }),
		createSession: vi.fn().mockResolvedValue({ id: "session-1", title: "推进 MVP" }),
		sendMessage: vi.fn().mockResolvedValue({ ok: true }),
		getSessionHydrate: vi.fn().mockResolvedValue({ sessionId: "session-1", messages: [] }),
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
		refreshSessions,
	}),
}));

vi.mock("@/composables/useWorkspaceTasks", () => ({
	provideWorkspaceTasks: () => ({
		tasks,
		todayTasks: computed(() => []),
		count: computed(() => 0),
		addTask: vi.fn(async (payload) => {
			const response = await createWorkspaceTask(payload);
			return response.task;
		}),
		updateTask,
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

const DashboardStub = defineComponent({
	template: `<div data-test="dashboard-stub" />`,
	emits: ["create-goal", "open-goal-session"],
});

const mountWorkspace = () =>
	mount(WorkspacePage, {
		global: {
			plugins: [createPinia()],
			stubs: {
				DashboardView: DashboardStub,
				FileTreePanel: true,
				WorkspaceContentArea: true,
				HomePage: true,
				TaskView: true,
				CalendarView: true,
				InboxView: true,
				GitChangesView: true,
				TerminalTabContent: true,
				AutomationTabContent: true,
				SettingsTabContent: true,
				SessionTabContent: { template: `<div data-test="session-tab-content" />` },
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

	it("creates a dashboard goal task, linked session, first prompt, and session tab", async () => {
		const wrapper = mountWorkspace();

		await wrapper.getComponent(DashboardStub).vm.$emit("create-goal", "推进 MVP");
		await vi.waitFor(() => {
			expect(sendMessage).toHaveBeenCalledWith("session-1", { prompt: "推进 MVP" });
		});

		expect(createWorkspaceTask).toHaveBeenCalledWith({
			title: "推进 MVP",
			kind: "goal",
			source: "dashboard",
			_expectedUpdatedAt: undefined,
		});
		expect(createSession).toHaveBeenCalledWith({
			cwd: "/workspace",
			title: "推进 MVP",
		});
		expect(updateTask).toHaveBeenCalledWith("task-goal", { sessionId: "session-1" });
		expect(refreshSessions).toHaveBeenCalled();
		expect(wrapper.text()).toContain("推进 MVP");
	});

	it("does not create or overwrite when opening a stale goal session", async () => {
		vi.mocked(getSessionHydrate).mockRejectedValueOnce(new Error("not found"));
		const wrapper = mountWorkspace();

		await wrapper.getComponent(DashboardStub).vm.$emit("open-goal-session", "missing-session");
		await vi.waitFor(() => {
			expect(toast.error).toHaveBeenCalledWith(
				"关联会话已失效",
				expect.objectContaining({ description: expect.any(String) }),
			);
		});

		expect(createSession).not.toHaveBeenCalled();
		expect(updateWorkspaceTask).not.toHaveBeenCalled();
		expect(updateTask).not.toHaveBeenCalled();
		expect(sendMessage).not.toHaveBeenCalled();
	});
});
