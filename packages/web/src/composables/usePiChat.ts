import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";

import {
  abortSession,
  archiveSession,
  createSession,
  deleteSession,
  getAgents,
  getProviders,
  getResources,
  getSession,
  getSessions,
  getSystemInfo,
  renameSession,
  respondToAsk,
  sendMessage,
  updateSession,
} from "@/lib/api";
import type {
  AgentSummary,
  AskInteractiveRequest,
  AskQuestionAnswer,
  ChatComposerState,
  ChatMessage,
  ProvidersResponse,
  ResourceCatalogResponse,
  SessionHistoryMeta,
  SessionSnapshot,
  SessionSummary,
  StreamEvent,
  SystemInfo,
  ThinkingLevel,
} from "@/lib/types";
import { omitUndefined } from "@/lib/utils";

type SessionDraftContext = {
  cwd: string;
  parentSessionId: string;
};

type CachedSessionEntry = {
  snapshot: SessionSnapshot;
  hydratedAt: number;
};

const createLocalId = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const fallbackSessionTitle = "新会话";
const draftStorageKey = "pi-web.chat-composer.drafts.v1";
const newSessionDraftKey = "__pi_new_session__";
const INITIAL_MESSAGE_WINDOW = 80;
const MESSAGE_WINDOW_INCREMENT = 80;

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

// ============================================================================
// Pi 原始消息辅助函数
// ============================================================================

const createRawMessage = (message?: StreamEvent["message"], overrides?: Partial<ChatMessage>): ChatMessage => ({
  role: (message?.role as ChatMessage["role"]) || overrides?.role || "assistant",
  content:
    message?.content === undefined
      ? (overrides?.content ?? "")
      : typeof message.content === "string"
        ? message.content
        : message.content,
  timestamp: overrides?.timestamp ?? message?.timestamp ?? Date.now(),
  toolCallId: overrides?.toolCallId ?? message?.toolCallId,
  toolName: overrides?.toolName ?? message?.toolName,
  details: overrides?.details ?? message?.details,
  isError: overrides?.isError ?? message?.isError,
  pending: overrides?.pending,
  localId: overrides?.localId,
});

/**
 * 创建空的 ContentBlock 数组
 */
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

const createHistoryMeta = (
  loadedCount: number,
  totalCount: number,
  limit = INITIAL_MESSAGE_WINDOW,
): SessionHistoryMeta => ({
  loadedCount,
  totalCount,
  hasMoreAbove: totalCount > loadedCount,
  limit,
});

const expandVisibleHistoryMeta = (
  historyMeta: SessionHistoryMeta,
  visibleCount: number,
) => {
  const hiddenCount = Math.max(
    historyMeta.totalCount - historyMeta.loadedCount,
    0,
  );
  const totalCount = hiddenCount + visibleCount;

  return createHistoryMeta(
    visibleCount,
    totalCount,
    Math.max(historyMeta.limit, visibleCount),
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
// usePiChat - 核心状态管理
// ============================================================================

export function usePiChat() {
  const info = ref<SystemInfo | null>(null);
  const providers = ref<ProvidersResponse | null>(null);
  const sessions = ref<SessionSummary[]>([]);
  const activeSessionId = ref("");
  const messages = ref<ChatMessage[]>([]);
  const activeDraftContext = ref<SessionDraftContext | null>(null);
  const sessionCache = ref<Record<string, CachedSessionEntry>>({});
  const sessionLoadingOlderById = ref<Record<string, boolean>>({});
  const isSending = ref(false);
  const status = ref<SessionSummary["status"]>("idle");
  const error = ref("");
  const resourceError = ref("");
  const agents = ref<AgentSummary[]>([]);
  const resources = ref<ResourceCatalogResponse>(createEmptyResources());
  const draftMap = ref<Record<string, string>>(loadDraftMap());
  const composer = reactive<ChatComposerState>({
    sessionId: null,
    draftText: "",
    isSending: false,
    canAbort: false,
    selectedModel: "",
    selectedThinkingLevel: "",
    selectedAgent: "",
    hasDraft: false,
    isFocused: false,
    isDisabled: false,
    pendingPrompt: "",
  });

  // ============================================================================
  // 流式消息构建状态
  // ============================================================================
  let eventSource: EventSource | null = null;
  let currentStreamMessageLocalId = "";
  let suppressDraftPersistence = false;
  const loadSessionInFlightById = new Map<string, Promise<SessionSnapshot>>();
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

  const activeSession = computed(
    () =>
      sessions.value.find((session) => session.id === activeSessionId.value) ??
      null,
  );
  const selectedAgentSummary = computed(
    () =>
      agents.value.find((agent) => agent.name === composer.selectedAgent) ??
      null,
  );
  const defaultModel = computed(
    () => providers.value?.default.chat ?? models.value[0]?.value ?? "",
  );
  const effectiveModel = computed(
    () =>
      composer.selectedModel ||
      activeSession.value?.resolvedModel ||
      selectedAgentSummary.value?.model ||
      defaultModel.value,
  );
  const effectiveThinkingLevel = computed<ThinkingLevel>(
    () =>
      composer.selectedThinkingLevel ||
      activeSession.value?.resolvedThinkingLevel ||
      selectedAgentSummary.value?.thinking ||
      "medium",
  );
  const mentionedAgent = computed(() =>
    parseAgentMention(composer.draftText, agents.value),
  );
  const effectiveAgent = computed(
    () => mentionedAgent.value || composer.selectedAgent || "",
  );
  const activeHistoryMeta = computed<SessionHistoryMeta>(() => {
    if (!activeSessionId.value) {
      return createHistoryMeta(messages.value.length, messages.value.length);
    }

    return (
      getCachedSessionSnapshot(activeSessionId.value)?.historyMeta ??
      createHistoryMeta(messages.value.length, messages.value.length)
    );
  });

  const interactiveRequests = computed<AskInteractiveRequest[]>(() => {
    if (!activeSessionId.value) {
      return [];
    }

    return getCachedSessionSnapshot(activeSessionId.value)?.interactiveRequests ?? [];
  });
  const hasMoreAbove = computed(() => activeHistoryMeta.value.hasMoreAbove);
  const isLoadingOlder = computed(() =>
    Boolean(
      activeSessionId.value &&
      sessionLoadingOlderById.value[activeSessionId.value],
    ),
  );

  const getCachedSessionSnapshot = (sessionId: string) =>
    sessionCache.value[sessionId]?.snapshot;

  const buildSnapshotFromSummary = (sessionId: string) => {
    const summary = sessions.value.find((session) => session.id === sessionId);
    if (!summary) {
      return null;
    }

    return {
      ...summary,
      messages: [],
      historyMeta: createHistoryMeta(0, 0),
      interactiveRequests: [],
    } satisfies SessionSnapshot;
  };

  const upsertSessionSnapshot = (snapshot: SessionSnapshot) => {
    sessionCache.value = {
      ...sessionCache.value,
      [snapshot.id]: {
        snapshot: {
          ...snapshot,
          messages: [...snapshot.messages],
        },
        hydratedAt: Date.now(),
      },
    };
  };

  const patchSessionSnapshot = (
    sessionId: string,
    updater: (snapshot: SessionSnapshot) => SessionSnapshot,
  ) => {
    const baseSnapshot =
      getCachedSessionSnapshot(sessionId) ??
      buildSnapshotFromSummary(sessionId);
    if (!baseSnapshot) {
      return null;
    }

    const nextSnapshot = updater({
      ...baseSnapshot,
      messages: [...baseSnapshot.messages],
    });

    upsertSessionSnapshot(nextSnapshot);

    if (activeSessionId.value === sessionId) {
      messages.value = nextSnapshot.messages;
      status.value = nextSnapshot.status;
      isSending.value = nextSnapshot.status === "streaming";
      composer.isSending = nextSnapshot.status === "streaming";
      composer.canAbort = nextSnapshot.status === "streaming";
    }

    return nextSnapshot;
  };

  const appendMessageToSession = (sessionId: string, message: ChatMessage) => {
    patchSessionSnapshot(sessionId, (snapshot) => ({
      ...snapshot,
      messages: [...snapshot.messages, message],
      historyMeta: expandVisibleHistoryMeta(
        snapshot.historyMeta,
        snapshot.messages.length + 1,
      ),
      updatedAt: Math.max(snapshot.updatedAt, message.timestamp || Date.now()),
    }));
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

  const applyDraftForSession = (sessionId: string | null) => {
    composer.sessionId = sessionId;
    suppressDraftPersistence = true;
    composer.draftText = draftMap.value[getDraftKey(sessionId)] ?? "";
    suppressDraftPersistence = false;
    composer.hasDraft = composer.draftText.trim().length > 0;
  };

  const restorePendingDraft = (sessionId?: string) => {
    if (!composer.pendingPrompt.trim()) {
      return;
    }

    const targetSessionId = sessionId ?? (activeSessionId.value || null);
    updateDraftValue(targetSessionId, composer.pendingPrompt);
    if (composer.sessionId === targetSessionId) {
      suppressDraftPersistence = true;
      composer.draftText = composer.pendingPrompt;
      suppressDraftPersistence = false;
      composer.hasDraft = true;
    }
    composer.pendingPrompt = "";
  };

  const clearPendingDraft = (sessionId?: string | null) => {
    if (sessionId !== undefined) {
      clearDraftValue(sessionId);
    }
    composer.pendingPrompt = "";
  };

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

  const upsertSessionSummary = (summary: SessionSummary) => {
    const next = sessions.value.filter((session) => session.id !== summary.id);
    sessions.value = [summary, ...next].sort(
      (left, right) => right.updatedAt - left.updatedAt,
    );
  };

  const syncSessions = (snapshot?: SessionSnapshot) => {
    if (!snapshot) {
      return;
    }

    const { messages, ...summary } = snapshot;
    void messages;
    upsertSessionSnapshot(snapshot);
    upsertSessionSummary(summary);
  };

  const patchSessionSummary = (
    sessionId: string,
    patch: Partial<SessionSummary>,
  ) => {
    const current = sessions.value.find((session) => session.id === sessionId);
    if (!current) {
      return;
    }

    upsertSessionSummary({
      ...current,
      ...patch,
    });

    patchSessionSnapshot(sessionId, (snapshot) => ({
      ...snapshot,
      ...patch,
    }));
  };

  const syncComposerSelection = (
    snapshot?: SessionSnapshot | SessionSummary | null,
  ) => {
    if (!snapshot) {
      return;
    }

    composer.selectedAgent = snapshot.agent || "";
    composer.selectedModel = snapshot.model || "";
    composer.selectedThinkingLevel = snapshot.thinkingLevel || "";
  };

  const resetActiveSession = () => {
    activeDraftContext.value = null;
    activeSessionId.value = "";
    messages.value = [];
    status.value = "idle";
    isSending.value = false;
    composer.isSending = false;
    composer.canAbort = false;
    composer.sessionId = null;
    composer.pendingPrompt = "";
    eventSource?.close();
    eventSource = null;
    currentStreamMessageLocalId = "";
    applyDraftForSession(null);
  };

  const applySnapshotToActiveSession = (
    snapshot: SessionSnapshot,
    options?: { connectStream?: boolean },
  ) => {
    activeDraftContext.value = null;
    activeSessionId.value = snapshot.id;
    status.value = snapshot.status;
    isSending.value = snapshot.status === "streaming";
    composer.isSending = snapshot.status === "streaming";
    composer.canAbort = snapshot.status === "streaming";
    syncSessions(snapshot);
    syncComposerSelection(snapshot);
    applyDraftForSession(snapshot.id);
    messages.value =
      getCachedSessionSnapshot(snapshot.id)?.messages ?? snapshot.messages;

    if (options?.connectStream !== false) {
      connectStream(snapshot.id);
    }

    void prefetchNeighborSessions(snapshot.id);
  };

  async function hydrateSession(sessionId: string) {
    const cached = getCachedSessionSnapshot(sessionId);
    if (cached) {
      return cached;
    }

    const inFlight = loadSessionInFlightById.get(sessionId);
    if (inFlight) {
      return inFlight;
    }

    const requestSeq = (loadSessionRequestSeqById.get(sessionId) ?? 0) + 1;
    loadSessionRequestSeqById.set(sessionId, requestSeq);

    const loadPromise = getSession(sessionId)
      .then((snapshot) => {
        const latestSeq = loadSessionRequestSeqById.get(sessionId);
        if (latestSeq !== requestSeq) {
          return getCachedSessionSnapshot(sessionId) ?? snapshot;
        }

        syncSessions(snapshot);
        return snapshot;
      })
      .finally(() => {
        if (loadSessionInFlightById.get(sessionId) === loadPromise) {
          loadSessionInFlightById.delete(sessionId);
        }
      });

    loadSessionInFlightById.set(sessionId, loadPromise);
    return loadPromise;
  }

  const openSessionDraft = async (options?: {
    cwd?: string;
    parentSessionId?: string;
  }) => {
    if (composer.sessionId !== null) {
      updateDraftValue(composer.sessionId, composer.draftText);
    }

    const parentSession = options?.parentSessionId
      ? (sessions.value.find(
          (session) => session.id === options.parentSessionId,
        ) ??
        getCachedSessionSnapshot(options.parentSessionId) ??
        null)
      : null;

    activeDraftContext.value = {
      cwd:
        options?.cwd ||
        parentSession?.cwd ||
        activeSession.value?.cwd ||
        info.value?.workspaceDir ||
        "",
      parentSessionId: options?.parentSessionId || "",
    };

    activeSessionId.value = "";
    messages.value = [];
    status.value = "idle";
    isSending.value = false;
    composer.isSending = false;
    composer.canAbort = false;
    composer.pendingPrompt = "";
    currentStreamMessageLocalId = "";
    eventSource?.close();
    eventSource = null;

    if (parentSession) {
      composer.selectedAgent = parentSession.agent || "";
      composer.selectedModel = parentSession.model || "";
      composer.selectedThinkingLevel = parentSession.thinkingLevel || "";
    }

    applyDraftForSession(null);

    if (activeDraftContext.value?.cwd || info.value?.workspaceDir) {
      const nextCwd = activeDraftContext.value?.cwd || info.value?.workspaceDir;
      await Promise.all([
        refreshAgents(nextCwd),
        refreshResources(nextCwd ? { cwd: nextCwd } : undefined),
      ]);
    }
  };

  const setDraftProjectPath = async (cwd: string) => {
    const normalizedCwd = cwd.trim();
    if (!normalizedCwd || activeSessionId.value) {
      return;
    }

    activeDraftContext.value = {
      cwd: normalizedCwd,
      parentSessionId: activeDraftContext.value?.parentSessionId || "",
    };

    await Promise.all([
      refreshAgents(normalizedCwd),
      refreshResources({ cwd: normalizedCwd }),
    ]);
  };

  const refreshAgents = async (cwd?: string) => {
    agents.value = await getAgents(
      cwd ?? activeSession.value?.cwd ?? info.value?.workspaceDir,
    );
    return agents.value;
  };

  const refreshResources = async (options?: {
    cwd?: string;
    sessionId?: string;
  }) => {
    resourceError.value = "";

    try {
      resources.value = await getResources(
        omitUndefined({
          cwd:
            options?.cwd ??
            activeSession.value?.cwd ??
            info.value?.workspaceDir,
          sessionId: options?.sessionId ?? activeSessionId.value,
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

    if (!activeSessionId.value) {
      return nextSessions;
    }

    const activeSummary = nextSessions.find(
      (session) => session.id === activeSessionId.value,
    );
    // 当前会话被删除后，不自动回退到其他会话，保持未选中状态
    if (!activeSummary) {
      resetActiveSession();
      if (info.value?.workspaceDir) {
        await refreshResources({ cwd: info.value.workspaceDir });
      }
      return nextSessions;
    }

    status.value = activeSummary.status;
    composer.canAbort = activeSummary.status === "streaming";
    return nextSessions;
  };

  // ============================================================================
  // SSE 流式连接 - 直通 Pi 原始消息事件
  // ============================================================================
  const connectStream = (sessionId: string) => {
    eventSource?.close();
    currentStreamMessageLocalId = "";

    const streamParams = new URLSearchParams();
    const currentLimit =
      getCachedSessionSnapshot(sessionId)?.historyMeta.limit ||
      INITIAL_MESSAGE_WINDOW;
    streamParams.set("limit", String(currentLimit));
    eventSource = new EventSource(
      `/api/sessions/${sessionId}/stream?${streamParams.toString()}`,
    );

    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data) as StreamEvent & {
        session?: SessionSnapshot;
      };

      if (payload.type === "snapshot" && payload.session) {
        syncSessions(payload.session);
        if (activeSessionId.value === sessionId) {
          syncComposerSelection(payload.session);
          messages.value =
            getCachedSessionSnapshot(sessionId)?.messages ??
            payload.session.messages;
          status.value = payload.session.status;
          isSending.value = payload.session.status === "streaming";
          composer.isSending = payload.session.status === "streaming";
          composer.canAbort = payload.session.status === "streaming";
        }
        return;
      }

      if (payload.type === "status" && payload.status) {
        status.value = payload.status;
        isSending.value = payload.status === "streaming";
        composer.isSending = payload.status === "streaming";
        composer.canAbort = payload.status === "streaming";
        patchSessionSummary(sessionId, {
          status: payload.status,
          updatedAt: Date.now(),
        });
      }

      if (payload.type === "error" && payload.error) {
        error.value = payload.error;
        status.value = "error";
        isSending.value = false;
        composer.isSending = false;
        composer.canAbort = false;
        currentStreamMessageLocalId = "";
        patchSessionSnapshot(sessionId, (snapshot) => ({
          ...snapshot,
          status: "error",
          updatedAt: Date.now(),
        }));
        patchSessionSummary(sessionId, {
          status: "error",
          updatedAt: Date.now(),
        });
        restorePendingDraft(sessionId);
        return;
      }

      if (payload.type === "message_start" && payload.message) {
        currentStreamMessageLocalId = createLocalId();
        appendMessageToSession(sessionId, {
          role: payload.message.role,
          content: payload.message.content,
          timestamp: payload.message.timestamp ?? Date.now(),
          pending: true,
          localId: currentStreamMessageLocalId,
        });
        return;
      }

      if (payload.type === "message_end" && payload.message) {
        const finalMessage = createRawMessage(payload.message, {
          pending: false,
          localId: currentStreamMessageLocalId || createLocalId(),
        });

        patchSessionSnapshot(sessionId, (snapshot) => {
          const pendingIndex = snapshot.messages.findIndex(
            (message) =>
              message.pending === true &&
              message.localId === finalMessage.localId,
          );

          if (pendingIndex < 0) {
            return {
              ...snapshot,
              messages: [...snapshot.messages, finalMessage],
              historyMeta: expandVisibleHistoryMeta(
                snapshot.historyMeta,
                snapshot.messages.length + 1,
              ),
              status: "idle",
              updatedAt: finalMessage.timestamp || Date.now(),
            };
          }

          return {
            ...snapshot,
            messages: snapshot.messages.map((message, index) =>
              index === pendingIndex ? finalMessage : message,
            ),
            status: "idle",
            updatedAt: finalMessage.timestamp || Date.now(),
          };
        });

        currentStreamMessageLocalId = "";
        isSending.value = false;
        composer.isSending = false;
        composer.canAbort = false;
        status.value = "idle";
        clearPendingDraft(sessionId);
        patchSessionSummary(sessionId, {
          status: "idle",
          updatedAt: Date.now(),
        });
      }
    };

    eventSource.onerror = () => {
      eventSource?.close();
      eventSource = null;
    };
  };

  const loadSession = async (sessionId: string) => {
    if (sessionId === activeSessionId.value && !activeDraftContext.value) {
      return;
    }

    if (composer.sessionId !== null) {
      updateDraftValue(composer.sessionId, composer.draftText);
    }

    const cachedSnapshot = getCachedSessionSnapshot(sessionId);
    if (cachedSnapshot) {
      applySnapshotToActiveSession(cachedSnapshot);
      await Promise.all([
        refreshAgents(cachedSnapshot.cwd),
        refreshResources({
          cwd: cachedSnapshot.cwd,
          sessionId: cachedSnapshot.id,
        }),
      ]);
      return;
    }

    const snapshot = await hydrateSession(sessionId);
    applySnapshotToActiveSession(snapshot);
    await Promise.all([
      refreshAgents(snapshot.cwd),
      refreshResources({ cwd: snapshot.cwd, sessionId: snapshot.id }),
    ]);
  };

  const boot = async () => {
    error.value = "";
    const [systemInfo, providerPayload, sessionList] = await Promise.all([
      getSystemInfo(),
      getProviders(),
      getSessions(),
    ]);

    info.value = systemInfo;
    providers.value = providerPayload;
    sessions.value = sessionList;

    await refreshAgents(systemInfo.workspaceDir);

    // 初始化时不自动选中任何会话，保持未选中状态
    resetActiveSession();
    if (info.value?.workspaceDir) {
      await refreshResources({ cwd: info.value.workspaceDir });
    }
  };

  const loadEarlier = async () => {
    if (!activeSessionId.value || isLoadingOlder.value) {
      return;
    }

    const sessionId = activeSessionId.value;
    const currentSnapshot = getCachedSessionSnapshot(sessionId);
    if (!currentSnapshot?.historyMeta.hasMoreAbove) {
      return;
    }

    const nextLimit = Math.min(
      currentSnapshot.historyMeta.totalCount,
      currentSnapshot.historyMeta.limit + MESSAGE_WINDOW_INCREMENT,
    );

    if (nextLimit <= currentSnapshot.historyMeta.loadedCount) {
      return;
    }

    sessionLoadingOlderById.value = {
      ...sessionLoadingOlderById.value,
      [sessionId]: true,
    };

    try {
      const snapshot = await getSession(sessionId, { limit: nextLimit });
      syncSessions(snapshot);
      if (activeSessionId.value === sessionId) {
        messages.value = snapshot.messages;
      }
    } finally {
      sessionLoadingOlderById.value = {
        ...sessionLoadingOlderById.value,
        [sessionId]: false,
      };
    }
  };

  const createAndLoadSession = async (options?: {
    cwd?: string;
    title?: string;
    model?: string;
    thinkingLevel?: ThinkingLevel | null;
    parentSessionId?: string;
    agent?: string | null;
    inheritDraftFromNewSession?: boolean;
  }) => {
    if (composer.sessionId !== null) {
      updateDraftValue(composer.sessionId, composer.draftText);
    }

    const snapshot = await createSession(
      omitUndefined({
        cwd:
          options?.cwd ?? activeSession.value?.cwd ?? info.value?.workspaceDir,
        title: options?.title,
        model: options?.model ?? (composer.selectedModel || undefined),
        thinkingLevel:
          options?.thinkingLevel ?? (composer.selectedThinkingLevel || null),
        parentSessionId: options?.parentSessionId,
        agent: options?.agent ?? (composer.selectedAgent || null),
      }),
    );

    if (options?.inheritDraftFromNewSession) {
      moveDraftValue(null, snapshot.id);
    }

    applySnapshotToActiveSession(snapshot);
    await Promise.all([
      refreshAgents(snapshot.cwd),
      refreshResources({ cwd: snapshot.cwd, sessionId: snapshot.id }),
    ]);
    await refreshSessions();
    return snapshot;
  };

  const ensureSession = async () => {
    if (activeSessionId.value) {
      return activeSessionId.value;
    }

    const snapshot = await createAndLoadSession({
      ...omitUndefined({
        cwd: activeDraftContext.value?.cwd,
        parentSessionId: activeDraftContext.value?.parentSessionId,
      }),
      inheritDraftFromNewSession: true,
    });
    return snapshot.id;
  };

  // ============================================================================
  // 消息发送 - 支持完整 ContentBlocks
  // ============================================================================
  const submit = async () => {
    const prompt = composer.draftText.trim();
    if (!prompt || composer.isSending) {
      return;
    }

    const resolvedModel = effectiveModel.value;
    if (!resolvedModel) {
      error.value = "当前没有可用模型，无法发送";
      return;
    }

    if (
      composer.selectedAgent &&
      !agents.value.some((agent) => agent.name === composer.selectedAgent)
    ) {
      error.value = `当前选择的 Agent 已不可用: ${composer.selectedAgent}`;
      return;
    }

    error.value = "";
    const effectiveAgentName = effectiveAgent.value || null;
    let optimisticMessageLocalId = "";

    try {
      const sessionId = await ensureSession();
      const hasExistingMessages =
        (getCachedSessionSnapshot(sessionId)?.messages.length ?? 0) > 0;

      // 创建乐观用户消息
      const optimisticMessage: ChatMessage = {
        role: "user",
        content: prompt,
        timestamp: Date.now(),
        localId: createLocalId(),
      };
      optimisticMessageLocalId = optimisticMessage.localId || "";

      composer.pendingPrompt = prompt;
      composer.isSending = true;
      composer.canAbort = true;
      isSending.value = true;
      status.value = "streaming";
      appendMessageToSession(sessionId, optimisticMessage);

      suppressDraftPersistence = true;
      composer.draftText = "";
      composer.hasDraft = false;
      suppressDraftPersistence = false;

      if (!hasExistingMessages) {
        patchSessionSummary(sessionId, {
          title: prompt.slice(0, 24).trim() || fallbackSessionTitle,
          updatedAt: Date.now(),
        });
      }

      await sendMessage(
        sessionId,
        omitUndefined({
          prompt,
          model: composer.selectedModel || undefined,
          thinkingLevel: composer.selectedThinkingLevel || undefined,
          agent: effectiveAgentName,
        }),
      );

      clearDraftValue(sessionId);
      clearDraftValue(null);
      patchSessionSummary(
        sessionId,
        omitUndefined({
          agent: effectiveAgentName || undefined,
          model: composer.selectedModel || undefined,
          thinkingLevel: composer.selectedThinkingLevel || undefined,
          resolvedModel,
          resolvedThinkingLevel: effectiveThinkingLevel.value,
          status: "streaming" as const,
          updatedAt: Date.now(),
        }),
      );
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
      status.value = "error";
      isSending.value = false;
      composer.isSending = false;
      composer.canAbort = false;

      if (activeSessionId.value && optimisticMessageLocalId) {
        patchSessionSnapshot(activeSessionId.value, (snapshot) => ({
          ...snapshot,
          messages: snapshot.messages.filter(
            (message) => message.localId !== optimisticMessageLocalId,
          ),
          historyMeta: expandVisibleHistoryMeta(
            snapshot.historyMeta,
            snapshot.messages.filter(
              (message) => message.localId !== optimisticMessageLocalId,
            ).length,
          ),
          status: "error",
        }));
      }

      restorePendingDraft(activeSessionId.value || undefined);
    }
  };

  const abort = async () => {
    if (!activeSessionId.value || !composer.isSending) {
      return;
    }

    await abortSession(activeSessionId.value);
    isSending.value = false;
    composer.isSending = false;
    composer.canAbort = false;
    currentStreamMessageLocalId = "";
    status.value = "idle";
    restorePendingDraft(activeSessionId.value);
    patchSessionSummary(activeSessionId.value, {
      status: "idle",
      updatedAt: Date.now(),
    });
  };

  const renameSessionTitle = async (sessionId: string, title: string) => {
    const snapshot = await renameSession(sessionId, { title });
    syncSessions(snapshot);

    if (sessionId === activeSessionId.value) {
      patchSessionSummary(sessionId, { title: snapshot.title });
    }

    await refreshSessions();
  };

  const applySelectionUpdate = async (patch: {
    agent?: string | null;
    model?: string | null;
    thinkingLevel?: ThinkingLevel | null;
  }) => {
    if (!activeSessionId.value) {
      return;
    }

    const snapshot = await updateSession(activeSessionId.value, patch);
    syncSessions(snapshot);
    syncComposerSelection(snapshot);
    await refreshResources({ cwd: snapshot.cwd, sessionId: snapshot.id });
  };

  const setSelectedAgent = async (agentName: string) => {
    const nextAgent = agentName.trim();
    const previousAgent = composer.selectedAgent;
    composer.selectedAgent = nextAgent;

    if (!activeSessionId.value) {
      return;
    }

    try {
      await applySelectionUpdate({
        agent: nextAgent || null,
      });
    } catch (caughtError) {
      composer.selectedAgent = previousAgent;
      error.value =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
    }
  };

  const setSelectedModel = async (model: string) => {
    const nextModel = model.trim();
    const previousModel = composer.selectedModel;
    composer.selectedModel = nextModel;

    if (!activeSessionId.value) {
      return;
    }

    try {
      await applySelectionUpdate({
        model: nextModel || null,
      });
    } catch (caughtError) {
      composer.selectedModel = previousModel;
      error.value =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
    }
  };

  const setSelectedThinkingLevel = async (
    thinkingLevel: ThinkingLevel | "",
  ) => {
    const previousThinkingLevel = composer.selectedThinkingLevel;
    composer.selectedThinkingLevel = thinkingLevel;

    if (!activeSessionId.value) {
      return;
    }

    try {
      await applySelectionUpdate({
        thinkingLevel: thinkingLevel || null,
      });
    } catch (caughtError) {
      composer.selectedThinkingLevel = previousThinkingLevel;
      error.value =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
    }
  };

  const setSessionArchived = async (sessionId: string, archived: boolean) => {
    await archiveSession(sessionId, { archived });
    await refreshSessions();
  };

  const removeSessionTree = async (sessionId: string) => {
    const response = await deleteSession(sessionId);
    removeDraftValues(response.sessionIds);
    if (response.sessionIds.includes(activeSessionId.value)) {
      resetActiveSession();
    }
    await refreshSessions();
  };

  const respondToPendingAsk = async (
    sessionId: string,
    askId: string,
    answers: AskQuestionAnswer[],
  ) => {
    patchSessionSnapshot(sessionId, (snapshot) => ({
      ...snapshot,
      status: "streaming",
      interactiveRequests: snapshot.interactiveRequests.filter(
        (request) => request.id !== askId,
      ),
      updatedAt: Date.now(),
    }));
    patchSessionSummary(sessionId, {
      status: "streaming",
      updatedAt: Date.now(),
    });
    status.value = "streaming";
    isSending.value = true;
    composer.isSending = true;
    composer.canAbort = true;

    try {
      await respondToAsk(sessionId, askId, {
        action: "submit",
        answers,
      });
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
      const snapshot = await getSession(sessionId, {
        limit: getCachedSessionSnapshot(sessionId)?.historyMeta.limit,
      });
      syncSessions(snapshot);
      if (activeSessionId.value === sessionId) {
        messages.value = snapshot.messages;
      }
    }
  };

  const dismissPendingAsk = async (sessionId: string, askId: string) => {
    patchSessionSnapshot(sessionId, (snapshot) => ({
      ...snapshot,
      status: "streaming",
      interactiveRequests: snapshot.interactiveRequests.filter(
        (request) => request.id !== askId,
      ),
      updatedAt: Date.now(),
    }));
    patchSessionSummary(sessionId, {
      status: "streaming",
      updatedAt: Date.now(),
    });
    status.value = "streaming";
    isSending.value = true;
    composer.isSending = true;
    composer.canAbort = true;

    try {
      await respondToAsk(sessionId, askId, {
        action: "dismiss",
      });
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
      const snapshot = await getSession(sessionId, {
        limit: getCachedSessionSnapshot(sessionId)?.historyMeta.limit,
      });
      syncSessions(snapshot);
      if (activeSessionId.value === sessionId) {
        messages.value = snapshot.messages;
      }
    }
  };

  const setComposerFocused = (focused: boolean) => {
    composer.isFocused = focused;
  };

  const prefetchSession = async (sessionId: string) => {
    if (
      !sessionId ||
      sessionId === activeSessionId.value ||
      getCachedSessionSnapshot(sessionId)
    ) {
      return;
    }

    await hydrateSession(sessionId);
  };

  onMounted(() => {
    void boot().catch((caughtError) => {
      error.value =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
    });
  });

  onBeforeUnmount(() => {
    eventSource?.close();
  });

  return {
    activeSession,
    activeSessionId,
    agents,
    archiveSession: setSessionArchived,
    abort,
    composer,
    createSession: createAndLoadSession,
    deleteSession: removeSessionTree,
    dismissPendingAsk,
    effectiveAgent,
    effectiveModel,
    effectiveThinkingLevel,
    error,
    info,
    interactiveRequests,
    isSending,
    activeDraftContext,
    activeHistoryMeta,
    hasMoreAbove,
    isLoadingOlder,
    loadEarlier,
    loadSession,
    mentionedAgent,
    messages,
    models,
    openSessionDraft,
    setDraftProjectPath,
    prefetchSession,
    refreshAgents,
    refreshResources,
    refreshSessions,
    renameSession: renameSessionTitle,
    resourceError,
    resources,
    respondToPendingAsk,
    sessions,
    setComposerFocused,
    setSelectedAgent,
    setSelectedModel,
    setSelectedThinkingLevel,
    status,
    submit,
  };
}
