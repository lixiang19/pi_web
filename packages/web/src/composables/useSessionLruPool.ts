import { computed, ref } from "vue";

export interface LruPoolEntry {
  sessionId: string;
  lastAccessedAt: number;
  isStreaming: boolean;
}

export interface DraftViewState {
  key: string;
  cwd: string;
  parentSessionId: string;
  sessionId?: string;
}

const MAX_POOL_SIZE = 5;
const pool = ref<LruPoolEntry[]>([]);
const activeSessionIdState = ref<string | null>(null);
const draftViewState = ref<DraftViewState | null>(null);

const now = () => Date.now();
const createDraftKey = () =>
  `draft:${Date.now()}-${Math.random().toString(16).slice(2)}`;

const upsertPoolEntry = (sessionId: string) => {
  const previous = pool.value.find((entry) => entry.sessionId === sessionId);
  const existing = pool.value.filter((entry) => entry.sessionId !== sessionId);
  pool.value = [
    {
      sessionId,
      lastAccessedAt: now(),
      isStreaming: previous?.isStreaming ?? false,
    },
    ...existing,
  ];
};

const getEvictCandidate = () =>
  pool.value
    .slice(1)
    .reverse()
    .find((entry) => !entry.isStreaming)?.sessionId ?? null;

const trimPool = () => {
  while (pool.value.length > MAX_POOL_SIZE) {
    const candidate = getEvictCandidate();
    if (!candidate) {
      return;
    }
    pool.value = pool.value.filter((entry) => entry.sessionId !== candidate);
  }
};

export const resetSessionLruPoolForTest = () => {
  pool.value = [];
  activeSessionIdState.value = null;
  draftViewState.value = null;
};

export function useSessionLruPool() {
  const activateDraft = (payload?: {
    cwd?: string;
    parentSessionId?: string;
  }) => {
    draftViewState.value = {
      key: createDraftKey(),
      cwd: payload?.cwd ?? "",
      parentSessionId: payload?.parentSessionId ?? "",
    };
    activeSessionIdState.value = null;
  };

  const promoteDraftToSession = (sessionId: string) => {
    if (!draftViewState.value) {
      activateSession(sessionId);
      return;
    }

    draftViewState.value = {
      ...draftViewState.value,
      sessionId,
    };
    upsertPoolEntry(sessionId);
    trimPool();
    activeSessionIdState.value = sessionId;
  };

  const setStreaming = (sessionId: string, streaming: boolean) => {
    pool.value = pool.value.map((entry) =>
      entry.sessionId === sessionId ? { ...entry, isStreaming: streaming } : entry,
    );

    if (!streaming) {
      trimPool();
    }
  };

  const activateSession = (sessionId: string) => {
    if (draftViewState.value?.sessionId !== sessionId) {
      draftViewState.value = null;
    }
    upsertPoolEntry(sessionId);
    trimPool();
    activeSessionIdState.value = sessionId;
  };

  const removeSession = (sessionId: string) => {
    pool.value = pool.value.filter((entry) => entry.sessionId !== sessionId);

    if (draftViewState.value?.sessionId === sessionId) {
      draftViewState.value = null;
    }

    if (activeSessionIdState.value === sessionId) {
      activeSessionIdState.value = pool.value[0]?.sessionId ?? null;
    }
  };

  const isInPool = (sessionId: string) =>
    pool.value.some((entry) => entry.sessionId === sessionId);

  return {
    pool,
    draftView: computed(() => draftViewState.value),
    activeSessionId: computed(() => activeSessionIdState.value),
    isViewingDraft: computed(() => draftViewState.value !== null && !draftViewState.value.sessionId),
    currentViewId: computed(() =>
      draftViewState.value && !draftViewState.value.sessionId
        ? draftViewState.value.key
        : activeSessionIdState.value,
    ),
    activateDraft,
    promoteDraftToSession,
    setStreaming,
    activateSession,
    removeSession,
    getEvictCandidate,
    isInPool,
  };
}
