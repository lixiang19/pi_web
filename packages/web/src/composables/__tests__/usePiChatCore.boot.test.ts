import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSystemInfo = vi.fn();
const mockGetProviders = vi.fn();
const mockGetSessions = vi.fn();
const mockGetSessionContexts = vi.fn();
const mockGetAgents = vi.fn();
const mockGetResources = vi.fn();
const mockRenameSession = vi.fn();
const mockUpdateSession = vi.fn();
const mockSettingsLoad = vi.fn();

vi.mock("@/lib/api", () => ({
	getSystemInfo: mockGetSystemInfo,
	getProviders: mockGetProviders,
	getSessions: mockGetSessions,
	getSessionContexts: mockGetSessionContexts,
	getAgents: mockGetAgents,
	getResources: mockGetResources,
	renameSession: mockRenameSession,
	updateSession: mockUpdateSession,
}));

vi.mock("@/stores/settings", () => ({
	useSettingsStore: () => ({
		isLoaded: true,
		defaultModel: "",
		defaultAgent: "",
		defaultThinkingLevel: "medium",
		load: mockSettingsLoad,
	}),
}));

const providersPayload = {
	providers: [
		{
			id: "aurora",
			name: "Aurora",
			models: {
				"kimi2.6": {
					id: "kimi2.6",
					name: "kimi2.6",
					reasoning: true,
				},
			},
		},
	],
	default: { chat: "aurora/kimi2.6" },
};

describe("usePiChatCore boot timing", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mockGetSystemInfo.mockResolvedValue({
			workspaceDir: "/ws",
			chatProjectId: "chat",
			chatProjectPath: "/ws",
			chatProjectLabel: "聊天",
		});
		mockGetProviders.mockResolvedValue(providersPayload);
		mockGetSessions.mockResolvedValue([]);
		mockGetSessionContexts.mockResolvedValue({});
		mockGetAgents.mockResolvedValue([
			{
				name: "assistant",
				description: "通用助手 agent",
				displayName: "Assistant",
				mode: "all",
				enabled: true,
				sourceScope: "user",
				source: "/Users/lixiang/.pi/agent/agents/assistant.md",
			},
		]);
		mockGetResources.mockResolvedValue({
			prompts: [],
			skills: [],
			commands: [],
			diagnostics: { prompts: [], skills: [], commands: [] },
		});
	});

	it("does not request authenticated chat resources at module import time", async () => {
		const mod = await import("@/composables/usePiChatCore");

		expect(mockGetProviders).not.toHaveBeenCalled();
		expect(mockGetAgents).not.toHaveBeenCalled();

		const core = mod.usePiChatCore();
		await core.bootPromise.value;

		expect(mockGetProviders).toHaveBeenCalledTimes(1);
		expect(mockGetAgents).toHaveBeenCalledTimes(1);
		expect(core.models.value).toEqual([
			{ label: "Aurora / kimi2.6", value: "aurora/kimi2.6" },
		]);
		expect(core.agents.value[0]?.name).toBe("assistant");
	});
});
