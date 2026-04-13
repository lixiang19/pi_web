import {
  computed,
  onBeforeUnmount,
  reactive,
  ref,
  type Ref,
  watch,
} from "vue";
import {
  abortSession as abortSessionApi,
  createSession,
  respondToAsk,
  respondToPermissionRequest,
  sendMessage,
} from "@/lib/api";
import type {
  AskInteractiveRequest,
  AskQuestionAnswer,
  ChatComposerState,
  ChatMessage,
  PermissionInteractiveRequest,
  SessionSnapshot,
  SessionSummary,
  StreamEvent,
  ThinkingLevel,
} from "@/lib/types";
import { getSession } from "@/lib/api";
import { omitUndefined } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings";
import { usePiChatCore } from "@/composables/usePiChatCore";
import { useSessionTabs } from "@/composables/useSessionTabs";

type SessionDraftContext = {
  cwd: string;
  parentSessionId: string;
};

/**
 * 每个标签页独立的聊天状态管理
 *
 * 每个 SessionTabContent 实例创建一个 usePerSessionChat，
 * 拥有独立的 messages、composer、SSE 连接等。
 * 全局共享状态（sessions 列表、缓存等）通过 usePiChatCore 访问。
 */
export function usePerSessionChat(sessionIdRef: Ref<string>, tabIdRef: Ref<string>) {
  const core = usePiChatCore();
  const { activeTabId, updateTab } = useSessionTabs();

  // ============================================================================
  // 每会话独立状态
  // ============================================================================

  const messages = ref<ChatMessage[]>([]);
  const status = ref<SessionSummary["status"]>("idle");
  const isSending = ref(false);
  const error = ref("");
  const activeDraftContext = ref<SessionDraftContext | null>(null);

  const composer = reactive<ChatComposerState>({
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

  // SSE 连接
  let eventSource: EventSource | null = null;
  let currentStreamMessageLocalId = "";

  // ============================================================================
  // 计算属性
  // ============================================================================


  const activeSession = computed(() =>
    core.sessions.value.find((s) => s.id === sessionIdRef.value) ?? null,
  );

  const selectedAgentSummary = computed(() =>
    core.agents.value.find((a) => a.name === composer.selectedAgent) ?? null,
  );

  const effectiveModel = computed(() => {
    if (composer.selectedModel) return composer.selectedModel;
    if (activeSession.value?.resolvedModel) return activeSession.value.resolvedModel;
    if (selectedAgentSummary.value?.model) return selectedAgentSummary.value.model;
    return core.defaultModel.value;
  });

  const effectiveThinkingLevel = computed<ThinkingLevel>(() => {
    if (composer.selectedThinkingLevel) return composer.selectedThinkingLevel;
    if (activeSession.value?.resolvedThinkingLevel) return activeSession.value.resolvedThinkingLevel as ThinkingLevel;
    if (selectedAgentSummary.value?.thinking) return selectedAgentSummary.value.thinking;
    return "medium";
  });

  const mentionedAgent = computed(() =>
    core.parseAgentMention(composer.draftText, core.agents.value),
  );

  const effectiveAgent = computed(
    () => mentionedAgent.value || composer.selectedAgent || "",
  );

  const activeHistoryMeta = computed(() => {
    if (!sessionIdRef.value) {
      return core.createHistoryMeta(messages.value.length, messages.value.length);
    }
    return (
      core.getCachedSessionSnapshot(sessionIdRef.value)?.historyMeta ??
      core.createHistoryMeta(messages.value.length, messages.value.length)
    );
  });

  const interactiveRequests = computed<AskInteractiveRequest[]>(() => {
    if (!sessionIdRef.value) return [];
    return core.getCachedSessionSnapshot(sessionIdRef.value)?.interactiveRequests ?? [];
  });

  const permissionRequests = computed<PermissionInteractiveRequest[]>(() => {
    if (!sessionIdRef.value) return [];
    return core.getCachedSessionSnapshot(sessionIdRef.value)?.permissionRequests ?? [];
  });

  const hasMoreAbove = computed(() => activeHistoryMeta.value.hasMoreAbove);

  const isLoadingOlder = computed(() =>
    Boolean(
      sessionIdRef.value &&
      core.sessionLoadingOlderById.value[sessionIdRef.value],
    ),
  );

  const isDraftSession = computed(() => !activeSession.value);

  const currentSessionTitle = computed(() => {
    if (activeSession.value?.title) {
      return activeSession.value.title;
    }
    if (activeDraftContext.value?.parentSessionId) {
      return "新的分支草稿";
    }
    return "新的 Pi 会话";
  });

  // 有效目录（文件树根目录）
  const fileTreeRoot = computed(() => {
    const session = activeSession.value;
    if (session) {
      if (session.worktreeRoot && session.worktreeRoot !== session.projectRoot) {
        return session.worktreeRoot;
      }
      return session.cwd;
    }
    return activeDraftContext.value?.cwd || "";
  });

  // ============================================================================
  // SSE 流式连接
  // ============================================================================

  const connectStream = (sid: string) => {
    eventSource?.close();
    currentStreamMessageLocalId = "";

    const streamParams = new URLSearchParams();
    const currentLimit =
      core.getCachedSessionSnapshot(sid)?.historyMeta.limit ||
      80;
    streamParams.set("limit", String(currentLimit));
    eventSource = new EventSource(
      `/api/sessions/${sid}/stream?${streamParams.toString()}`,
    );

    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data) as StreamEvent & {
        session?: SessionSnapshot;
      };

      if (payload.type === "snapshot" && payload.session) {
        core.syncSessions(payload.session);
        // 更新本标签的本地状态
        messages.value =
          core.getCachedSessionSnapshot(sid)?.messages ??
          payload.session.messages;
        status.value = payload.session.status;
        isSending.value = payload.session.status === "streaming";
        composer.isSending = payload.session.status === "streaming";
        composer.canAbort = payload.session.status === "streaming";
        core.syncComposerSelection(composer, payload.session);
        return;
      }

      if (payload.type === "status" && payload.status) {
        status.value = payload.status;
        isSending.value = payload.status === "streaming";
        composer.isSending = payload.status === "streaming";
        composer.canAbort = payload.status === "streaming";
        core.patchSessionSummary(sid, {
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
        core.patchSessionSnapshot(sid, (snapshot) => ({
          ...snapshot,
          status: "error",
          updatedAt: Date.now(),
        }));
        core.patchSessionSummary(sid, {
          status: "error",
          updatedAt: Date.now(),
        });
        core.restorePendingDraft(composer, sid);
        return;
      }

      if (payload.type === "message_start" && payload.message) {
        currentStreamMessageLocalId = core.createLocalId();
        core.appendMessageToSession(sid, {
          role: payload.message.role,
          content: payload.message.content,
          timestamp: payload.message.timestamp ?? Date.now(),
          pending: true,
          localId: currentStreamMessageLocalId,
        });
        // 更新本地 messages 视图
        const snapshot = core.getCachedSessionSnapshot(sid);
        if (snapshot) {
          messages.value = [...snapshot.messages];
        }
        return;
      }

      if (payload.type === "message_end" && payload.message) {
        const finalMessage = core.createRawMessage(payload.message, {
          pending: false,
          localId: currentStreamMessageLocalId || core.createLocalId(),
        });

        core.patchSessionSnapshot(sid, (snapshot) => {
          const pendingIndex = snapshot.messages.findIndex(
            (message) =>
              message.pending === true &&
              message.localId === finalMessage.localId,
          );

          if (pendingIndex < 0) {
            return {
              ...snapshot,
              messages: [...snapshot.messages, finalMessage],
              historyMeta: core.expandVisibleHistoryMeta(
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

        // 更新本地 messages 视图
        const snapshot = core.getCachedSessionSnapshot(sid);
        if (snapshot) {
          messages.value = [...snapshot.messages];
        }

        currentStreamMessageLocalId = "";
        isSending.value = false;
        composer.isSending = false;
        composer.canAbort = false;
        status.value = "idle";
        core.clearPendingDraft(composer, sid);
        core.patchSessionSummary(sid, {
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

  const disconnectStream = () => {
    eventSource?.close();
    eventSource = null;
    currentStreamMessageLocalId = "";
  };

  // ============================================================================
  // 会话加载
  // ============================================================================

  const applySnapshotToSession = (
    snapshot: SessionSnapshot,
    options?: { connectStream?: boolean },
  ) => {
    activeDraftContext.value = null;
    status.value = snapshot.status;
    isSending.value = snapshot.status === "streaming";
    composer.isSending = snapshot.status === "streaming";
    composer.canAbort = snapshot.status === "streaming";
    core.syncSessions(snapshot);
    core.syncComposerSelection(composer, snapshot);
    core.applyDraftForSession(composer, snapshot.id);
    messages.value =
      core.getCachedSessionSnapshot(snapshot.id)?.messages ?? snapshot.messages;

    if (options?.connectStream !== false) {
      connectStream(snapshot.id);
    }

    void core.prefetchNeighborSessions(snapshot.id);
  };

  const loadSession = async (sid: string) => {
    const cachedSnapshot = core.getCachedSessionSnapshot(sid);
    if (cachedSnapshot) {
      applySnapshotToSession(cachedSnapshot);
      await Promise.all([
        core.refreshAgents(cachedSnapshot.cwd),
        core.refreshResources({
          cwd: cachedSnapshot.cwd,
          sessionId: cachedSnapshot.id,
        }),
      ]);
      return;
    }

    const snapshot = await core.hydrateSession(sid);
    applySnapshotToSession(snapshot);
    await Promise.all([
      core.refreshAgents(snapshot.cwd),
      core.refreshResources({ cwd: snapshot.cwd, sessionId: snapshot.id }),
    ]);
  };

  // ============================================================================
  // 消息发送
  // ============================================================================

  const ensureSession = async () => {
    if (sessionIdRef.value) {
      return sessionIdRef.value;
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

  const createAndLoadSession = async (options?: {
    cwd?: string;
    title?: string;
    model?: string;
    thinkingLevel?: ThinkingLevel | null;
    parentSessionId?: string;
    agent?: string | null;
    inheritDraftFromNewSession?: boolean;
  }) => {
    const wasDraftTab = !sessionIdRef.value;

    if (composer.sessionId !== null) {
      core.updateDraftValue(composer.sessionId, composer.draftText);
    }

    const snapshot = await createSession(
      omitUndefined({
        cwd:
          options?.cwd ??
          activeSession.value?.cwd ??
          activeDraftContext.value?.cwd,
        title: options?.title,
        model: options?.model ?? (composer.selectedModel || undefined),
        thinkingLevel:
          options?.thinkingLevel ?? (composer.selectedThinkingLevel || null),
        parentSessionId: options?.parentSessionId,
        agent: options?.agent ?? (composer.selectedAgent || null),
      }),
    );

    if (options?.inheritDraftFromNewSession) {
      core.moveDraftValue(null, snapshot.id);
    }

    if (wasDraftTab) {
      updateTab(tabIdRef.value, {
        sessionId: snapshot.id,
        title: snapshot.title || core.fallbackSessionTitle,
        cwd: snapshot.cwd,
        status: snapshot.status,
        parentSessionId: snapshot.parentSessionId || "",
      });
    }

    applySnapshotToSession(snapshot);
    await Promise.all([
      core.refreshAgents(snapshot.cwd),
      core.refreshResources({ cwd: snapshot.cwd, sessionId: snapshot.id }),
    ]);
    await core.refreshSessions();
    return snapshot;
  };

  const submit = async () => {
    const prompt = composer.draftText.trim();
    if (!prompt || composer.isSending) {
      return;
    }

    if (!sessionIdRef.value && !activeDraftContext.value?.cwd) {
      error.value = "请先选择项目";
      return;
    }

    const resolvedModel = effectiveModel.value;
    if (!resolvedModel) {
      error.value = "当前没有可用模型，无法发送";
      return;
    }

    if (
      composer.selectedAgent &&
      !core.agents.value.some((agent) => agent.name === composer.selectedAgent)
    ) {
      error.value = `当前选择的 Agent 已不可用: ${composer.selectedAgent}`;
      return;
    }

    error.value = "";
    const effectiveAgentName = effectiveAgent.value || null;
    let optimisticMessageLocalId = "";

    try {
      const sid = await ensureSession();
      const hasExistingMessages =
        (core.getCachedSessionSnapshot(sid)?.messages.length ?? 0) > 0;

      // 创建乐观用户消息
      const optimisticMessage: ChatMessage = {
        role: "user",
        content: prompt,
        timestamp: Date.now(),
        localId: core.createLocalId(),
      };
      optimisticMessageLocalId = optimisticMessage.localId || "";

      composer.pendingPrompt = prompt;
      composer.isSending = true;
      composer.canAbort = true;
      isSending.value = true;
      status.value = "streaming";
      core.appendMessageToSession(sid, optimisticMessage);
      // 更新本地 messages 视图
      const snapshotAfter = core.getCachedSessionSnapshot(sid);
      if (snapshotAfter) {
        messages.value = [...snapshotAfter.messages];
      }

      // 清空草稿
      composer.draftText = "";
      composer.hasDraft = false;

      if (!hasExistingMessages) {
        core.patchSessionSummary(sid, {
          title: prompt.slice(0, 24).trim() || core.fallbackSessionTitle,
          updatedAt: Date.now(),
        });
      }

      await sendMessage(
        sid,
        omitUndefined({
          prompt,
          model: composer.selectedModel || undefined,
          thinkingLevel: composer.selectedThinkingLevel || undefined,
          agent: effectiveAgentName,
        }),
      );

      core.clearDraftValue(sid);
      core.clearDraftValue(null);
      core.patchSessionSummary(
        sid,
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

      if (sessionIdRef.value && optimisticMessageLocalId) {
        core.patchSessionSnapshot(sessionIdRef.value, (snapshot) => ({
          ...snapshot,
          messages: snapshot.messages.filter(
            (message) => message.localId !== optimisticMessageLocalId,
          ),
          historyMeta: core.expandVisibleHistoryMeta(
            snapshot.historyMeta,
            snapshot.messages.filter(
              (message) => message.localId !== optimisticMessageLocalId,
            ).length,
          ),
          status: "error",
        }));
      }

      core.restorePendingDraft(composer, sessionIdRef.value || undefined);
    }
  };

  const abort = async () => {
    if (!sessionIdRef.value || !composer.isSending) {
      return;
    }

    await abortSessionApi(sessionIdRef.value);
    isSending.value = false;
    composer.isSending = false;
    composer.canAbort = false;
    currentStreamMessageLocalId = "";
    status.value = "idle";
    core.restorePendingDraft(composer, sessionIdRef.value);
    core.patchSessionSummary(sessionIdRef.value, {
      status: "idle",
      updatedAt: Date.now(),
    });
  };

  // ============================================================================
  // 加载更多历史消息
  // ============================================================================

  const loadEarlier = async () => {
    if (!sessionIdRef.value || isLoadingOlder.value) {
      return;
    }

    const sid = sessionIdRef.value;
    const currentSnapshot = core.getCachedSessionSnapshot(sid);
    if (!currentSnapshot?.historyMeta.hasMoreAbove) {
      return;
    }

    const nextLimit = Math.min(
      currentSnapshot.historyMeta.totalCount,
      currentSnapshot.historyMeta.limit + 80,
    );

    if (nextLimit <= currentSnapshot.historyMeta.loadedCount) {
      return;
    }

    core.sessionLoadingOlderById.value = {
      ...core.sessionLoadingOlderById.value,
      [sid]: true,
    };

    try {
      // getSession already imported
      const snapshot = await getSession(sid, { limit: nextLimit });
      core.syncSessions(snapshot);
      messages.value = snapshot.messages;
    } finally {
      core.sessionLoadingOlderById.value = {
        ...core.sessionLoadingOlderById.value,
        [sid]: false,
      };
    }
  };

  // ============================================================================
  // 交互式请求响应
  // ============================================================================

  const respondToPendingAsk = async (
    sid: string,
    askId: string,
    answers: AskQuestionAnswer[],
  ) => {
    core.patchSessionSnapshot(sid, (snapshot) => ({
      ...snapshot,
      status: "streaming",
      interactiveRequests: snapshot.interactiveRequests.filter(
        (request) => request.id !== askId,
      ),
      updatedAt: Date.now(),
    }));
    core.patchSessionSummary(sid, {
      status: "streaming",
      updatedAt: Date.now(),
    });
    status.value = "streaming";
    isSending.value = true;
    composer.isSending = true;
    composer.canAbort = true;

    try {
      await respondToAsk(sid, askId, {
        action: "submit",
        answers,
      });
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
      // getSession already imported
      const snapshot = await getSession(sid, {
        limit: core.getCachedSessionSnapshot(sid)?.historyMeta.limit,
      });
      core.syncSessions(snapshot);
      messages.value = snapshot.messages;
    }
  };

  const dismissPendingAsk = async (sid: string, askId: string) => {
    core.patchSessionSnapshot(sid, (snapshot) => ({
      ...snapshot,
      status: "streaming",
      interactiveRequests: snapshot.interactiveRequests.filter(
        (request) => request.id !== askId,
      ),
      updatedAt: Date.now(),
    }));
    core.patchSessionSummary(sid, {
      status: "streaming",
      updatedAt: Date.now(),
    });
    status.value = "streaming";
    isSending.value = true;
    composer.isSending = true;
    composer.canAbort = true;

    try {
      await respondToAsk(sid, askId, {
        action: "dismiss",
      });
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
      // getSession already imported
      const snapshot = await getSession(sid, {
        limit: core.getCachedSessionSnapshot(sid)?.historyMeta.limit,
      });
      core.syncSessions(snapshot);
      messages.value = snapshot.messages;
    }
  };

  const respondToPendingPermission = async (
    sid: string,
    requestId: string,
    action: "once" | "always" | "reject",
  ) => {
    core.patchSessionSnapshot(sid, (snapshot) => ({
      ...snapshot,
      status: "streaming",
      permissionRequests: snapshot.permissionRequests.filter(
        (request) => request.id !== requestId,
      ),
      updatedAt: Date.now(),
    }));
    core.patchSessionSummary(sid, {
      status: "streaming",
      updatedAt: Date.now(),
    });
    status.value = "streaming";
    isSending.value = true;
    composer.isSending = true;
    composer.canAbort = true;

    try {
      await respondToPermissionRequest(sid, requestId, { action });
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
      // getSession already imported
      const snapshot = await getSession(sid, {
        limit: core.getCachedSessionSnapshot(sid)?.historyMeta.limit,
      });
      core.syncSessions(snapshot);
      messages.value = snapshot.messages;
    }
  };

  // ============================================================================
  // 会话设置
  // ============================================================================

  const setSelectedAgent = async (agentName: string) => {
    const nextAgent = agentName.trim();
    const previousAgent = composer.selectedAgent;
    composer.selectedAgent = nextAgent;

    // useSettingsStore already imported
    const settingsStore = useSettingsStore();
    void settingsStore.setDefaultAgent(nextAgent);

    if (!sessionIdRef.value) {
      return;
    }

    try {
      const snapshot = await core.applySelectionUpdate(sessionIdRef.value, {
        agent: nextAgent || null,
      });
      core.syncComposerSelection(composer, snapshot);
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

    // useSettingsStore already imported
    const settingsStore = useSettingsStore();
    void settingsStore.setDefaultModel(nextModel);

    if (!sessionIdRef.value) {
      return;
    }

    try {
      const snapshot = await core.applySelectionUpdate(sessionIdRef.value, {
        model: nextModel || null,
      });
      core.syncComposerSelection(composer, snapshot);
    } catch (caughtError) {
      composer.selectedModel = previousModel;
      error.value =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
    }
  };

  const setSelectedThinkingLevel = async (thinkingLevel: ThinkingLevel) => {
    const previousThinkingLevel = composer.selectedThinkingLevel;
    composer.selectedThinkingLevel = thinkingLevel;

    // useSettingsStore already imported
    const settingsStore = useSettingsStore();
    void settingsStore.setDefaultThinkingLevel(thinkingLevel);

    if (!sessionIdRef.value) {
      return;
    }

    try {
      const snapshot = await core.applySelectionUpdate(sessionIdRef.value, {
        thinkingLevel: thinkingLevel || null,
      });
      core.syncComposerSelection(composer, snapshot);
    } catch (caughtError) {
      composer.selectedThinkingLevel = previousThinkingLevel;
      error.value =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
    }
  };

  // ============================================================================
  // 草稿会话管理
  // ============================================================================

  const openSessionDraft = async (options?: {
    cwd?: string;
    parentSessionId?: string;
  }) => {
    if (composer.sessionId !== null) {
      core.updateDraftValue(composer.sessionId, composer.draftText);
    }

    const parentSession = options?.parentSessionId
      ? (core.sessions.value.find(
          (session) => session.id === options.parentSessionId,
        ) ??
        core.getCachedSessionSnapshot(options.parentSessionId) ??
        null)
      : null;

    activeDraftContext.value = {
      cwd:
        options?.cwd ||
        parentSession?.cwd ||
        activeSession.value?.cwd ||
        activeDraftContext.value?.cwd ||
        "",
      parentSessionId: options?.parentSessionId || "",
    };

    messages.value = [];
    status.value = "idle";
    isSending.value = false;
    composer.isSending = false;
    composer.canAbort = false;
    composer.pendingPrompt = "";
    currentStreamMessageLocalId = "";
    disconnectStream();

    if (parentSession) {
      // useSettingsStore already imported
      const settingsStore = useSettingsStore();
      composer.selectedAgent = parentSession.agent || settingsStore.defaultAgent || "";
      composer.selectedModel =
        parentSession.model || settingsStore.defaultModel || core.defaultModel.value;
      composer.selectedThinkingLevel =
        (parentSession.thinkingLevel as ThinkingLevel) || settingsStore.defaultThinkingLevel || "medium";
    }

    core.applyDraftForSession(composer, null);
    const nextCwd = activeDraftContext.value?.cwd || "";
    await Promise.all([
      core.refreshAgents(nextCwd || undefined),
      core.refreshResources(nextCwd ? { cwd: nextCwd } : undefined),
    ]);
  };

  const setDraftProjectPath = async (cwd: string) => {
    const normalizedCwd = cwd.trim();
    if (!normalizedCwd || sessionIdRef.value) {
      return;
    }

    activeDraftContext.value = {
      cwd: normalizedCwd,
      parentSessionId: activeDraftContext.value?.parentSessionId || "",
    };

    await Promise.all([
      core.refreshAgents(normalizedCwd),
      core.refreshResources({ cwd: normalizedCwd }),
    ]);
  };

  const setComposerFocused = (focused: boolean) => {
    composer.isFocused = focused;
  };

  // ============================================================================
  // 生命周期
  // ============================================================================

  // Draft watch - 自动保存草稿
  core.startDraftWatch(composer);

  watch(
    activeTabId,
    (newActiveId) => {
      if (newActiveId === tabIdRef.value) {
        // 本标签变为活动
        if (sessionIdRef.value && (status.value === "streaming" || core.getCachedSessionSnapshot(sessionIdRef.value)?.status === "streaming")) {
          connectStream(sessionIdRef.value);
        }
      } else if (eventSource) {
        // 本标签变为非活动，断开 SSE 节省资源
        disconnectStream();
      }
    },
    { immediate: true },
  );
  // 组件卸载时，断开 SSE
  onBeforeUnmount(() => {
    disconnectStream();
  });

  return {
    // Per-session state
    sessionId: sessionIdRef,
    activeSession,
    messages,
    status,
    isSending,
    error,
    composer,
    activeDraftContext,
    interactiveRequests,
    permissionRequests,
    hasMoreAbove,
    isLoadingOlder,
    activeHistoryMeta,
    isDraftSession,
    currentSessionTitle,
    fileTreeRoot,
    effectiveModel,
    effectiveThinkingLevel,
    effectiveAgent,
    mentionedAgent,

    // Methods
    loadSession,
    submit,
    abort,
    loadEarlier,
    createAndLoadSession,
    ensureSession,
    openSessionDraft,
    setDraftProjectPath,
    setComposerFocused,
    setSelectedAgent,
    setSelectedModel,
    setSelectedThinkingLevel,
    respondToPendingAsk,
    dismissPendingAsk,
    respondToPendingPermission,
    disconnectStream,
    connectStream,
    applySnapshotToSession,

    // Core reference (for accessing global state)
    core,
  };
}

export type PerSessionChat = ReturnType<typeof usePerSessionChat>;
