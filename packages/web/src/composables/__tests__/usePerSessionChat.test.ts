import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePerSessionChat } from "@/composables/usePerSessionChat";
import type { ThinkingLevel, UiSessionSnapshot } from "@/lib/types";

const mockSessions = ref<Array<{ id: string; title?: string; cwd?: string; agent?: string; model?: string; thinkingLevel?: string }>>([]);
const mockSessionCache = ref<Record<string, { snapshot?: UiSessionSnapshot }>>({});
const mockAgents = ref<Array<{ name: string; model?: string; thinking?: string }>>([]);
const mockModels = ref<Array<{ value: string; label: string }>>([]);
const mockDefaultModel = ref("default-model");

const mockRefreshSessions = vi.fn();
const mockRefreshSessionContexts = vi.fn();
const mockRefreshAgents = vi.fn();
const mockRefreshResources = vi.fn();
const mockApplySelectionUpdate = vi.fn();
const mockSyncComposerSelection = vi.fn();

const mockSettingsStore = {
  defaultModel: "global-model",
  defaultAgent: "global-agent",
  defaultThinkingLevel: "medium",
  setDefaultModel: vi.fn(),
  setDefaultAgent: vi.fn(),
  setDefaultThinkingLevel: vi.fn(),
};

vi.mock("@/stores/settings", () => ({
  useSettingsStore: () => mockSettingsStore,
}));

vi.mock("@/composables/usePiChatCore", () => ({
  usePiChatCore: () => ({
    sessions: mockSessions,
    sessionContexts: { value: {} },
    sessionCache: mockSessionCache,
    agents: mockAgents,
    models: mockModels,
    defaultModel: mockDefaultModel,
    refreshSessions: mockRefreshSessions,
    refreshSessionContexts: mockRefreshSessionContexts,
    refreshAgents: mockRefreshAgents,
    refreshResources: mockRefreshResources,
    applySelectionUpdate: mockApplySelectionUpdate,
    syncComposerSelection: mockSyncComposerSelection,
    syncComposerDraftState: vi.fn(),
    getCachedSessionSnapshot: (sid: string) => mockSessionCache.value[sid]?.snapshot ?? null,
    createHistoryMeta: vi.fn(() => ({ loadedRounds: 0, totalRounds: 0, hasMoreAbove: false, roundWindow: 3 })),
    expandVisibleHistoryMeta: vi.fn((meta) => meta),
    patchSessionSummary: vi.fn(),
    patchSessionSnapshot: vi.fn(),
    patchSessionSummarySimple: vi.fn(),
    appendMessageToSession: vi.fn(),
    restorePendingDraft: vi.fn(),
    clearPendingDraft: vi.fn(),
    createLocalId: vi.fn(() => "local-id"),
    createRawMessage: vi.fn(),
    parseAgentMention: vi.fn(() => ""),
    hydrateSession: vi.fn(async (sid: string) => ({
      id: sid,
      messages: [],
      historyMeta: { loadedRounds: 0, totalRounds: 0, hasMoreAbove: false, roundWindow: 3 },
      status: "idle",
      cwd: "/workspace",
      updatedAt: Date.now(),
    } as unknown as UiSessionSnapshot)),
    prefetchNeighborSessions: vi.fn(),
  }),
}));

vi.mock("@/lib/api", () => ({
  abortSession: vi.fn(),
  createSession: vi.fn(async () => ({
    id: "new-session",
    title: "New Session",
    status: "idle",
    cwd: "/workspace",
    messages: [],
    historyMeta: { loadedRounds: 0, totalRounds: 0, hasMoreAbove: false, roundWindow: 3 },
    updatedAt: Date.now(),
  })),
  getSessionMessages: vi.fn(async () => ({
    messages: [],
    historyMeta: { loadedRounds: 0, totalRounds: 0, hasMoreAbove: false, roundWindow: 3 },
    interactiveRequests: [],
    permissionRequests: [],
  })),
  respondToAsk: vi.fn(),
  respondToPermissionRequest: vi.fn(),
  sendMessage: vi.fn(),
}));

describe("usePerSessionChat - temporary selection does NOT write global settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessions.value = [];
    mockSessionCache.value = {};
    mockAgents.value = [];
    mockModels.value = [];
    mockSettingsStore.defaultModel = "global-model";
    mockSettingsStore.defaultAgent = "global-agent";
    mockSettingsStore.defaultThinkingLevel = "medium";
  });

  it("setSelectedModel updates composer but does NOT call settingsStore.setDefaultModel", async () => {
    const sessionIdRef = ref("session-1");
    const chat = usePerSessionChat(sessionIdRef);

    mockSessionCache.value = {
      "session-1": {
        snapshot: {
          id: "session-1",
          messages: [],
          historyMeta: { loadedRounds: 0, totalRounds: 0, hasMoreAbove: false, roundWindow: 3 },
          status: "idle",
          cwd: "/workspace",
          updatedAt: Date.now(),
        } as unknown as UiSessionSnapshot,
      },
    };

    await chat.setSelectedModel("temp-model");

    expect(chat.composer.selectedModel).toBe("temp-model");
    expect(mockSettingsStore.setDefaultModel).not.toHaveBeenCalled();
    expect(mockApplySelectionUpdate).toHaveBeenCalledWith("session-1", { model: "temp-model" });
  });

  it("setSelectedAgent updates composer but does NOT call settingsStore.setDefaultAgent", async () => {
    const sessionIdRef = ref("session-1");
    const chat = usePerSessionChat(sessionIdRef);

    mockSessionCache.value = {
      "session-1": {
        snapshot: {
          id: "session-1",
          messages: [],
          historyMeta: { loadedRounds: 0, totalRounds: 0, hasMoreAbove: false, roundWindow: 3 },
          status: "idle",
          cwd: "/workspace",
          updatedAt: Date.now(),
        } as unknown as UiSessionSnapshot,
      },
    };

    await chat.setSelectedAgent("temp-agent");

    expect(chat.composer.selectedAgent).toBe("temp-agent");
    expect(mockSettingsStore.setDefaultAgent).not.toHaveBeenCalled();
    expect(mockApplySelectionUpdate).toHaveBeenCalledWith("session-1", { agent: "temp-agent" });
  });

  it("setSelectedThinkingLevel updates composer but does NOT call settingsStore.setDefaultThinkingLevel", async () => {
    const sessionIdRef = ref("session-1");
    const chat = usePerSessionChat(sessionIdRef);

    mockSessionCache.value = {
      "session-1": {
        snapshot: {
          id: "session-1",
          messages: [],
          historyMeta: { loadedRounds: 0, totalRounds: 0, hasMoreAbove: false, roundWindow: 3 },
          status: "idle",
          cwd: "/workspace",
          updatedAt: Date.now(),
        } as unknown as UiSessionSnapshot,
      },
    };

    await chat.setSelectedThinkingLevel("high" as ThinkingLevel);

    expect(chat.composer.selectedThinkingLevel).toBe("high");
    expect(mockSettingsStore.setDefaultThinkingLevel).not.toHaveBeenCalled();
    expect(mockApplySelectionUpdate).toHaveBeenCalledWith("session-1", { thinkingLevel: "high" });
  });

  it("setSelectedModel on draft session does NOT call settingsStore or API", async () => {
    const sessionIdRef = ref("");
    const chat = usePerSessionChat(sessionIdRef);

    await chat.setSelectedModel("draft-model");

    expect(chat.composer.selectedModel).toBe("draft-model");
    expect(mockSettingsStore.setDefaultModel).not.toHaveBeenCalled();
    expect(mockApplySelectionUpdate).not.toHaveBeenCalled();
  });
});
