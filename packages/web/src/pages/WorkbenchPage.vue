<script setup lang="ts">
import { computed } from "vue";
import SessionSidebar from "@/components/chat/SessionSidebar.vue";
import SessionTabArea from "@/components/workbench/SessionTabArea.vue";
import { usePiChatCore } from "@/composables/usePiChatCore";
import { useSessionTabs } from "@/composables/useSessionTabs";

const core = usePiChatCore();
const tabs = useSessionTabs();

// ============================================================================
// Sidebar 交互
// ============================================================================

const sessionSidebarProps = computed(() => {
  const nextProps: {
    sessions: typeof core.sessions.value;
    activeSessionId: string;
    isSending: boolean;
    workspaceDir?: string;
  } = {
    sessions: core.sessions.value,
    activeSessionId: tabs.activeTab.value?.sessionId ?? "",
    isSending: tabs.activeTab.value?.status === "streaming",
  };

  if (core.info.value?.workspaceDir) {
    nextProps.workspaceDir = core.info.value.workspaceDir;
  }

  return nextProps;
});

// 点击左侧会话 → 打开/聚焦标签
const handleSessionSelect = (sessionId: string) => {
  const session = core.sessions.value.find((s) => s.id === sessionId);
  if (!session) return;

  tabs.openSessionTab({
    sessionId: session.id,
    title: session.title || "新会话",
    cwd: session.cwd,
    status: session.status,
  });
};

// 新建会话 → 打开草稿标签，发送首条消息时再创建 session
const handleSessionCreate = (payload: {
  cwd?: string;
  parentSessionId?: string;
}) => {
  const resolvedCwd =
    payload.cwd ||
    tabs.activeTab.value?.cwd ||
    core.info.value?.workspaceDir ||
    "";

  tabs.openDraftTab({
    cwd: resolvedCwd,
    parentSessionId: payload.parentSessionId,
  });
};

// 预取
const handlePrefetch = (sessionId: string) => {
  void core.prefetchSession(sessionId);
};

// 重命名
const handleRename = (sessionId: string, title: string) => {
  void core.renameSessionTitle(sessionId, title);
  tabs.updateTabsBySessionId(sessionId, { title });
};

// 归档
const handleArchive = (sessionId: string, archived: boolean) => {
  void core.setSessionArchived(sessionId, archived);
};

// 删除
const handleRemove = (sessionId: string) => {
  void (async () => {
    const response = await core.removeSessionTree(sessionId);
    tabs.closeTabsBySessionIds(response.sessionIds);
  })();
};

const handleWorktreeCreated = async (worktreePath: string) => {
  handleSessionCreate({ cwd: worktreePath });
};
</script>

<template>
  <div class="h-full">
    <div class="flex h-full">
      <!-- 左侧栏: 会话列表 -->
      <aside class="w-72 flex shrink-0 flex-col bg-sidebar">
        <SessionSidebar
          v-bind="sessionSidebarProps"
          class="flex-1"
          @archive="handleArchive"
          @create="handleSessionCreate"
          @prefetch="handlePrefetch"
          @remove="handleRemove"
          @rename="handleRename"
          @select="handleSessionSelect"
          @worktree-created="handleWorktreeCreated"
        />
      </aside>

      <!-- 中间+右侧: 标签区域 -->
      <SessionTabArea />
    </div>
  </div>
</template>
