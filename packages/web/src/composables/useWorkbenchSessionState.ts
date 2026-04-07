import { computed } from "vue";

import { usePiChat } from "@/composables/usePiChat";
import type { ThinkingLevel } from "@/lib/types";

export const NO_AGENT_VALUE = "__pi-no-agent__";
export const AUTO_MODEL_VALUE = "__pi-auto-model__";
export const AUTO_THINKING_VALUE = "__pi-auto-thinking__";

export const thinkingOptions: Array<{ value: ThinkingLevel; label: string }> = [
  { value: "off", label: "关闭思考" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "XHigh" },
];

type PiChatState = ReturnType<typeof usePiChat>;

const normalizePath = (value: string) =>
  value.replace(/\\/g, "/").replace(/\/+$/, "");

export const formatProjectLabel = (cwd: string) => {
  const normalized = normalizePath(cwd);
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) || cwd;
};

export function useWorkbenchSessionState(chat: PiChatState) {
  const statusLabel = computed(() => {
    if (chat.status.value === "streaming") {
      return "Pi 正在执行";
    }

    if (chat.status.value === "error") {
      return "会话异常";
    }

    return "系统就绪";
  });

  const statusTone = computed(() => {
    if (chat.status.value === "streaming") {
      return "border-amber-400/30 bg-amber-500/10 text-amber-100";
    }

    if (chat.status.value === "error") {
      return "border-red-400/30 bg-red-500/10 text-red-100";
    }

    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  });

  const isDraftSession = computed(() => !chat.activeSession.value);
  const currentSessionTitle = computed(() => {
    if (chat.activeSession.value?.title) {
      return chat.activeSession.value.title;
    }

    if (chat.activeDraftContext.value?.parentSessionId) {
      return "新的分支草稿";
    }

    return "新的 Pi 会话";
  });

  const parentSessionId = computed(
    () =>
      chat.activeSession.value?.parentSessionId ||
      chat.activeDraftContext.value?.parentSessionId ||
      "",
  );

  const fileTreeRoot = computed(
    () =>
      chat.activeSession.value?.cwd ||
      chat.activeDraftContext.value?.cwd ||
      chat.info.value?.workspaceDir ||
      "",
  );

  const sessionSidebarProps = computed(() => {
    const nextProps: {
      sessions: typeof chat.sessions.value;
      activeSessionId: string;
      isSending: boolean;
      workspaceDir?: string;
    } = {
      sessions: chat.sessions.value,
      activeSessionId: chat.activeSessionId.value,
      isSending: chat.isSending.value,
    };

    if (chat.info.value?.workspaceDir) {
      nextProps.workspaceDir = chat.info.value.workspaceDir;
    }

    return nextProps;
  });

  const formatShortPath = (cwd: string) => {
    const normalizedWorkspace = normalizePath(chat.info.value?.workspaceDir || "");
    const normalized = normalizePath(cwd);

    if (normalizedWorkspace && normalized.startsWith(normalizedWorkspace)) {
      const relative = normalized
        .slice(normalizedWorkspace.length)
        .replace(/^\//, "");
      return relative || ".";
    }

    return normalized;
  };

  const normalizeSelectValue = (value: unknown) =>
    typeof value === "string" ? value : "";

  const handleAgentSelection = async (value: unknown) => {
    const nextValue = normalizeSelectValue(value);
    await chat.setSelectedAgent(nextValue === NO_AGENT_VALUE ? "" : nextValue);
  };

  const handleModelSelection = async (value: unknown) => {
    const nextValue = normalizeSelectValue(value);
    await chat.setSelectedModel(nextValue === AUTO_MODEL_VALUE ? "" : nextValue);
  };

  const handleThinkingSelection = async (value: unknown) => {
    const nextValue = normalizeSelectValue(value);
    await chat.setSelectedThinkingLevel(
      nextValue === AUTO_THINKING_VALUE ? "" : (nextValue as ThinkingLevel),
    );
  };

  const createSidebarSession = async (payload: {
    cwd?: string;
    parentSessionId?: string;
  }) => {
    const draftOptions: { cwd?: string; parentSessionId?: string } = {};
    const resolvedCwd =
      payload.cwd || chat.activeSession.value?.cwd || chat.info.value?.workspaceDir;

    if (resolvedCwd) {
      draftOptions.cwd = resolvedCwd;
    }

    if (payload.parentSessionId) {
      draftOptions.parentSessionId = payload.parentSessionId;
    }

    await chat.openSessionDraft(draftOptions);
  };

  const openSession = async (sessionId: string) => {
    if (sessionId === chat.activeSessionId.value) {
      return;
    }

    await chat.loadSession(sessionId);
  };

  const returnToParentSession = async () => {
    if (!parentSessionId.value) {
      return;
    }

    await chat.loadSession(parentSessionId.value);
  };

  return {
    currentSessionTitle,
    createSidebarSession,
    fileTreeRoot,
    formatProjectLabel,
    formatShortPath,
    handleAgentSelection,
    handleModelSelection,
    handleThinkingSelection,
    isDraftSession,
    openSession,
    parentSessionId,
    returnToParentSession,
    sessionSidebarProps,
    statusLabel,
    statusTone,
  };
}