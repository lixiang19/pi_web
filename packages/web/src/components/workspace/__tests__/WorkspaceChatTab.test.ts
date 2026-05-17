import { computed, defineComponent, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkspaceChatTab from "../WorkspaceChatTab.vue";
import type { ResourceCatalogResponse } from "@/lib/types";
import type { GitRepositoryStatus } from "@/composables/useGitRepositoryStatus";

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
const refreshResources = vi.fn();
const mockActiveSession = ref<Record<string, unknown> | null>(null);
const mockResources = ref<ResourceCatalogResponse>({
	prompts: [],
	skills: [],
	commands: [],
	diagnostics: {
		prompts: [],
		skills: [],
		commands: [],
	},
});
const mockGitStatus = ref<GitRepositoryStatus>({
	isRepository: true,
	engine: "cli" as const,
	canCommit: true,
	canPushPull: true,
	canWorktree: true,
	label: "Git",
});

vi.mock("@/composables/usePerSessionChat", () => ({
	usePerSessionChat: () => ({
		sessionId: computed(() => "session-home-first"),
		status: computed(() => "idle"),
		activeSession: computed(() => mockActiveSession.value),
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
			resources: mockResources,
			resourceError: ref(""),
			refreshResources,
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
		status: computed(() => mockGitStatus.value),
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
		mockActiveSession.value = null;
		refreshResources.mockImplementation(async () => mockResources.value);
		refreshResources.mockClear();
		mockResources.value = {
			prompts: [],
			skills: [],
			commands: [],
			diagnostics: {
				prompts: [],
				skills: [],
				commands: [],
			},
		};
		mockGitStatus.value = {
			isRepository: true,
			engine: "cli",
			canCommit: true,
			canPushPull: true,
			canWorktree: true,
			label: "Git",
		};
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
					WorkbenchVersionPanel: true,
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

	it("keeps task sessions from edit and retry actions", async () => {
		mockActiveSession.value = {
			id: "session-task",
			taskId: "task-1",
			sessionType: "task",
		};

		const wrapper = mount(WorkspaceChatTab, {
			props: {
				sessionId: "session-task",
				workspaceDir: "/tmp/project",
			},
			global: {
				stubs: {
					WorkbenchChatPanel: defineComponent({
						name: "WorkbenchChatPanel",
						props: ["isForkDisabled", "forkDisabledReason"],
						emits: ["editMessage", "retryMessage"],
						template: `
							<div>
								<p data-test="fork-disabled">{{ String(isForkDisabled) }}</p>
								<p data-test="fork-reason">{{ forkDisabledReason }}</p>
								<button data-test="edit" @click="$emit('editMessage', 'hello')">edit</button>
								<button data-test="retry" @click="$emit('retryMessage', 'hello')">retry</button>
							</div>
						`,
					}),
					WorkspaceFileTree: true,
					WorkbenchGitPanel: true,
					WorkbenchVersionPanel: true,
					Tabs: { template: "<div><slot /></div>" },
					TabsList: { template: "<div><slot /></div>" },
					TabsTrigger: { template: "<button><slot /></button>" },
					TabsContent: { template: "<div><slot /></div>" },
					ScrollArea: { template: "<div><slot /></div>" },
					Separator: true,
				},
			},
		});

		await nextTick();

		expect(wrapper.get('[data-test="fork-disabled"]').text()).toBe("true");
		expect(wrapper.get('[data-test="fork-reason"]').text()).toBe("任务处理会话不支持编辑/重试");

		await wrapper.get('[data-test="edit"]').trigger("click");
		await wrapper.get('[data-test="retry"]').trigger("click");

		expect(openSessionDraft).not.toHaveBeenCalled();
	});

	it("connects the workspace chat resource picker to the current resource catalog", async () => {
		mockResources.value = {
			prompts: [
				{
					name: "daily-plan",
					description: "生成今日计划",
					content: "请基于当前上下文规划今天任务",
				},
			],
			skills: [
				{
					name: "deep-review",
					description: "深度审查",
					invocation: "$deep-review",
					disableModelInvocation: false,
				},
			],
			commands: [
				{
					name: "summarize",
					description: "总结当前会话",
					source: "extension",
				},
			],
			diagnostics: {
				prompts: [],
				skills: [],
				commands: [],
			},
		};

		const wrapper = mount(WorkspaceChatTab, {
			props: {
				sessionId: "session-home-first",
				workspaceDir: "/tmp/project",
			},
			global: {
				stubs: {
					WorkbenchChatPanel: defineComponent({
						name: "WorkbenchChatPanel",
						props: [
							"commands",
							"hasVisibleResources",
							"isResourcePickerVisible",
							"prompts",
							"skills",
						],
						emits: [
							"applyPrompt",
							"injectCommand",
							"injectSkill",
							"toggleResourcePicker",
						],
						template: `
							<div>
								<button data-test="toggle-resource" @click="$emit('toggleResourcePicker')">resources</button>
								<button data-test="apply-prompt" @click="$emit('applyPrompt', prompts[0])">prompt</button>
								<button data-test="inject-skill" @click="$emit('injectSkill', skills[0].invocation)">skill</button>
								<button data-test="inject-command" @click="$emit('injectCommand', commands[0].name)">command</button>
							</div>
						`,
					}),
					WorkspaceFileTree: true,
					WorkbenchGitPanel: true,
					WorkbenchVersionPanel: true,
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
		await nextTick();

		const chatPanel = wrapper.findComponent({ name: "WorkbenchChatPanel" });
		expect(chatPanel.props("commands")).toEqual(mockResources.value.commands);
		expect(chatPanel.props("prompts")).toEqual(mockResources.value.prompts);
		expect(chatPanel.props("skills")).toEqual(mockResources.value.skills);
		expect(chatPanel.props("hasVisibleResources")).toBe(true);

		await wrapper.get('[data-test="toggle-resource"]').trigger("click");
		expect(refreshResources).toHaveBeenCalledWith({
			cwd: "/tmp/project",
			sessionId: "session-home-first",
		});

		await nextTick();
		expect(chatPanel.props("isResourcePickerVisible")).toBe(true);

		await wrapper.get('[data-test="apply-prompt"]').trigger("click");
		expect(mockComposer.draftText).toBe("请基于当前上下文规划今天任务");

		await wrapper.get('[data-test="inject-skill"]').trigger("click");
		expect(mockComposer.draftText).toBe("请基于当前上下文规划今天任务 $deep-review ");

		await wrapper.get('[data-test="inject-command"]').trigger("click");
		expect(mockComposer.draftText).toBe("请基于当前上下文规划今天任务 $deep-review /summarize ");
	});

	it("keeps Git and workspace versions as separate right sidebar tabs", () => {
		const wrapper = mount(WorkspaceChatTab, {
			props: {
				sessionId: "session-home-first",
				workspaceDir: "/tmp/project",
			},
			global: {
				stubs: {
					WorkbenchChatPanel: true,
					WorkspaceFileTree: true,
					WorkbenchGitPanel: true,
					WorkbenchVersionPanel: true,
					Tabs: { template: "<div><slot /></div>" },
					TabsList: { template: "<div><slot /></div>" },
					TabsTrigger: { template: "<button><slot /></button>" },
					TabsContent: { template: "<div><slot /></div>" },
					ScrollArea: { template: "<div><slot /></div>" },
					Separator: true,
				},
			},
		});

		const tabLabels = wrapper.findAll("button").map((button) => button.text());
		expect(tabLabels).toContain("Git");
		expect(tabLabels).toContain("版本");
	});

	it("hides the Git tab when the current directory is not a real Git repository", () => {
		mockGitStatus.value = {
			isRepository: false,
			engine: "none",
			canCommit: false,
			canPushPull: false,
			canWorktree: false,
			label: "非 Git 仓库",
		};

		const wrapper = mount(WorkspaceChatTab, {
			props: {
				sessionId: "session-home-first",
				workspaceDir: "/tmp/project",
			},
			global: {
				stubs: {
					WorkbenchChatPanel: true,
					WorkspaceFileTree: true,
					WorkbenchGitPanel: true,
					WorkbenchVersionPanel: true,
					Tabs: { template: "<div><slot /></div>" },
					TabsList: { template: "<div><slot /></div>" },
					TabsTrigger: { template: "<button><slot /></button>" },
					TabsContent: { template: "<div><slot /></div>" },
					ScrollArea: { template: "<div><slot /></div>" },
					Separator: true,
				},
			},
		});

		const tabLabels = wrapper.findAll("button").map((button) => button.text());
		expect(tabLabels).toEqual(expect.arrayContaining(["摘要", "文件", "版本"]));
		expect(tabLabels).not.toContain("Git");
	});

	it("submits the main workspace chat draft after prompt skill and command injection", async () => {
		mockResources.value = {
			prompts: [
				{
					name: "daily-plan",
					description: "生成今日计划",
					content: "请基于当前上下文规划今天任务",
				},
			],
			skills: [
				{
					name: "deep-review",
					description: "深度审查",
					invocation: "$deep-review",
					disableModelInvocation: false,
				},
			],
			commands: [
				{
					name: "summarize",
					description: "总结当前会话",
					source: "extension",
				},
			],
			diagnostics: {
				prompts: [],
				skills: [],
				commands: [],
			},
		};

		const wrapper = mount(WorkspaceChatTab, {
			props: {
				sessionId: "session-home-first",
				workspaceDir: "/tmp/project",
			},
			global: {
				stubs: {
					WorkbenchChatPanel: defineComponent({
						name: "WorkbenchChatPanel",
						props: ["commands", "prompts", "skills"],
						emits: [
							"applyPrompt",
							"injectCommand",
							"injectSkill",
							"submit",
						],
						template: `
							<div>
								<button data-test="apply-prompt" @click="$emit('applyPrompt', prompts[0])">prompt</button>
								<button data-test="inject-skill" @click="$emit('injectSkill', skills[0].invocation)">skill</button>
								<button data-test="inject-command" @click="$emit('injectCommand', commands[0].name)">command</button>
								<button data-test="submit" @click="$emit('submit')">submit</button>
							</div>
						`,
					}),
					WorkspaceFileTree: true,
					WorkbenchGitPanel: true,
					WorkbenchVersionPanel: true,
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
		await nextTick();

		await wrapper.get('[data-test="apply-prompt"]').trigger("click");
		await wrapper.get('[data-test="inject-skill"]').trigger("click");
		await wrapper.get('[data-test="inject-command"]').trigger("click");
		await wrapper.get('[data-test="submit"]').trigger("click");

		expect(mockComposer.draftText).toBe("请基于当前上下文规划今天任务 $deep-review /summarize ");
		expect(submit).toHaveBeenCalledOnce();
		expect(submit).toHaveBeenCalledWith();
	});

	it("shows the real empty resource catalog state without fake resource entries", async () => {
		const wrapper = mount(WorkspaceChatTab, {
			props: {
				sessionId: "session-home-first",
				workspaceDir: "/tmp/project",
			},
			global: {
				stubs: {
					WorkbenchChatPanel: defineComponent({
						name: "WorkbenchChatPanel",
						props: [
							"commands",
							"hasVisibleResources",
							"prompts",
							"skills",
						],
						template: `
							<div>
								<p data-test="has-resources">{{ String(hasVisibleResources) }}</p>
								<p data-test="command-count">{{ commands.length }}</p>
								<p data-test="prompt-count">{{ prompts.length }}</p>
								<p data-test="skill-count">{{ skills.length }}</p>
							</div>
						`,
					}),
					WorkspaceFileTree: true,
					WorkbenchGitPanel: true,
					WorkbenchVersionPanel: true,
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
		await nextTick();

		const chatPanel = wrapper.findComponent({ name: "WorkbenchChatPanel" });
		expect(chatPanel.props("hasVisibleResources")).toBe(false);
		expect(chatPanel.props("commands")).toEqual([]);
		expect(chatPanel.props("prompts")).toEqual([]);
		expect(chatPanel.props("skills")).toEqual([]);
		expect(wrapper.get('[data-test="has-resources"]').text()).toBe("false");
		expect(wrapper.get('[data-test="command-count"]').text()).toBe("0");
		expect(wrapper.get('[data-test="prompt-count"]').text()).toBe("0");
		expect(wrapper.get('[data-test="skill-count"]').text()).toBe("0");
		expect(wrapper.text()).toContain("无可用资源");
	});
});
