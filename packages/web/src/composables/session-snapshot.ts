import type { Ref } from "vue";
import {
  getSessionHydrate,
} from "@/lib/api";
import type {
  SessionContextSummary,
  SessionHistoryMeta,
  SessionMessagesPayload,
  SessionRuntimePayload,
  SessionSnapshot,
  SessionSummary,
  StreamEvent,
} from "@/lib/types";

export type CachedSessionEntry = {
  snapshot: SessionSnapshot;
  hydratedAt: number;
};

interface SessionSnapshotStore {
  sessions: Ref<SessionSummary[]>;
  sessionContexts: Ref<Record<string, SessionContextSummary>>;
  sessionCache: Ref<Record<string, CachedSessionEntry>>;
}

interface HydrateSessionSnapshotOptions extends SessionSnapshotStore {
  sessionId: string;
  createHistoryMeta: (
    loadedRounds: number,
    totalRounds: number,
    roundWindow?: number,
  ) => SessionHistoryMeta;
  loadSessionInFlightById: Map<string, Promise<SessionSnapshot>>;
  loadSessionRequestSeqById: Map<string, number>;
  refreshSessions: () => Promise<SessionSummary[]>;
  refreshSessionContexts?: () => Promise<Record<string, SessionContextSummary>>;
}

const buildSummarySnapshot = (
  summary: SessionSummary,
  createHistoryMeta: HydrateSessionSnapshotOptions["createHistoryMeta"],
): SessionSnapshot => ({
  ...summary,
  messages: [],
  historyMeta: createHistoryMeta(0, 0),
  interactiveRequests: [],
  permissionRequests: [],
});

export const buildSnapshotFromSummary = (
  store: SessionSnapshotStore,
  sessionId: string,
  createHistoryMeta: HydrateSessionSnapshotOptions["createHistoryMeta"],
): SessionSnapshot | null => {
  const summary = store.sessions.value.find((session) => session.id === sessionId);
  if (!summary) {
    return null;
  }

  return buildSummarySnapshot(summary, createHistoryMeta);
};

export const buildSnapshotFromPayloads = (
  summary: SessionSummary,
  messagesPayload: SessionMessagesPayload,
  runtimePayload: SessionRuntimePayload | undefined,
  sessionContexts: Record<string, SessionContextSummary>,
): SessionSnapshot => {
  const context = summary.contextId
    ? sessionContexts[summary.contextId]
    : undefined;

  return {
    ...summary,
    agent: runtimePayload?.agent ?? summary.agent,
    model: runtimePayload?.model ?? summary.model,
    thinkingLevel: runtimePayload?.thinkingLevel ?? summary.thinkingLevel,
    resolvedModel: runtimePayload?.resolvedModel ?? summary.resolvedModel,
    resolvedThinkingLevel: runtimePayload?.resolvedThinkingLevel ?? summary.resolvedThinkingLevel,
    projectId: context?.projectId ?? summary.projectId,
    projectRoot: context?.projectRoot ?? summary.projectRoot,
    projectLabel: context?.projectLabel ?? summary.projectLabel,
    isGit: context?.isGit ?? summary.isGit,
    branch: context?.branch ?? summary.branch,
    worktreeRoot: context?.worktreeRoot ?? summary.worktreeRoot,
    worktreeLabel: context?.worktreeLabel ?? summary.worktreeLabel,
    messages: messagesPayload.messages,
    historyMeta: messagesPayload.historyMeta,
    interactiveRequests: messagesPayload.interactiveRequests,
    permissionRequests: messagesPayload.permissionRequests,
  };
};

export const upsertSessionSnapshot = (
  sessionCache: Ref<Record<string, CachedSessionEntry>>,
  snapshot: SessionSnapshot,
) => {
  sessionCache.value[snapshot.id] = {
    snapshot: {
      ...snapshot,
      messages: [...snapshot.messages],
    },
    hydratedAt: Date.now(),
  };
};

export const upsertSessionSummary = (
  sessions: Ref<SessionSummary[]>,
  summary: SessionSummary,
) => {
  const list = sessions.value;
  const existingIndex = list.findIndex((session) => session.id === summary.id);

  if (existingIndex >= 0) {
    list.splice(existingIndex, 1, summary);
  } else {
    list.push(summary);
  }

  // Only re-sort if the updated session may have moved
  if (
    existingIndex !== 0 &&
    (existingIndex < 0 || summary.updatedAt > (list[0]?.updatedAt ?? 0))
  ) {
    list.sort((left, right) => right.updatedAt - left.updatedAt);
  }
};

export const syncSessionSnapshot = (
  store: SessionSnapshotStore,
  snapshot?: SessionSnapshot,
) => {
  if (!snapshot) {
    return;
  }

  upsertSessionSnapshot(store.sessionCache, snapshot);
  upsertSessionSummary(store.sessions, snapshot);
};

interface PatchSessionSnapshotOptions extends SessionSnapshotStore {
  sessionId: string;
  createHistoryMeta: HydrateSessionSnapshotOptions["createHistoryMeta"];
  updater: (snapshot: SessionSnapshot) => SessionSnapshot;
}

export const patchSessionSnapshot = (
  options: PatchSessionSnapshotOptions,
): SessionSnapshot | null => {
  const baseSnapshot =
    options.sessionCache.value[options.sessionId]?.snapshot ??
    buildSnapshotFromSummary(
      options,
      options.sessionId,
      options.createHistoryMeta,
    );
  if (!baseSnapshot) {
    return null;
  }

  const nextSnapshot = options.updater({
    ...baseSnapshot,
    messages: [...baseSnapshot.messages],
  });

  upsertSessionSnapshot(options.sessionCache, nextSnapshot);
  return nextSnapshot;
};

interface PatchSessionSummaryOptions extends SessionSnapshotStore {
  sessionId: string;
  createHistoryMeta: HydrateSessionSnapshotOptions["createHistoryMeta"];
  patch: Partial<SessionSummary>;
}

export const patchSessionSummary = (
  options: PatchSessionSummaryOptions,
) => {
  const current = options.sessions.value.find(
    (session) => session.id === options.sessionId,
  );
  if (!current) {
    return;
  }

  upsertSessionSummary(options.sessions, {
    ...current,
    ...options.patch,
  });

  patchSessionSnapshot({
    ...options,
    updater: (snapshot) => ({
      ...snapshot,
      ...options.patch,
    }),
  });
};

export const applyMessagesPayload = (
  store: SessionSnapshotStore,
  sessionId: string,
  createHistoryMeta: HydrateSessionSnapshotOptions["createHistoryMeta"],
  payload: SessionMessagesPayload,
) => {
  patchSessionSnapshot({
    ...store,
    sessionId,
    createHistoryMeta,
    updater: (snapshot) => ({
      ...snapshot,
      messages: payload.messages,
      historyMeta: payload.historyMeta,
      interactiveRequests: payload.interactiveRequests,
      permissionRequests: payload.permissionRequests,
    }),
  });
};

export const hydrateSessionSnapshot = async (
  options: HydrateSessionSnapshotOptions,
): Promise<SessionSnapshot> => {
  const cached = options.sessionCache.value[options.sessionId]?.snapshot;
  if (cached) {
    return cached;
  }
  const inFlight = options.loadSessionInFlightById.get(options.sessionId);
  if (inFlight) {
    return inFlight;
  }
  const requestSeq =
    (options.loadSessionRequestSeqById.get(options.sessionId) ?? 0) + 1;
  options.loadSessionRequestSeqById.set(options.sessionId, requestSeq);
  const loadPromise = (async () => {
    let summary =
      options.sessions.value.find((session) => session.id === options.sessionId) ??
      null;
    if (!summary) {
      const refreshedSessions = await options.refreshSessions();
      summary =
        refreshedSessions.find((session) => session.id === options.sessionId) ??
        null;
    }

    if (!summary) {
      throw new Error(`Session not found: ${options.sessionId}`);
    }

    if (
      summary.contextId &&
      !options.sessionContexts.value[summary.contextId] &&
      options.refreshSessionContexts
    ) {
      await options.refreshSessionContexts();
    }

    const hydratePayload = await getSessionHydrate(options.sessionId);
    const runtimePayload: SessionRuntimePayload = {
      sessionId: hydratePayload.sessionId,
      agent: hydratePayload.agent,
      model: hydratePayload.model,
      thinkingLevel: hydratePayload.thinkingLevel,
      resolvedModel: hydratePayload.resolvedModel,
      resolvedThinkingLevel: hydratePayload.resolvedThinkingLevel,
    };
    const messagesPayload: SessionMessagesPayload = {
      sessionId: hydratePayload.sessionId,
      messages: hydratePayload.messages,
      historyMeta: hydratePayload.historyMeta,
      interactiveRequests: hydratePayload.interactiveRequests,
      permissionRequests: hydratePayload.permissionRequests,
    };
    const snapshot = buildSnapshotFromPayloads(
      summary,
      messagesPayload,
      runtimePayload,
      options.sessionContexts.value,
    );
    const latestSeq = options.loadSessionRequestSeqById.get(options.sessionId);
    if (latestSeq !== requestSeq) {
      return options.sessionCache.value[options.sessionId]?.snapshot ?? snapshot;
    }
    syncSessionSnapshot(options, snapshot);
    return snapshot;
  })().finally(() => {
    if (options.loadSessionInFlightById.get(options.sessionId) === loadPromise) {
      options.loadSessionInFlightById.delete(options.sessionId);
    }
  });
  options.loadSessionInFlightById.set(options.sessionId, loadPromise);
  return loadPromise;
};

export const applyStreamSnapshotEvent = (
  store: SessionSnapshotStore,
  sessionId: string,
  payload: StreamEvent,
  createHistoryMeta: HydrateSessionSnapshotOptions["createHistoryMeta"],
): SessionSnapshot | null => {
  if (
    payload.type !== "snapshot" ||
    !Array.isArray(payload.messages) ||
    !payload.historyMeta ||
    !Array.isArray(payload.interactiveRequests) ||
    !Array.isArray(payload.permissionRequests)
  ) {
    return null;
  }
  return patchSessionSnapshot({
    ...store,
    sessionId,
    createHistoryMeta,
    updater: (snapshot) => ({
      ...snapshot,
      status: payload.status ?? snapshot.status,
      messages: payload.messages,
      historyMeta: payload.historyMeta,
      interactiveRequests: payload.interactiveRequests,
      permissionRequests: payload.permissionRequests,
    }),
  });
};
