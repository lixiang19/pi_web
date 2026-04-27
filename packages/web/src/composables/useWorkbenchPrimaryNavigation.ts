import { computed } from "vue";
import type { Component } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Bot,
  BookOpen,
  FolderKanban,
  PlusSquare,
  Search,
  Settings2,
  TerminalSquare,
} from "lucide-vue-next";
import { usePiChatCore } from "@/composables/usePiChatCore";
import { useSessionLruPool } from "@/composables/useSessionLruPool";

export type WorkbenchPrimaryRoute =
  | "chat"
  | "search"
  | "notes"
  | "files"
  | "terminal"
  | "automations"
  | "datasets"
  | "spaces"
  | "settings";

export interface WorkbenchNavItem {
  route: Exclude<WorkbenchPrimaryRoute, "chat">;
  label: string;
  icon: Component;
}

export const workbenchPrimaryNavItems: WorkbenchNavItem[] = [
  { route: "search", label: "搜索", icon: Search },
  { route: "notes", label: "笔记", icon: BookOpen },
  { route: "files", label: "文件", icon: FolderKanban },
  { route: "terminal", label: "终端", icon: TerminalSquare },
  { route: "automations", label: "自动化", icon: Bot },
  { route: "settings", label: "设置", icon: Settings2 },
];

export const newChatNavItem = {
  label: "新聊天",
  icon: PlusSquare,
} as const;

export function useWorkbenchPrimaryNavigation() {
  const route = useRoute();
  const router = useRouter();
  const core = usePiChatCore();
  const lru = useSessionLruPool();

  const activeRoute = computed<WorkbenchPrimaryRoute>(() => {
    const currentName = route.name;
    if (typeof currentName !== "string") {
      return "chat";
    }

    return (currentName as WorkbenchPrimaryRoute) || "chat";
  });

  const isChatRoute = computed(() => activeRoute.value === "chat");

  const navigateToRoute = async (targetRoute: WorkbenchPrimaryRoute) => {
    if (route.name === targetRoute) {
      return;
    }

    await router.push({ name: targetRoute });
  };

  const resolveDraftPayload = (payload: {
    cwd?: string;
    parentSessionId?: string;
  }) => {
    const currentSessionId = lru.activeSessionId.value;
    const activeSnapshot = currentSessionId
      ? core.getCachedSessionSnapshot(currentSessionId)
      : null;
    const activeSummary = currentSessionId
      ? core.sessions.value.find((session) => session.id === currentSessionId)
      : null;

    return {
      cwd:
        payload.cwd ||
        core.info.value?.chatProjectPath ||
        activeSnapshot?.cwd ||
        activeSummary?.cwd ||
        core.info.value?.workspaceDir ||
        "",
      parentSessionId: payload.parentSessionId || "",
    };
  };

  const createChat = async (payload: {
    cwd?: string;
    parentSessionId?: string;
  }) => {
    await navigateToRoute("chat");
    lru.activateDraft(resolveDraftPayload(payload));
  };

  const openChatSession = async (sessionId: string) => {
    await navigateToRoute("chat");
    lru.activateSession(sessionId);
  };

  return {
    activeRoute,
    isChatRoute,
    newChatNavItem,
    primaryNavItems: workbenchPrimaryNavItems,
    navigateToRoute,
    createChat,
    openChatSession,
  };
}
