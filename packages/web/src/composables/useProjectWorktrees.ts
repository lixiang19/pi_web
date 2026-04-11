import { ref } from "vue";

import { getProjectWorktrees } from "@/lib/api";
import type { WorktreeApiInfo } from "@/lib/types";

/**
 * 按项目管理 available worktrees。
 *
 * 提供按项目 ID 拉取、缓存、刷新 worktree 列表的能力。
 * 在左栏分组构造和 worktree dialog 中使用。
 */
export function useProjectWorktrees() {
  const worktreesByProject = ref<Record<string, WorktreeApiInfo[]>>({});
  const isLoading = ref(false);
  const error = ref("");

  const load = async (projectId: string) => {
    isLoading.value = true;
    error.value = "";

    try {
      const response = await getProjectWorktrees(projectId);
      worktreesByProject.value = {
        ...worktreesByProject.value,
        [projectId]: response.worktrees,
      };
      return response.worktrees;
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
      return [];
    } finally {
      isLoading.value = false;
    }
  };

  const loadAll = async (projectIds: string[]) => {
    isLoading.value = true;
    error.value = "";

    try {
      const results = await Promise.all(
        projectIds.map(async (projectId) => {
          try {
            const response = await getProjectWorktrees(projectId);
            return { projectId, worktrees: response.worktrees };
          } catch {
            return { projectId, worktrees: [] as WorktreeApiInfo[] };
          }
        }),
      );

      const next: Record<string, WorktreeApiInfo[]> = {};
      for (const { projectId, worktrees } of results) {
        next[projectId] = worktrees;
      }
      worktreesByProject.value = next;
    } finally {
      isLoading.value = false;
    }
  };

  const refresh = async (projectId: string) => load(projectId);

  const getWorktrees = (projectId: string): WorktreeApiInfo[] =>
    worktreesByProject.value[projectId] ?? [];

  return {
    worktreesByProject,
    isLoading,
    error,
    load,
    loadAll,
    refresh,
    getWorktrees,
  };
}
