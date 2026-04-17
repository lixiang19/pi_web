import {
  computed,
  reactive,
  ref,
  watch,
} from "vue";
import {
  getAgents,
  getProviders,
  getResources,
  getSessionContexts,
  getSessions,
  getSystemInfo,
  renameSession as renameSessionApi,
  updateSession,
} from "@/lib/api";
import type {
  AgentSummary,
  ChatComposerState,
  PiAssistantMessage,
  PiMessage,
  ProvidersResponse,
  ResourceCatalogResponse,
  SessionHistoryMeta,
  SessionContextSummary,
  SessionSummary,
  StreamMessageEvent,
  SystemInfo,
  ThinkingLevel,
  UiConversationMessage,
  UiSessionSnapshot,
} from "@/lib/types";
import { omitUndefined } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings";
import {
  buildSnapshotFromSummary as buildSharedSnapshotFromSummary,
  hydrateSessionSnapshot,
  patchSessionSnapshot as patchSharedSessionSnapshot,
  patchSessionSummary as patchSharedSessionSummary,
  syncSessionSnapshot,
  type CachedSessionEntry,
} from "@/composables/session-snapshot";
import { wrapUiSessionSnapshot } from "@/lib/conversation";

// ============================================================================
// 常量 & 工具函数
// ============================================================================

const createLocalId = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const fallbackSessionTitle = "新会话";
const draftStorageKey = "pi-web.chat-composer.drafts.v1";
const newSessionDraftKey = "__pi_new_session__";
const INITIAL_ROUND_WINDOW = 3;

const createEmptyResources = (): ResourceCatalogResponse => ({
  prompts: [],
  skills: [],
  commands: [],
  diagnostics: {
    prompts: [],
    skills: [],
    commands: [],
  },
});

const createRawMessage = (
  message?: StreamMessageEvent["message"],
  overrides?: Partial<PiMessage>,
): PiMessage => {
  if (message) {
    return {
      ...message,
      ...overrides,
    } as PiMessage;
  }

  if (overrides?.role === "toolResult") {
    return {
      role: "toolResult",
      toolCallId: overrides.toolCallId || "",
      toolName: overrides.toolName || "",
      content: Array.isArray(overrides.content) ? overrides.content : [],
      isError: overrides.isError ?? false,
      details: overrides.details,
      timestamp: overrides.timestamp ?? Date.now(),
    };
  }

  if (overrides?.role === "user") {
    return {
      role: "user",
      content:
        typeof overrides.content === "string" || Array.isArray(overrides.content)
          ? overrides.content
          : "",
      timestamp: overrides.timestamp ?? Date.now(),
    };
  }

  return {
    role: "assistant",
    content: Array.isArray(overrides?.content)
      ? (overrides.content as PiAssistantMessage["content"])
      : [],
    timestamp: overrides?.timestamp ?? Date.now(),
  } as PiMessage;
};

const loadDraftMap = () => {
  if (typeof window === "undefined") {
    return {} as Record<string, string>;
  }

  try {
    const raw = window.localStorage.getItem(draftStorageKey);
    if (!raw) {
      return {} as Record<string, string>;
    }

    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {} as Record<string, string>;
  }
};

const persistDraftMap = (drafts: Record<string, string>) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(draftStorageKey, JSON.stringify(drafts));
};

const getDraftKey = (sessionId: string | null | undefined) =>
  sessionId || newSessionDraftKey;

const countConversationRounds = (messages: UiConversationMessage[]) =>
  messages.filter((entry) => entry.message.role === "user").length;
const createHistoryMeta = (
  loadedRounds: number,
  totalRounds: number,
  roundWindow = INITIAL_ROUND_WINDOW,
): SessionHistoryMeta => ({
  loadedRounds,
  totalRounds,
  hasMoreAbove: totalRounds > loadedRounds,
  roundWindow,
});
const expandVisibleHistoryMeta = (
  historyMeta: SessionHistoryMeta,
  visibleMessages: UiConversationMessage[],
) => {
  const visibleRounds = countConversationRounds(visibleMessages);
  const hiddenRounds = Math.max(
    historyMeta.totalRounds - historyMeta.loadedRounds,
    0,
  );
  const totalRounds = hiddenRounds + visibleRounds;
  return createHistoryMeta(
    visibleRounds,
    totalRounds,
    Math.max(historyMeta.roundWindow, visibleRounds || historyMeta.roundWindow),
  );
};

const parseAgentMention = (text: string, agents: AgentSummary[]) => {
  const matches = text.matchAll(/(^|\s)@([a-z0-9-]+)/gi);

  for (const match of matches) {
    const candidate = match[2]?.toLowerCase();
    if (!candidate) {
      continue;
    }

    if (agents.some((agent) => agent.name === candidate)) {
      return candidate;
    }
  }

  return "";
};

// ============================================================================
// 模块级全局状态（所有标签页共享）
// ============================================================================

const info = ref<SystemInfo | null>(null);
const providers = ref<ProvidersResponse | null>(null);
const sessions = ref<SessionSummary[]>([]);
const sessionContexts = ref<Record<string, SessionContextSummary>>({});
const agents = ref<AgentSummary[]>([]);
const resources = ref<ResourceCatalogResponse>(createEmptyResources());
const resourceError = ref("");
const sessionCache = ref<Record<string, CachedSessionEntry>>({});
const sessionLoadingOlderById = ref<Record<string, boolean>>({});
const draftMap = ref<Record<string, string>>(loadDraftMap());

let suppressDraftPersistence = false;
const loadSessionInFlightById = new Map<string, Promise<UiSessionSnapshot>>();
const loadSessionRequestSeqById = new Map<string, number>();

const models = computed(() => {
  if (!providers.value) {
    return [];
  }

  return providers.value.providers.flatMap((provider) =>
    Object.values(provider.models).map((model) => ({
      value: `${provider.id}/${model.id}`,
      label: `${provider.name} / ${model.name}`,
    })),
  );
});

const defaultModel = computed(
  () => providers.value?.default.chat ?? models.value[0]?.value ?? "",
);

// ============================================================================
// 全局方法
// ============================================================================

const resolveComposerDefaults = (
  composer: ChatComposerState,
) => {
  const settingsStore = useSettingsStore();
  const persistedModel = settingsStore.defaultModel;
  const persistedAgent = settingsStore.defaultAgent;
  const persistedThinking = settingsStore.defaultThinkingLevel;

  // Model: prefer persisted, validate against available models, fallback to system default
  if (persistedModel && models.value.some((m) => m.value === persistedModel)) {
    composer.selectedModel = persistedModel;
  } else {
    composer.selectedModel = defaultModel.value;
  }

  // Agent: prefer persisted, validate against available agents, fallback to direct mode
  if (persistedAgent && agents.value.some((a) => a.name === persistedAgent)) {
    composer.selectedAgent = persistedAgent;
  } else {
    composer.selectedAgent = persistedAgent || "";
  }

  // Thinking level: always use persisted or medium
  composer.selectedThinkingLevel = persistedThinking || "medium";
};

const syncComposerSelection = (
  composer: ChatComposerState,
  snapshot?: UiSessionSnapshot | SessionSummary | null,
) => {
  if (!snapshot) {
    return;
  }

  const settingsStore = useSettingsStore();

  // Agent: use snapshot value, fallback to persisted preference or direct mode
  composer.selectedAgent = snapshot.agent || settingsStore.defaultAgent || "";

  // Model: use snapshot value, fallback to persisted preference or system default
  composer.selectedModel =
    snapshot.model ||
    settingsStore.defaultModel ||
    defaultModel.value;

  // Thinking level: use snapshot value, fallback to persisted preference or medium
  composer.selectedThinkingLevel =
    (snapshot.thinkingLevel as ThinkingLevel) ||
    settingsStore.defaultThinkingLevel ||
    "medium";
};

const getCachedSessionSnapshot = (sessionId: string) =>
  sessionCache.value[sessionId]?.snapshot;

const buildSnapshotFromSummary = (sessionId: string) =>
  buildSharedSnapshotFromSummary(
    {
      sessions,
      sessionContexts,
      sessionCache,
    },
    sessionId,
    createHistoryMeta,
  );

const upsertSessionSnapshot = (snapshot: UiSessionSnapshot) => {
  syncSessionSnapshot(
    {
      sessions,
      sessionContexts,
      sessionCache,
    },
    snapshot,
  );
};

const upsertSessionSummary = (summary: SessionSummary) => {
  const next = sessions.value.filter((session) => session.id !== summary.id);
  sessions.value = [summary, ...next].sort(
    (left, right) => right.updatedAt - left.updatedAt,
  );
};

const syncSessions = (snapshot?: UiSessionSnapshot) => {
  syncSessionSnapshot(
    {
      sessions,
      sessionContexts,
      sessionCache,
    },
    snapshot,
  );
};

const patchSessionSnapshot = (
  sessionId: string,
  updater: (snapshot: UiSessionSnapshot) => UiSessionSnapshot,
) => {
  return patchSharedSessionSnapshot({
    sessions,
    sessionContexts,
    sessionCache,
    sessionId,
    createHistoryMeta,
    updater,
  });
};

const patchSessionSummary = (
  sessionId: string,
  patch: Partial<SessionSummary>,
) => {
  patchSharedSessionSummary({
    sessions,
    sessionContexts,
    sessionCache,
    sessionId,
    createHistoryMeta,
    patch,
  });
};

const appendMessageToSession = (
  sessionId: string,
  message: UiConversationMessage,
) => {
  patchSessionSnapshot(sessionId, (snapshot) => ({
    ...snapshot,
    messages: [...snapshot.messages, message],
    historyMeta: expandVisibleHistoryMeta(
      snapshot.historyMeta,
      [...snapshot.messages, message],
    ),
    updatedAt: Math.max(
      snapshot.updatedAt,
      message.message.timestamp || Date.now(),
    ),
  }));
};

// ============================================================================
// Draft 管理（全局）
// ============================================================================

const updateDraftValue = (sessionId: string | null, value: string) => {
  const key = getDraftKey(sessionId);
  if (value.trim()) {
    draftMap.value = {
      ...draftMap.value,
      [key]: value,
    };
  } else if (draftMap.value[key] !== undefined) {
    const nextDrafts = { ...draftMap.value };
    delete nextDrafts[key];
    draftMap.value = nextDrafts;
  }

  persistDraftMap(draftMap.value);
};

const clearDraftValue = (sessionId: string | null) => {
  updateDraftValue(sessionId, "");
};

const moveDraftValue = (
  fromSessionId: string | null,
  toSessionId: string,
) => {
  const fromKey = getDraftKey(fromSessionId);
  const value = draftMap.value[fromKey];
  if (!value?.trim()) {
    return;
  }

  const nextDrafts = { ...draftMap.value };
  delete nextDrafts[fromKey];
  nextDrafts[getDraftKey(toSessionId)] = value;
  draftMap.value = nextDrafts;
  persistDraftMap(draftMap.value);
};

const removeDraftValues = (sessionIds: string[]) => {
  const nextDrafts = { ...draftMap.value };
  let changed = false;

  for (const sessionId of sessionIds) {
    const key = getDraftKey(sessionId);
    if (nextDrafts[key] !== undefined) {
      delete nextDrafts[key];
      changed = true;
    }
  }

  if (!changed) {
    return;
  }

  draftMap.value = nextDrafts;
  persistDraftMap(draftMap.value);
};

const applyDraftForSession = (
  composer: ChatComposerState,
  sessionId: string | null,
) => {
  composer.sessionId = sessionId;
  suppressDraftPersistence = true;
  composer.draftText = draftMap.value[getDraftKey(sessionId)] ?? "";
  suppressDraftPersistence = false;
  composer.hasDraft = composer.draftText.trim().length > 0;
};

const restorePendingDraft = (
  composer: ChatComposerState,
  sessionId?: string,
) => {
  if (!composer.pendingPrompt.trim()) {
    return;
  }

  const targetSessionId = sessionId ?? (composer.sessionId || null);
  updateDraftValue(targetSessionId, composer.pendingPrompt);
  if (composer.sessionId === targetSessionId) {
    suppressDraftPersistence = true;
    composer.draftText = composer.pendingPrompt;
    suppressDraftPersistence = false;
    composer.hasDraft = true;
  }
  composer.pendingPrompt = "";
};

const clearPendingDraft = (
  composer: ChatComposerState,
  sessionId?: string | null,
) => {
  if (sessionId !== undefined) {
    clearDraftValue(sessionId);
  }
  composer.pendingPrompt = "";
};

const startDraftWatch = (composer: ChatComposerState) => {
  watch(
    () => composer.draftText,
    (value) => {
      composer.hasDraft = value.trim().length > 0;
      if (suppressDraftPersistence) {
        return;
      }

      updateDraftValue(composer.sessionId, value);
    },
  );
};

// ============================================================================
// API 方法
// ============================================================================

const refreshAgents = async (cwd?: string) => {
  agents.value = await getAgents(cwd);
  return agents.value;
};

const refreshResources = async (options?: {
  cwd?: string;
  sessionId?: string;
}) => {
  resourceError.value = "";

  try {
    const resolvedCwd = options?.cwd ?? undefined;
    resources.value = await getResources(
      omitUndefined({
        cwd: resolvedCwd,
        sessionId: options?.sessionId,
      }),
    );
  } catch (caughtError) {
    resources.value = createEmptyResources();
    resourceError.value =
      caughtError instanceof Error
        ? caughtError.message
        : String(caughtError);
  }

  return resources.value;
};

const refreshSessions = async () => {
  const nextSessions = await getSessions();
  sessions.value = nextSessions;
  return nextSessions;
};

const refreshSessionContexts = async () => {
  const nextContexts = await getSessionContexts();
  sessionContexts.value = nextContexts;
  return nextContexts;
};

const hydrateSession = async (sessionId: string) => {
  return hydrateSessionSnapshot({
    sessionId,
    sessions,
    sessionContexts,
    sessionCache,
    createHistoryMeta,
    loadSessionInFlightById,
    loadSessionRequestSeqById,
    refreshSessions,
    refreshSessionContexts,
  });
};

const prefetchNeighborSessions = async (sessionId: string) => {
  const activeSessions = sessions.value.filter(
    (session) => !session.archived,
  );
  const index = activeSessions.findIndex(
    (session) => session.id === sessionId,
  );
  if (index < 0) {
    return;
  }

  const neighborIds = [
    activeSessions[index - 1]?.id,
    activeSessions[index + 1]?.id,
  ].filter((value): value is string => Boolean(value));

  await Promise.all(
    neighborIds.map(async (neighborId) => {
      if (getCachedSessionSnapshot(neighborId)) {
        return;
      }

      try {
        await hydrateSession(neighborId);
      } catch {
        // 预取失败不应该影响当前会话切换。
      }
    }),
  );
};

const prefetchSession = async (sessionId: string) => {
  if (!sessionId || getCachedSessionSnapshot(sessionId)) {
    return;
  }

  await hydrateSession(sessionId);
};

const renameSessionTitle = async (sessionId: string, title: string) => {
  const snapshot = wrapUiSessionSnapshot(
    await renameSessionApi(sessionId, { title }),
  );
  syncSessions(snapshot);
  patchSessionSummary(sessionId, { title: snapshot.title });
  await refreshSessions();
};

const applySelectionUpdate = async (
  sessionId: string,
  patch: {
    agent?: string | null;
    model?: string | null;
    thinkingLevel?: ThinkingLevel | null;
  },
) => {
  const snapshot = wrapUiSessionSnapshot(await updateSession(sessionId, patch));
  syncSessions(snapshot);
  await refreshResources({ cwd: snapshot.cwd, sessionId: snapshot.id });
  return snapshot;
};

const setSessionArchived = async (
  sessionId: string,
  archived: boolean,
) => {
  const { archiveSession: archiveSessionApi } = await import("@/lib/api");
  await archiveSessionApi(sessionId, { archived });
  await refreshSessions();
};

const removeSessionTree = async (sessionId: string) => {
  const { deleteSession: deleteSessionApi } = await import("@/lib/api");
  const response = await deleteSessionApi(sessionId);
  removeDraftValues(response.sessionIds);
  await refreshSessions();
  return response;
};

// ============================================================================
// Boot
// ============================================================================

let booted = false;

const boot = async () => {
  const [systemInfo, providerPayload, sessionList, contextMap] = await Promise.all([
    getSystemInfo(),
    getProviders(),
    getSessions(),
    getSessionContexts(),
  ]);
  info.value = systemInfo;
  providers.value = providerPayload;
  sessions.value = sessionList;
  sessionContexts.value = contextMap;

  await refreshAgents();
  const settingsStore = useSettingsStore();
  if (!settingsStore.isLoaded) {
    await settingsStore.load();
  }

  resolveComposerDefaults(createDefaultComposer());
  await refreshResources();
  booted = true;
};

// ============================================================================
// 默认 Composer 创建
// ============================================================================

const createDefaultComposer = (): ChatComposerState =>
  reactive<ChatComposerState>({
    sessionId: null,
    draftText: "",
    isSending: false,
    canAbort: false,
    selectedModel: "",
    selectedThinkingLevel: "medium" as ThinkingLevel,
    selectedAgent: "",
    hasDraft: false,
    isFocused: false,
    isDisabled: false,
    pendingPrompt: "",
  });

// ============================================================================
// 初始化 Boot（自动调用一次）
// ============================================================================

const bootPromise = ref<Promise<void> | null>(null);
const bootError = ref("");

if (!booted && typeof window !== "undefined") {
  bootPromise.value = boot().catch((caughtError) => {
    bootError.value =
      caughtError instanceof Error
        ? caughtError.message
        : String(caughtError);
  });
}

// ============================================================================
// Export
// ============================================================================

export function usePiChatCore() {
  return {
    // Global state
    info,
    providers,
    sessions,
    sessionContexts,
    agents,
    resources,
    resourceError,
    sessionCache,
    sessionLoadingOlderById,
    draftMap,
    models,
    defaultModel,
    bootError,

    // Session cache methods
    getCachedSessionSnapshot,
    buildSnapshotFromSummary,
    upsertSessionSnapshot,
    patchSessionSnapshot,
    patchSessionSummary,
    appendMessageToSession,
    syncSessions,
    upsertSessionSummary,

    // Draft methods
    updateDraftValue,
    clearDraftValue,
    moveDraftValue,
    removeDraftValues,
    applyDraftForSession,
    restorePendingDraft,
    clearPendingDraft,
    startDraftWatch,

    // API methods
    refreshAgents,
    refreshResources,
    refreshSessions,
    refreshSessionContexts,
    hydrateSession,
    prefetchNeighborSessions,
    prefetchSession,
    renameSessionTitle,
    applySelectionUpdate,
    setSessionArchived,
    removeSessionTree,

    // Composer helpers
    resolveComposerDefaults,
    syncComposerSelection,
    createDefaultComposer,

    // Utilities
    createLocalId,
    createRawMessage,
    parseAgentMention,
    expandVisibleHistoryMeta,
    createHistoryMeta,
    fallbackSessionTitle,

    // Boot
    bootPromise,
  };
}

export type PiChatCore = ReturnType<typeof usePiChatCore>;
