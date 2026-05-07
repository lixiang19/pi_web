import { mount } from "@vue/test-utils";
import { computed, defineComponent, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia } from "pinia";

import WorkspacePage from "./WorkspacePage.vue";
import { toast } from "vue-sonner";

vi.mock("vue-sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
		warning: vi.fn(),
	},
}));

vi.mock("@/lib/api", async () => {
	const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
	return {
		...actual,
		getRecentFiles: vi.fn().mockResolvedValue({ files: [] }),
		getFilePreview: vi.fn().mockResolvedValue({
			root: "/workspace",
			path: "/workspace/笔记/test.md",
			name: "test.md",
			extension: ".md",
			mimeType: "text/markdown",
			previewKind: "markdown",
			content: "old",
			isLargeFile: false,
			previewLineCount: 1,
			nextStartLine: null,
		}),
	};
});

vi.mock("@/composables/usePiChatCore", () => ({
	usePiChatCore: () => ({
		info: ref({ workspaceDir: "/workspace" }),
		sessions: ref([]),
		refreshSessions: vi.fn(),
	}),
}));

vi.mock("@/composables/useWorkspaceTasks", () => ({
	provideWorkspaceTasks: () => ({ tasks: ref([]), todayTasks: computed(() => []), addTask: vi.fn(), updateTask: vi.fn() }),
	useWorkspaceTasks: () => ({ tasks: ref([]), todayTasks: computed(() => []) }),
}));

vi.mock("@/composables/useInbox", () => ({
	provideWorkspaceInbox: () => ({ count: computed(() => 0) }),
	useWorkspaceInbox: () => ({ filteredFiles: computed(() => []), count: computed(() => 0), formatTime: (value: number) => String(value) }),
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
	useTerminalPool: () => ({ createNewTerminal: vi.fn(), closeTerminal: vi.fn() }),
}));

vi.mock("@/composables/useTerminalContextOptions", () => ({
	useTerminalContextOptions: () => ({ load: vi.fn(), createDefaultPayload: vi.fn().mockReturnValue({}) }),
}));

const FileTreePanelStub = defineComponent({
	emits: ["select"],
	template: `<div data-test="file-tree" />`,
});

const mountWorkspace = () =>
	mount(WorkspacePage, {
		global: {
			plugins: [createPinia()],
			stubs: {
				FileTreePanel: FileTreePanelStub,
				WorkspaceContentArea: defineComponent({
					name: "WorkspaceContentArea",
					props: ["tab", "rootDir"],
					emits: ["save-status"],
					template: `<div data-test="content-area" />`,
				}),
				HomePage: true,
				DashboardView: true,
				TaskView: true,
				CalendarView: true,
				InboxView: true,
				GitChangesView: true,
				TerminalTabContent: true,
				AutomationTabContent: true,
				SettingsTabContent: true,
				SessionTabContent: true,
				WorkspaceTopMenu: true,
				Separator: true,
				Badge: true,
				Tooltip: { template: "<div><slot /></div>" },
				TooltipTrigger: { template: "<div><slot /></div>" },
				TooltipContent: { template: "<div><slot /></div>" },
			},
		},
	});

describe("WorkspacePage note close protection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("blocks closing a file tab while save status is risky", async () => {
		const wrapper = mountWorkspace();
		await wrapper.getComponent(FileTreePanelStub).vm.$emit("select", {
			kind: "file",
			path: "/workspace/笔记/test.md",
			name: "test.md",
		});
		await vi.waitFor(() => {
			expect(wrapper.find('[data-test="content-area"]').exists()).toBe(true);
		});
		const contentArea = wrapper.findComponent({ name: "WorkspaceContentArea" });
		await contentArea.vm.$emit("save-status", "/workspace/笔记/test.md", "unsaved");
		await wrapper.findComponent({ name: "SplitGrid" }).vm.$emit("close-tab", "sp-1", "/workspace/笔记/test.md");

		expect(toast.error).toHaveBeenCalledWith(
			"笔记尚未保存完成",
			expect.objectContaining({ description: expect.any(String) }),
		);
	});
});
