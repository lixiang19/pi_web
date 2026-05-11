import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePerSessionChat } from "@/composables/usePerSessionChat";
import type { ThinkingLevel, UiSessionSnapshot } from "@/lib/types";

const mockSessions = ref<Array<{ id: string; title?: string; cwd?: string; agent?: string; model?: string; thinkingLevel?: string; archived?: boolean; readonly?: boolean; taskId?: string; sessionType?: string }>>([]);
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
    syncSessions: vi.fn(),
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

class MockEventSource {
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close() {}
}

Object.defineProperty(globalThis, "EventSource", { value: MockEventSource });

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

  it("isReadonly disables composer when session is archived", async () => {
    mockSessions.value = [{ id: "session-archived", title: "Archived", archived: true, readonly: true, cwd: "/workspace" }];
    const sessionIdRef = ref("session-archived");
    const chat = usePerSessionChat(sessionIdRef);
    expect(chat.isReadonly.value).toBe(true);
    expect(chat.composer.isDisabled).toBe(true);
  });

  it("isReadonly disables composer when session is readonly", async () => {
    mockSessions.value = [{ id: "session-ro", title: "RO", archived: false, readonly: true, cwd: "/workspace" }];
    const sessionIdRef = ref("session-ro");
    const chat = usePerSessionChat(sessionIdRef);
    expect(chat.isReadonly.value).toBe(true);
    expect(chat.composer.isDisabled).toBe(true);
  });

  it("forkFromUserMessage returns undefined for readonly session", async () => {
    mockSessions.value = [{ id: "session-ro", title: "RO", archived: false, readonly: true, cwd: "/workspace" }];
    mockSessionCache.value = {
      "session-ro": {
        snapshot: {
          id: "session-ro",
          messages: [
            { message: { role: "user", content: "hello", timestamp: Date.now() }, localId: "u1" },
          ],
          historyMeta: { loadedRounds: 1, totalRounds: 1, hasMoreAbove: false, roundWindow: 3 },
          status: "idle",
          cwd: "/workspace",
          updatedAt: Date.now(),
        } as unknown as UiSessionSnapshot,
      },
    };
    const sessionIdRef = ref("session-ro");
    const chat = usePerSessionChat(sessionIdRef);
    const result = await chat.forkFromUserMessage(0);
    expect(result).toBeUndefined();
  });

  it("forkFromUserMessage supports editing with new text", async () => {
    mockSessions.value = [{ id: "session-edit", title: "Edit", archived: false, readonly: false, cwd: "/workspace" }];
    mockSessionCache.value = {
      "session-edit": {
        snapshot: {
          id: "session-edit",
          messages: [
            { message: { role: "user", content: "original", timestamp: Date.now() }, localId: "u1" },
          ],
          historyMeta: { loadedRounds: 1, totalRounds: 1, hasMoreAbove: false, roundWindow: 3 },
          status: "idle",
          cwd: "/workspace",
          updatedAt: Date.now(),
        } as unknown as UiSessionSnapshot,
      },
    };
    const sessionIdRef = ref("session-edit");
    const chat = usePerSessionChat(sessionIdRef);
    const result = await chat.forkFromUserMessage(0, "edited text");
    expect(result).not.toBeUndefined();
  });

  it("isTaskSession is true when session has taskId", async () => {
    mockSessions.value = [{ id: "session-task", title: "Task", archived: false, readonly: false, cwd: "/workspace", taskId: "task-1" }];
    const sessionIdRef = ref("session-task");
    const chat = usePerSessionChat(sessionIdRef);
    expect(chat.isTaskSession.value).toBe(true);
  });

  it("isTaskSession is true when sessionType is task", async () => {
    mockSessions.value = [{ id: "session-task2", title: "Task", archived: false, readonly: false, cwd: "/workspace", sessionType: "task" }];
    const sessionIdRef = ref("session-task2");
    const chat = usePerSessionChat(sessionIdRef);
    expect(chat.isTaskSession.value).toBe(true);
  });

  it("submit does not call sendMessage or createSession for readonly session", async () => {
    const { sendMessage, createSession } = await import("@/lib/api");
    mockSessions.value = [{ id: "session-ro-submit", title: "RO", archived: false, readonly: true, cwd: "/workspace" }];
    mockSessionCache.value = {
      "session-ro-submit": {
        snapshot: {
          id: "session-ro-submit",
          messages: [],
          historyMeta: { loadedRounds: 0, totalRounds: 0, hasMoreAbove: false, roundWindow: 3 },
          status: "idle",
          cwd: "/workspace",
          updatedAt: Date.now(),
        } as unknown as UiSessionSnapshot,
      },
    };
    const sessionIdRef = ref("session-ro-submit");
    const chat = usePerSessionChat(sessionIdRef);

    chat.composer.draftText = "should not send";
    await chat.submit();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("submit does not call sendMessage or createSession when composer.isDisabled", async () => {
    const { sendMessage, createSession } = await import("@/lib/api");
    mockSessions.value = [{ id: "session-disabled", title: "Disabled", archived: false, readonly: false, cwd: "/workspace" }];
    mockSessionCache.value = {
      "session-disabled": {
        snapshot: {
          id: "session-disabled",
          messages: [],
          historyMeta: { loadedRounds: 0, totalRounds: 0, hasMoreAbove: false, roundWindow: 3 },
          status: "idle",
          cwd: "/workspace",
          updatedAt: Date.now(),
        } as unknown as UiSessionSnapshot,
      },
    };
    const sessionIdRef = ref("session-disabled");
    const chat = usePerSessionChat(sessionIdRef);

    chat.composer.isDisabled = true;
    chat.composer.draftText = "should not send";
    await chat.submit();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });
});
