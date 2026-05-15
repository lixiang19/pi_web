import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePerSessionChat } from "@/composables/usePerSessionChat";
import type { ThinkingLevel, UiSessionSnapshot } from "@/lib/types";

const mockSessions = ref<Array<{ id: string; title?: string; cwd?: string; agent?: string; model?: string; thinkingLevel?: string; taskId?: string; sessionType?: string; archived?: boolean }>>([]);
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
    syncSessions: vi.fn(),
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

class MockEventSource {
  static urls: string[] = [];
  url: string;
  constructor(url: string) {
    this.url = url;
    MockEventSource.urls.push(url);
  }
  close = vi.fn();
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
}
(globalThis as unknown as Record<string, unknown>)['EventSource'] = MockEventSource;

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

const { sendMessage } = await import("@/lib/api");

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
    MockEventSource.urls = [];
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

  it("subscribes to the session events endpoint when loading a session", async () => {
    const sessionIdRef = ref("session-events");
    const chat = usePerSessionChat(sessionIdRef);

    mockSessionCache.value = {
      "session-events": {
        snapshot: {
          id: "session-events",
          messages: [],
          historyMeta: { loadedRounds: 3, totalRounds: 3, hasMoreAbove: false, roundWindow: 3 },
          status: "idle",
          cwd: "/workspace",
          updatedAt: Date.now(),
        } as unknown as UiSessionSnapshot,
      },
    };

    await chat.loadSession("session-events");

    expect(MockEventSource.urls.at(-1)).toBe("/api/sessions/session-events/events?rounds=3");
  });
});

describe("usePerSessionChat - forkSession", () => {
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

  it("forkSession creates new session with parentSessionId", async () => {
    const sessionIdRef = ref("session-1");
    const chat = usePerSessionChat(sessionIdRef);

    mockSessions.value = [
      { id: "session-1", title: "Original", cwd: "/workspace", model: "m1", agent: "a1", thinkingLevel: "low" },
    ];
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

    const result = await chat.forkSession({ prompt: "forked prompt" });

    expect(result).not.toBeNull();
    expect(result?.id).toBe("new-session");
  });

  it("forkSession returns null when no current session", async () => {
    const sessionIdRef = ref("");
    const chat = usePerSessionChat(sessionIdRef);

    const result = await chat.forkSession({ prompt: "forked prompt" });

    expect(result).toBeNull();
  });

  it("activeSession exposes taskId and sessionType", async () => {
    const sessionIdRef = ref("session-task");
    const chat = usePerSessionChat(sessionIdRef);

    mockSessions.value = [
      { id: "session-task", title: "Task Session", cwd: "/workspace", taskId: "task-1", sessionType: "task" } as unknown as typeof mockSessions.value[number],
    ];
    mockSessionCache.value = {
      "session-task": {
        snapshot: {
          id: "session-task",
          messages: [],
          historyMeta: { loadedRounds: 0, totalRounds: 0, hasMoreAbove: false, roundWindow: 3 },
          status: "idle",
          cwd: "/workspace",
          updatedAt: Date.now(),
        } as unknown as UiSessionSnapshot,
      },
    };

    expect(chat.activeSession.value).toBeDefined();
    expect(chat.activeSession.value?.id).toBe("session-task");
    expect((chat.activeSession.value as unknown as { taskId?: string }).taskId).toBe("task-1");
    expect((chat.activeSession.value as unknown as { sessionType?: string }).sessionType).toBe("task");
  });

  it("submits task sessions with task-agent even when task-agent is not in normal agents", async () => {
    const sessionIdRef = ref("session-task");
    const chat = usePerSessionChat(sessionIdRef);

    mockModels.value = [{ value: "default-model", label: "Default model" }];
    mockDefaultModel.value = "default-model";
    mockAgents.value = [{ name: "general-agent" }];
    mockSessions.value = [
      {
        id: "session-task",
        title: "Task Session",
        cwd: "/workspace",
        agent: "task-agent",
        taskId: "task-1",
        sessionType: "task",
      } as unknown as typeof mockSessions.value[number],
    ];
    mockSessionCache.value = {
      "session-task": {
        snapshot: {
          id: "session-task",
          title: "Task Session",
          messages: [],
          historyMeta: { loadedRounds: 0, totalRounds: 0, hasMoreAbove: false, roundWindow: 3 },
          status: "idle",
          cwd: "/workspace",
          agent: "task-agent",
          updatedAt: Date.now(),
        } as unknown as UiSessionSnapshot,
      },
    };
    mockSyncComposerSelection.mockImplementation((composer, snapshot) => {
      composer.selectedAgent = (snapshot as { agent?: string }).agent || "";
    });

    await chat.loadSession("session-task");
    chat.composer.draftText = "继续处理任务";
    await chat.submit();

    expect(chat.error.value).toBe("");
    expect(sendMessage).toHaveBeenCalledWith(
      "session-task",
      expect.objectContaining({
        prompt: "继续处理任务",
        agent: "task-agent",
      }),
    );
  });

  it("submits the injected main-session draft as the sendMessage payload", async () => {
    const sessionIdRef = ref("session-main");
    const chat = usePerSessionChat(sessionIdRef);

    mockModels.value = [{ value: "default-model", label: "Default model" }];
    mockDefaultModel.value = "default-model";
    mockAgents.value = [{ name: "general-agent" }];
    mockSessions.value = [
      {
        id: "session-main",
        title: "Main Session",
        cwd: "/workspace",
      },
    ];
    mockSessionCache.value = {
      "session-main": {
        snapshot: {
          id: "session-main",
          title: "Main Session",
          messages: [],
          historyMeta: { loadedRounds: 0, totalRounds: 0, hasMoreAbove: false, roundWindow: 3 },
          status: "idle",
          cwd: "/workspace",
          updatedAt: Date.now(),
        } as unknown as UiSessionSnapshot,
      },
    };

    await chat.loadSession("session-main");
    chat.composer.draftText = "请基于当前上下文规划今天任务 $deep-review /summarize ";
    chat.composer.selectedAgent = "general-agent";
    chat.composer.selectedModel = "gpt-5.4";
    chat.composer.selectedThinkingLevel = "high";

    await chat.submit();

    expect(sendMessage).toHaveBeenCalledWith("session-main", {
      prompt: "请基于当前上下文规划今天任务 $deep-review /summarize",
      model: "gpt-5.4",
      thinkingLevel: "high",
      agent: "general-agent",
    });
  });
});

describe("usePerSessionChat - archived readonly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessions.value = [];
    mockSessionCache.value = {};
    mockAgents.value = [];
    mockModels.value = [{ value: "default-model", label: "Default model" }];
    mockDefaultModel.value = "default-model";
  });

  it("marks archived sessions readonly and preserves draft instead of sending", async () => {
    const sessionIdRef = ref("session-archived");
    const chat = usePerSessionChat(sessionIdRef);

    mockSessions.value = [
      {
        id: "session-archived",
        title: "Archived session",
        cwd: "/workspace",
        archived: true,
      },
    ];
    mockSessionCache.value = {
      "session-archived": {
        snapshot: {
          id: "session-archived",
          title: "Archived session",
          archived: true,
          messages: [],
          historyMeta: { loadedRounds: 0, totalRounds: 0, hasMoreAbove: false, roundWindow: 3 },
          status: "idle",
          cwd: "/workspace",
          updatedAt: Date.now(),
        } as unknown as UiSessionSnapshot,
      },
    };

    await chat.loadSession("session-archived");
    chat.composer.draftText = "should stay in draft";
    await chat.submit();

    expect(chat.composer.isDisabled).toBe(true);
    expect(chat.composer.draftText).toBe("should stay in draft");
    expect(chat.error.value).toBe("归档会话只读，不能继续发送");
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
