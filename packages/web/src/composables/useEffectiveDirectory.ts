import { computed } from "vue";

import { usePiChat } from "@/composables/usePiChat";

type PiChatState = ReturnType<typeof usePiChat>;

/**
 * 统一的"有效目录"抽象。
 *
 * 优先级：
 * 1. 当前激活 session 的 worktreeRoot（若与 projectRoot 不同）
 * 2. 当前激活 session 的 cwd
 * 3. 当前草稿的 cwd
 * 4. workspaceDir
 */
export function useEffectiveDirectory(chat: PiChatState) {
  const effectiveDirectory = computed(() => {
    const session = chat.activeSession.value;
    if (session) {
      // worktree session 优先走 worktreeRoot
      if (session.worktreeRoot && session.worktreeRoot !== session.projectRoot) {
        return session.worktreeRoot;
      }
      return session.cwd;
    }

    if (chat.activeDraftContext.value?.cwd) {
      return chat.activeDraftContext.value.cwd;
    }

    return chat.info.value?.workspaceDir || "";
  });

  return { effectiveDirectory };
}
