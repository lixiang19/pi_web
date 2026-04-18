<script setup lang="ts">
import { computed } from "vue";
import SessionSidebar from "@/components/chat/SessionSidebar.vue";
import SessionTabArea from "@/components/workbench/SessionTabArea.vue";
import { usePiChatCore } from "@/composables/usePiChatCore";
import { useSessionLruPool } from "@/composables/useSessionLruPool";

const core = usePiChatCore();
const lru = useSessionLruPool();

// ============================================================================
// Sidebar 交互
// ============================================================================

const sessionSidebarProps = computed(() => {
  const nextProps: {
    sessions: typeof core.sessions.value;
    sessionContexts: typeof core.sessionContexts.value;
    activeSessionId: string;
    isSending: boolean;
    workspaceDir?: string;
  } = {
    sessions: core.sessions.value,
    sessionContexts: core.sessionContexts.value,
    activeSessionId: lru.activeSessionId.value ?? "",
    isSending:
      lru.activeSessionId.value !== null &&
      core.sessions.value.find(
        (session) => session.id === lru.activeSessionId.value,
      )?.status === "streaming",
  };

  if (core.info.value?.workspaceDir) {
    nextProps.workspaceDir = core.info.value.workspaceDir;
  }

  return nextProps;
});

// 点击左侧会话 → 加入/激活 LRU 池
const handleSessionSelect = (sessionId: string) => {
  lru.activateSession(sessionId);
};

// 新建会话 → 打开草稿视图，发送首条消息时再创建 session
const handleSessionCreate = (payload: {
  cwd?: string;
  parentSessionId?: string;
}) => {
  const activeSessionCwd = lru.activeSessionId.value
    ? core.getCachedSessionSnapshot?.(lru.activeSessionId.value)?.cwd ||
      core.sessions.value.find(
        (session) => session.id === lru.activeSessionId.value,
      )?.cwd ||
      ""
    : "";

  const resolvedCwd =
    payload.cwd ||
    activeSessionCwd ||
    core.info.value?.workspaceDir ||
    "";

  lru.activateDraft({
    cwd: resolvedCwd,
    parentSessionId: payload.parentSessionId || "",
  });
};

// 预取
const handlePrefetch = (sessionId: string) => {
  void core.prefetchSession(sessionId);
};

// 重命名
const handleRename = (sessionId: string, title: string) => {
  void core.renameSessionTitle(sessionId, title);
};

// 归档
const handleArchive = (sessionId: string, archived: boolean) => {
  void core.setSessionArchived(sessionId, archived);
};

// 删除
const handleRemove = (sessionId: string) => {
  void (async () => {
    const response = await core.removeSessionTree(sessionId);
    response.sessionIds.forEach((id) => lru.removeSession(id));
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
