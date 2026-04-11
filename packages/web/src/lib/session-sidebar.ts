import type { SessionSummary, WorktreeApiInfo } from "./types";

export type SessionTreeNode = {
  session: SessionSummary;
  children: SessionTreeNode[];
};

export type SessionGroupView = {
  key: string;
  kind: "project-root" | "worktree" | "archived";
  label: string;
  branch?: string;
  worktreeRoot: string;
  sessions: SessionSummary[];
  tree: SessionTreeNode[];
  lastUpdatedAt: number;
};

export type SessionProjectView = {
  id: string;
  label: string;
  projectRoot: string;
  pathLabel: string;
  lastUpdatedAt: number;
  sessions: SessionSummary[];
  groups: SessionGroupView[];
  isGit: boolean;
};

const normalizePath = (value: string) =>
  value.replace(/\\/g, "/").replace(/\/+$/, "");

const relativeLabel = (value: string, workspaceDir?: string) => {
  const normalizedValue = normalizePath(value);
  const normalizedWorkspace = normalizePath(workspaceDir || "");

  if (normalizedWorkspace && normalizedValue.startsWith(normalizedWorkspace)) {
    const relative = normalizedValue
      .slice(normalizedWorkspace.length)
      .replace(/^\//, "");
    return relative || ".";
  }

  return normalizedValue;
};

const compareSessionsByTime = (left: SessionSummary, right: SessionSummary) =>
  right.updatedAt - left.updatedAt;

/**
 * Build session projects with worktree-aware grouping.
 *
 * 新模型：project + availableWorktrees + sessions 三者联合构造。
 * - worktree groups 来自 availableWorktreesByProject，即使没有 session 也会显示
 * - session 按 worktreeRoot 挂入对应 group
 */
export const buildSessionProjects = (options: {
  sessions: SessionSummary[];
  availableWorktreesByProject?: Record<string, WorktreeApiInfo[]>;
  query?: string;
  workspaceDir?: string;
}) => {
  const normalizedQuery = (options.query ?? "").trim().toLowerCase();
  const projectsById = new Map<string, SessionProjectView>();
  const availableWorktrees = options.availableWorktreesByProject ?? {};

  // 第一遍：按 session 收集 project
  for (const session of options.sessions) {
    const existing = projectsById.get(session.projectId);
    if (existing) {
      existing.sessions.push(session);
      existing.lastUpdatedAt = Math.max(
        existing.lastUpdatedAt,
        session.updatedAt,
      );
      continue;
    }

    projectsById.set(session.projectId, {
      id: session.projectId,
      label: session.projectLabel,
      projectRoot: session.projectRoot,
      pathLabel: relativeLabel(session.projectRoot, options.workspaceDir),
      lastUpdatedAt: session.updatedAt,
      sessions: [session],
      groups: [],
      isGit: true, // 有 session 来自 project-context，默认 git
    });
  }

  return [...projectsById.values()]
    .map((project) => {
      const projectMatchesQuery =
        !normalizedQuery ||
        `${project.label} ${project.projectRoot}`
          .toLowerCase()
          .includes(normalizedQuery);

      const activeSessions = project.sessions.filter(
        (session) => !session.archived,
      );
      const archivedSessions = project.sessions.filter(
        (session) => session.archived,
      );

      const groups: SessionGroupView[] = [];

      // === project root group ===
      const rootSessions = activeSessions.filter(
        (session) => session.worktreeRoot === session.projectRoot,
      );
      if (rootSessions.length > 0) {
        const sortedSessions = [...rootSessions].sort(compareSessionsByTime);

        const groupMatchesQuery =
          !normalizedQuery ||
          `project root ${rootSessions[0]?.branch || ""} ${project.projectRoot}`
            .toLowerCase()
            .includes(normalizedQuery);

        const filteredSessions = sortedSessions.filter((session) => {
          if (!normalizedQuery || projectMatchesQuery || groupMatchesQuery) {
            return true;
          }
          const haystack = `${session.title} ${session.cwd}`.toLowerCase();
          return haystack.includes(normalizedQuery);
        });

        if (filteredSessions.length > 0) {
          groups.push({
            key: `${project.id}:project-root:${project.projectRoot}`,
            kind: "project-root",
            label: "project root",
            worktreeRoot: project.projectRoot,
            sessions: rootSessions,
            tree: filteredSessions.map((session) => ({
              session,
              children: [],
            })),
            lastUpdatedAt: Math.max(
              ...rootSessions.map((session) => session.updatedAt),
            ),
            ...(rootSessions[0]?.branch
              ? { branch: rootSessions[0].branch }
              : {}),
          });
        }
      }

      // === worktree groups（基于 availableWorktrees + session 挂载）===
      // 先拿该 project 的 available worktrees
      const projectWorktrees = availableWorktrees[project.id] ?? [];

      // 收集所有 worktree 路径（合并 available 和 session 来源）
      const worktreeMap = new Map<
        string,
        { info?: WorktreeApiInfo; sessions: SessionSummary[] }
      >();

      // 先注册 available worktrees
      for (const wt of projectWorktrees) {
        const normalizedWtPath = normalizePath(wt.path);
        if (normalizedWtPath === normalizePath(project.projectRoot)) continue;
        worktreeMap.set(normalizedWtPath, { info: wt, sessions: [] });
      }

      // 再把 session 挂载到对应 worktree
      for (const session of activeSessions) {
        const normalizedWt = normalizePath(session.worktreeRoot);
        if (normalizedWt === normalizePath(session.projectRoot)) continue;

        const existing = worktreeMap.get(normalizedWt);
        if (existing) {
          existing.sessions.push(session);
        } else {
          worktreeMap.set(normalizedWt, { sessions: [session] });
        }
      }

      // 构造 worktree groups
      const worktreeGroups = [...worktreeMap.entries()]
        .map<SessionGroupView | null>(([worktreeRoot, { info, sessions }]) => {
          const sortedSessions = [...sessions].sort(compareSessionsByTime);
          const label =
            info?.label ||
            sessions[0]?.worktreeLabel ||
            relativeLabel(worktreeRoot, options.workspaceDir);
          const branch = info?.branch || sessions[0]?.branch;

          const groupMatchesQuery =
            !normalizedQuery ||
            `${label} ${branch || ""} ${worktreeRoot}`
              .toLowerCase()
              .includes(normalizedQuery);

          const filteredSessions = sortedSessions.filter((session) => {
            if (!normalizedQuery || projectMatchesQuery || groupMatchesQuery) {
              return true;
            }
            const haystack = `${session.title} ${session.cwd}`.toLowerCase();
            return haystack.includes(normalizedQuery);
          });

          // 即使没有 session，只要 available worktree 存在就显示（搜索时若不匹配则不显示）
          if (filteredSessions.length === 0 && !info) return null;
          if (filteredSessions.length === 0 && normalizedQuery && !groupMatchesQuery && !projectMatchesQuery) return null;

          return {
            key: `${project.id}:worktree:${worktreeRoot}`,
            kind: "worktree" as const,
            label,
            worktreeRoot,
            sessions,
            tree: filteredSessions.map((session) => ({
              session,
              children: [],
            })),
            lastUpdatedAt:
              sessions.length > 0
                ? Math.max(...sessions.map((session) => session.updatedAt))
                : 0,
            ...(branch ? { branch } : {}),
          };
        })
        .filter((group): group is SessionGroupView => group !== null)
        .sort((left, right) => {
          // 有活跃 session 的排前面
          const leftActive = left.sessions.length > 0;
          const rightActive = right.sessions.length > 0;
          if (leftActive !== rightActive) return leftActive ? -1 : 1;
          if (leftActive && rightActive) return right.lastUpdatedAt - left.lastUpdatedAt;
          return left.label.localeCompare(right.label);
        });

      groups.push(...worktreeGroups);

      // === archived group ===
      if (archivedSessions.length > 0) {
        const sortedSessions = [...archivedSessions].sort(
          compareSessionsByTime,
        );

        const groupMatchesQuery =
          !normalizedQuery || "archived".includes(normalizedQuery);

        const filteredSessions = sortedSessions.filter((session) => {
          if (!normalizedQuery || projectMatchesQuery || groupMatchesQuery) {
            return true;
          }
          const haystack = `${session.title} ${session.cwd}`.toLowerCase();
          return haystack.includes(normalizedQuery);
        });

        if (filteredSessions.length > 0) {
          groups.push({
            key: `${project.id}:archived:${project.projectRoot}`,
            kind: "archived",
            label: "archived",
            worktreeRoot: project.projectRoot,
            sessions: archivedSessions,
            tree: filteredSessions.map((session) => ({
              session,
              children: [],
            })),
            lastUpdatedAt: Math.max(
              ...archivedSessions.map((session) => session.updatedAt),
            ),
          });
        }
      }

      return {
        ...project,
        groups,
      };
    })
    .filter((project) => project.groups.length > 0 || normalizedQuery === "")
    .sort((left, right) => right.lastUpdatedAt - left.lastUpdatedAt);
};

export const formatRelativeProjectPath = relativeLabel;
