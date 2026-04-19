import { computed, ref } from "vue";

import { getProjectWorktrees, getProjects, getSystemInfo } from "@/lib/api";
import type { TerminalCreateRequest } from "@/lib/types";

export interface TerminalCwdOption {
  value: string;
  label: string;
  description: string;
  group: string;
}

const dedupeOptions = (options: TerminalCwdOption[]) => {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.value)) {
      return false;
    }

    seen.add(option.value);
    return true;
  });
};

const createOption = (
  value: string,
  label: string,
  description: string,
  group: string,
): TerminalCwdOption => ({
  value,
  label,
  description,
  group,
});

export function useTerminalContextOptions() {
  const options = ref<TerminalCwdOption[]>([]);
  const isLoading = ref(false);
  const error = ref("");

  const load = async () => {
    isLoading.value = true;
    error.value = "";

    try {
      const [systemInfo, projectPayload] = await Promise.all([
        getSystemInfo(),
        getProjects(),
      ]);

      const worktreePayloads = await Promise.all(
        projectPayload.projects.map(async (project) => ({
          project,
          worktrees: (await getProjectWorktrees(project.id)).worktrees,
        })),
      );

      const nextOptions: TerminalCwdOption[] = [
        createOption(
          systemInfo.workspaceDir,
          "工作区根目录",
          systemInfo.workspaceDir,
          "系统",
        ),
        createOption(
          systemInfo.chatProjectPath,
          "系统聊天目录",
          systemInfo.chatProjectPath,
          "系统",
        ),
      ];

      for (const project of projectPayload.projects) {
        nextOptions.push(
          createOption(project.path, project.name, project.path, "项目"),
        );
      }

      for (const payload of worktreePayloads) {
        for (const worktree of payload.worktrees) {
          nextOptions.push(
            createOption(
              worktree.path,
              `${payload.project.name} / ${worktree.label}`,
              `${worktree.path}${worktree.branch ? ` · ${worktree.branch}` : ""}`,
              "Worktree",
            ),
          );
        }
      }

      options.value = dedupeOptions(nextOptions);
      return options.value;
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      throw caughtError;
    } finally {
      isLoading.value = false;
    }
  };

  const optionMap = computed(
    () => new Map(options.value.map((option) => [option.value, option])),
  );

  const createDefaultPayload = (cwd?: string): TerminalCreateRequest => ({
    cwd: cwd || options.value[0]?.value,
  });

  return {
    createDefaultPayload,
    error,
    isLoading,
    load,
    optionMap,
    options,
  };
}