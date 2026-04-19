import { computed, ref } from "vue";

import {
  createTerminal,
  deleteTerminal,
  getTerminals,
  restartTerminal,
  updateTerminal,
} from "@/lib/api";
import type {
  TerminalCreateRequest,
  TerminalRestartRequest,
  TerminalSnapshot,
} from "@/lib/types";

const sortTerminals = (items: TerminalSnapshot[]) =>
  [...items].sort((left, right) => left.createdAt - right.createdAt);

const replaceTerminal = (
  items: TerminalSnapshot[],
  terminal: TerminalSnapshot,
) => {
  const nextItems = items.filter((item) => item.id !== terminal.id);
  return sortTerminals([...nextItems, terminal]);
};

export function useTerminalPool() {
  const terminals = ref<TerminalSnapshot[]>([]);
  const activeTerminalId = ref("");
  const splitTerminalId = ref("");
  const isLoading = ref(false);
  const isMutating = ref(false);
  const error = ref("");

  const activeTerminal = computed(
    () => terminals.value.find((item) => item.id === activeTerminalId.value) ?? null,
  );

  const splitTerminal = computed(
    () => terminals.value.find((item) => item.id === splitTerminalId.value) ?? null,
  );

  const visibleTerminals = computed(() => {
    const visible = [activeTerminal.value, splitTerminal.value].filter(
      (item): item is TerminalSnapshot => Boolean(item),
    );
    return visible.filter(
      (item, index, items) => items.findIndex((entry) => entry.id === item.id) === index,
    );
  });

  const syncSelection = () => {
    if (!terminals.value.some((item) => item.id === activeTerminalId.value)) {
      activeTerminalId.value = terminals.value[0]?.id || "";
    }

    if (
      !splitTerminalId.value ||
      splitTerminalId.value === activeTerminalId.value ||
      !terminals.value.some((item) => item.id === splitTerminalId.value)
    ) {
      splitTerminalId.value = "";
    }
  };

  const applyTerminals = (items: TerminalSnapshot[]) => {
    terminals.value = sortTerminals(items);
    syncSelection();
  };

  const load = async (options?: {
    ensureInitial?: boolean;
    defaultCreatePayload?: TerminalCreateRequest;
  }) => {
    isLoading.value = true;
    error.value = "";

    try {
      const payload = await getTerminals();
      applyTerminals(payload.terminals);

      if (options?.ensureInitial !== false && terminals.value.length === 0) {
        await createNewTerminal(options?.defaultCreatePayload);
      }

      return terminals.value;
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      throw caughtError;
    } finally {
      isLoading.value = false;
    }
  };

  const createNewTerminal = async (
    payload?: TerminalCreateRequest,
    options?: { focus?: "active" | "split" },
  ) => {
    isMutating.value = true;
    error.value = "";

    try {
      const terminal = await createTerminal(payload);
      terminals.value = replaceTerminal(terminals.value, terminal);

      if (options?.focus === "split" && activeTerminalId.value) {
        splitTerminalId.value = terminal.id;
      } else {
        activeTerminalId.value = terminal.id;
      }

      syncSelection();
      return terminal;
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      throw caughtError;
    } finally {
      isMutating.value = false;
    }
  };

  const activateTerminal = (terminalId: string) => {
    if (!terminals.value.some((item) => item.id === terminalId)) {
      return;
    }

    activeTerminalId.value = terminalId;
    if (splitTerminalId.value === terminalId) {
      splitTerminalId.value = "";
    }
  };

  const setSplitTerminal = (terminalId: string) => {
    if (
      !terminalId ||
      terminalId === activeTerminalId.value ||
      !terminals.value.some((item) => item.id === terminalId)
    ) {
      splitTerminalId.value = "";
      return;
    }

    splitTerminalId.value = terminalId;
  };

  const openSplit = async () => {
    if (!activeTerminal.value) {
      return null;
    }

    if (splitTerminalId.value) {
      return splitTerminal.value;
    }

    const sibling = terminals.value.find((item) => item.id !== activeTerminalId.value);
    if (sibling) {
      splitTerminalId.value = sibling.id;
      return sibling;
    }

    return createNewTerminal(
      { cwd: activeTerminal.value.cwd },
      { focus: "split" },
    );
  };

  const closeSplit = () => {
    splitTerminalId.value = "";
  };

  const renameTerminalTitle = async (terminalId: string, title: string) => {
    isMutating.value = true;
    error.value = "";

    try {
      const terminal = await updateTerminal(terminalId, { title });
      terminals.value = replaceTerminal(terminals.value, terminal);
      syncSelection();
      return terminal;
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      throw caughtError;
    } finally {
      isMutating.value = false;
    }
  };

  const restartTerminalSession = async (
    terminalId: string,
    payload: TerminalRestartRequest,
  ) => {
    isMutating.value = true;
    error.value = "";

    try {
      const terminal = await restartTerminal(terminalId, payload);
      terminals.value = replaceTerminal(terminals.value, terminal);
      syncSelection();
      return terminal;
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      throw caughtError;
    } finally {
      isMutating.value = false;
    }
  };

  const closeTerminal = async (terminalId: string) => {
    isMutating.value = true;
    error.value = "";

    try {
      await deleteTerminal(terminalId);
      terminals.value = terminals.value.filter((item) => item.id !== terminalId);

      if (activeTerminalId.value === terminalId) {
        activeTerminalId.value = splitTerminalId.value || terminals.value[0]?.id || "";
      }

      if (splitTerminalId.value === terminalId) {
        splitTerminalId.value = "";
      }

      syncSelection();
      return true;
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      throw caughtError;
    } finally {
      isMutating.value = false;
    }
  };

  return {
    activeTerminal,
    activeTerminalId,
    activateTerminal,
    closeSplit,
    closeTerminal,
    createNewTerminal,
    error,
    isLoading,
    isMutating,
    load,
    openSplit,
    renameTerminalTitle,
    restartTerminalSession,
    setSplitTerminal,
    splitTerminal,
    splitTerminalId,
    terminals,
    visibleTerminals,
  };
}