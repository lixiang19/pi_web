import { computed, ref, watch } from "vue";
import { useLocalStorage } from "@vueuse/core";

const createDraftTabId = () =>
  `draft:${Date.now()}-${Math.random().toString(16).slice(2)}`;

const normalizeTabStatus = (
  status: string | undefined,
): "idle" | "streaming" | "error" => {
  if (status === "streaming" || status === "error") {
    return status;
  }
  return "idle";
};

/**
 * 打开的标签页条目
 */
export interface SessionTab {
  id: string;
  sessionId: string;
  title: string;
  cwd: string;
  status: "idle" | "streaming" | "error";
  parentSessionId?: string;
}

/**
 * 标签页管理 - 全局单例
 *
 * 管理打开的标签列表、活动标签、视图模式。
 * 状态持久化到 localStorage。
 */
const openTabs = ref<SessionTab[]>([]);
const activeTabId = ref("");
const viewMode = ref<"tabs" | "grid">("tabs");

// 从 localStorage 恢复标签页状态
const tabStorage = useLocalStorage<SessionTab[]>("pi-web.session-tabs.v1", []);
const activeTabStorage = useLocalStorage<string>("pi-web.session-tabs.active.v1", "");

// 初始化时从 localStorage 恢复
if (tabStorage.value.length > 0) {
  openTabs.value = tabStorage.value.map((tab) => ({
    id: tab.id || tab.sessionId || createDraftTabId(),
    sessionId: tab.sessionId || "",
    title: tab.title || "新会话",
    cwd: tab.cwd || "",
    status: normalizeTabStatus(tab.status),
    parentSessionId: tab.parentSessionId || "",
  }));

  const storedActiveId = activeTabStorage.value;
  const restoredActiveTab = openTabs.value.find(
    (tab) => tab.id === storedActiveId || tab.sessionId === storedActiveId,
  );
  activeTabId.value = restoredActiveTab?.id || openTabs.value[0]?.id || "";
}

// 同步到 localStorage
watch(
  openTabs,
  (tabs) => {
    tabStorage.value = tabs;
  },
  { deep: true },
);

watch(activeTabId, (id) => {
  activeTabStorage.value = id;
});

export function useSessionTabs() {
  const activeTab = computed(() =>
    openTabs.value.find((tab) => tab.id === activeTabId.value) ?? null,
  );

  const hasTabs = computed(() => openTabs.value.length > 0);

  /**
   * 打开一个标签页（如果已存在则聚焦）
   */
  const openSessionTab = (tab: Omit<SessionTab, "id" | "parentSessionId">) => {
    const existing = openTabs.value.find(
      (t) => t.sessionId === tab.sessionId,
    );

    if (existing) {
      // 更新标签信息（标题可能变化）
      Object.assign(existing, tab);
      activeTabId.value = existing.id;
      return;
    }

    // 新增标签
    const nextTab: SessionTab = {
      id: tab.sessionId,
      sessionId: tab.sessionId,
      title: tab.title,
      cwd: tab.cwd,
      status: tab.status,
      parentSessionId: "",
    };
    openTabs.value = [...openTabs.value, nextTab];
    activeTabId.value = nextTab.id;
  };

  /**
   * 打开一个草稿标签
   */
  const openDraftTab = (payload: {
    cwd?: string;
    parentSessionId?: string;
  }) => {
    const nextTab: SessionTab = {
      id: createDraftTabId(),
      sessionId: "",
      title: payload.parentSessionId ? "新的分支草稿" : "新的 Pi 会话",
      cwd: payload.cwd || "",
      status: "idle",
      parentSessionId: payload.parentSessionId || "",
    };

    openTabs.value = [...openTabs.value, nextTab];
    activeTabId.value = nextTab.id;
  };

  /**
   * 关闭一个标签页
   */
  const closeTab = (tabId: string) => {
    const index = openTabs.value.findIndex(
      (tab) => tab.id === tabId,
    );
    if (index < 0) return;

    const wasActive = activeTabId.value === tabId;
    const nextTabs = openTabs.value.filter(
      (tab) => tab.id !== tabId,
    );
    openTabs.value = nextTabs;

    // 如果关闭的是活动标签，切换到相邻标签
    if (wasActive && nextTabs.length > 0) {
      const nextIndex = Math.min(index, nextTabs.length - 1);
      activeTabId.value = nextTabs[nextIndex].id;
    } else if (wasActive) {
      activeTabId.value = "";
    }
  };

  /**
   * 切换到指定标签
   */
  const switchTab = (tabId: string) => {
    const tab = openTabs.value.find((t) => t.id === tabId);
    if (tab) {
      activeTabId.value = tabId;
    }
  };

  /**
   * 更新标签信息（标题、状态等）
   */
  const updateTab = (tabId: string, patch: Partial<Omit<SessionTab, "id">>) => {
    const tab = openTabs.value.find((t) => t.id === tabId);
    if (tab) {
      Object.assign(tab, patch);
    }
  };

  /**
   * 按 sessionId 更新已打开标签
   */
  const updateTabsBySessionId = (
    sessionId: string,
    patch: Partial<Omit<SessionTab, "id" | "sessionId">>,
  ) => {
    openTabs.value = openTabs.value.map((tab) =>
      tab.sessionId === sessionId
        ? { ...tab, ...patch }
        : tab,
    );
  };

  /**
   * 当会话被删除时，关闭对应标签
   */
  const closeTabsBySessionIds = (sessionIds: string[]) => {
    const idSet = new Set(sessionIds);
    const activeSessionId = activeTab.value?.sessionId || "";
    openTabs.value = openTabs.value.filter((t) => !idSet.has(t.sessionId));

    if (idSet.has(activeSessionId)) {
      activeTabId.value = openTabs.value[0]?.id ?? "";
    }
  };

  /**
   * 切换视图模式
   */
  const setViewMode = (mode: "tabs" | "grid") => {
    viewMode.value = mode;
  };

  return {
    openTabs,
    activeTabId,
    activeTab,
    hasTabs,
    viewMode,
    openSessionTab,
    openDraftTab,
    closeTab,
    switchTab,
    updateTab,
    updateTabsBySessionId,
    closeTabsBySessionIds,
    setViewMode,
  };
}
