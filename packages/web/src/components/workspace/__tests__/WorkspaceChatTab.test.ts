import { computed, ref } from "vue";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkspaceChatTab from "../WorkspaceChatTab.vue";

const mockComposer = {
	draftText: "",
	isSending: false,
	canAbort: false,
	selectedModel: "",
	selectedThinkingLevel: "medium",
	selectedAgent: "",
	hasDraft: false,
	isFocused: false,
	isDisabled: false,
	pendingPrompt: "",
};
const loadSession = vi.fn();
const openSessionDraft = vi.fn();
const submit = vi.fn();

vi.mock("@/composables/usePerSessionChat", () => ({
	usePerSessionChat: () => ({
		sessionId: computed(() => "session-home-first"),
		status: computed(() => "idle"),
		activeSession: computed(() => null),
		activeDraftContext: ref(null),
		currentSessionTitle: computed(() => "新会话"),
		isDraftSession: computed(() => false),
		isSending: computed(() => false),
		error: computed(() => ""),
		effectiveModel: computed(() => mockComposer.selectedModel),
		effectiveAgent: computed(() => mockComposer.selectedAgent),
		messages: ref([]),
		hasMoreAbove: computed(() => false),
		isLoadingOlder: computed(() => false),
		interactiveRequests: computed(() => []),
		permissionRequests: computed(() => []),
		fileTreeRoot: computed(() => "/tmp/project"),
		composer: mockComposer,
		core: {
			agents: ref([]),
			models: ref([]),
			resourceError: ref(""),
		},
		openSessionDraft,
		loadSession,
		loadEarlier: vi.fn(),
		dismissPendingAsk: vi.fn(),
		respondToPendingAsk: vi.fn(),
		respondToPendingPermission: vi.fn(),
		setDraftProjectPath: vi.fn(),
		setSelectedAgent: vi.fn(),
		setSelectedModel: vi.fn(),
		setSelectedThinkingLevel: vi.fn(),
		submit,
		abort: vi.fn(),
		forkSession: vi.fn(),
	}),
}));

vi.mock("@/composables/useGitRepositoryStatus", () => ({
	useGitRepositoryStatus: () => ({
		status: computed(() => ({
			branch: "",
			summary: { modified: 0, added: 0, deleted: 0, untracked: 0 },
		})),
		refresh: vi.fn(),
	}),
}));

describe("WorkspaceChatTab", () => {
	beforeEach(() => {
		mockComposer.draftText = "";
		mockComposer.selectedModel = "";
		mockComposer.selectedThinkingLevel = "medium";
		mockComposer.selectedAgent = "";
		loadSession.mockResolvedValue(undefined);
		loadSession.mockClear();
		openSessionDraft.mockResolvedValue(undefined);
		openSessionDraft.mockClear();
		submit.mockResolvedValue(undefined);
		submit.mockClear();
	});

	it("loads the session and auto-submits the home initial prompt with selected options", async () => {
		mount(WorkspaceChatTab, {
			props: {
				sessionId: "session-home-first",
				workspaceDir: "/tmp/project",
				initialPrompt: "整理当前项目",
				initialModel: "gpt-5.4",
				initialAgent: "planner",
				initialThinkingLevel: "high",
				initialAttachmentIds: ["attachment-1", "attachment-2"],
			},
			global: {
				stubs: {
					WorkbenchChatPanel: true,
					WorkspaceFileTree: true,
					WorkbenchGitPanel: true,
					Tabs: { template: "<div><slot /></div>" },
					TabsList: { template: "<div><slot /></div>" },
					TabsTrigger: { template: "<button><slot /></button>" },
					TabsContent: { template: "<div><slot /></div>" },
					ScrollArea: { template: "<div><slot /></div>" },
					Separator: true,
				},
			},
		});

		await Promise.resolve();
		await Promise.resolve();

		expect(loadSession).toHaveBeenCalledWith("session-home-first");
		expect(mockComposer.draftText).toBe("整理当前项目");
		expect(mockComposer.selectedModel).toBe("gpt-5.4");
		expect(mockComposer.selectedAgent).toBe("planner");
		expect(mockComposer.selectedThinkingLevel).toBe("high");
		expect(submit).toHaveBeenCalledWith(["attachment-1", "attachment-2"]);
	});
});
