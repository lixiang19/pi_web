import type { ProjectItem, SessionSummary, WorktreeApiInfo } from "./types";

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

const createTree = (sessions: SessionSummary[]): SessionTreeNode[] =>
  sessions.map((session) => ({ session, children: [] }));

export const buildSessionProjects = (options: {
  sessions: SessionSummary[];
  storedProjects?: ProjectItem[];
  availableWorktreesByProject?: Record<string, WorktreeApiInfo[]>;
  pinnedIds?: string[];
  query?: string;
  workspaceDir?: string;
}) => {
  const normalizedQuery = (options.query ?? "").trim().toLowerCase();
  const storedProjects = options.storedProjects ?? [];
  const availableWorktrees = options.availableWorktreesByProject ?? {};
  const sessionsByProjectId = new Map<string, SessionSummary[]>();

  for (const session of options.sessions) {
    const current = sessionsByProjectId.get(session.projectId) ?? [];
    current.push(session);
    sessionsByProjectId.set(session.projectId, current);
  }

  return storedProjects
    .map((project) => {
      const projectSessions = sessionsByProjectId.get(project.id) ?? [];
      const projectRoot = normalizePath(project.path);
      const projectMatchesQuery =
        !normalizedQuery ||
        `${project.name} ${projectRoot}`.toLowerCase().includes(normalizedQuery);

      const activeSessions = projectSessions.filter((session) => !session.archived);
      const archivedSessions = projectSessions.filter((session) => session.archived);
      const projectWorktrees = availableWorktrees[project.id] ?? [];
      const groups: SessionGroupView[] = [];

      const rootSessions = activeSessions.filter(
        (session) => normalizePath(session.worktreeRoot) === projectRoot,
      );
      if (rootSessions.length > 0) {
        const sortedSessions = [...rootSessions].sort(compareSessionsByTime);
        const groupMatchesQuery =
          !normalizedQuery ||
          `project root ${projectRoot}`.toLowerCase().includes(normalizedQuery);

        const filteredSessions = sortedSessions.filter((session) => {
          if (!normalizedQuery || projectMatchesQuery || groupMatchesQuery) {
            return true;
          }
          const haystack = `${session.title} ${session.cwd}`.toLowerCase();
          return haystack.includes(normalizedQuery);
        });

        if (filteredSessions.length > 0) {
          groups.push({
            key: `${project.id}:project-root:${projectRoot}`,
            kind: "project-root",
            label: "project root",
            worktreeRoot: projectRoot,
            sessions: rootSessions,
            tree: createTree(filteredSessions),
            lastUpdatedAt: Math.max(
              ...rootSessions.map((session) => session.updatedAt),
            ),
          });
        }
      }

      const worktreeMap = new Map<
        string,
        { info?: WorktreeApiInfo; sessions: SessionSummary[] }
      >();

      for (const wt of projectWorktrees) {
        const normalizedWtPath = normalizePath(wt.path);
        if (normalizedWtPath === projectRoot) continue;
        worktreeMap.set(normalizedWtPath, { info: wt, sessions: [] });
      }

      for (const session of activeSessions) {
        const normalizedWt = normalizePath(session.worktreeRoot);
        if (normalizedWt === projectRoot) continue;

        const existing = worktreeMap.get(normalizedWt);
        if (existing) {
          existing.sessions.push(session);
        } else {
          worktreeMap.set(normalizedWt, { sessions: [session] });
        }
      }

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

          if (filteredSessions.length === 0 && !info) return null;
          if (
            filteredSessions.length === 0 &&
            normalizedQuery &&
            !groupMatchesQuery &&
            !projectMatchesQuery
          ) {
            return null;
          }

          return {
            key: `${project.id}:worktree:${worktreeRoot}`,
            kind: "worktree",
            label,
            worktreeRoot,
            sessions,
            tree: createTree(filteredSessions),
            lastUpdatedAt:
              sessions.length > 0
                ? Math.max(...sessions.map((session) => session.updatedAt))
                : 0,
            ...(branch ? { branch } : {}),
          };
        })
        .filter((group): group is SessionGroupView => group !== null)
        .sort((left, right) => {
          const leftActive = left.sessions.length > 0;
          const rightActive = right.sessions.length > 0;
          if (leftActive !== rightActive) return leftActive ? -1 : 1;
          if (leftActive && rightActive) return right.lastUpdatedAt - left.lastUpdatedAt;
          return left.label.localeCompare(right.label);
        });

      groups.push(...worktreeGroups);

      if (archivedSessions.length > 0) {
        const sortedSessions = [...archivedSessions].sort(compareSessionsByTime);
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
            key: `${project.id}:archived:${projectRoot}`,
            kind: "archived",
            label: "archived",
            worktreeRoot: projectRoot,
            sessions: archivedSessions,
            tree: createTree(filteredSessions),
            lastUpdatedAt: Math.max(
              ...archivedSessions.map((session) => session.updatedAt),
            ),
          });
        }
      }

      const lastUpdatedAt =
        projectSessions.length > 0
          ? Math.max(...projectSessions.map((session) => session.updatedAt))
          : project.addedAt;

      const isGit =
        project.isGit ?? (projectWorktrees.length > 0 || projectSessions.some((session) => session.isGit));

      return {
        id: project.id,
        label: project.name,
        projectRoot,
        pathLabel: relativeLabel(project.path, options.workspaceDir),
        lastUpdatedAt,
        sessions: projectSessions,
        groups,
        isGit,
      } satisfies SessionProjectView;
    })
    .filter((project) => project.groups.length > 0 || normalizedQuery === "")
    .filter((project) => {
      if (!normalizedQuery) {
        return true;
      }
      return (
        `${project.label} ${project.projectRoot}`.toLowerCase().includes(normalizedQuery) ||
        project.groups.length > 0
      );
    })
    .sort((left, right) => right.lastUpdatedAt - left.lastUpdatedAt);
};

export const formatRelativeProjectPath = relativeLabel;
