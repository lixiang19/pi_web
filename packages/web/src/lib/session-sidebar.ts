import type {
  ProjectItem,
  SessionContextSummary,
  SessionSummary,
  WorktreeApiInfo,
} from "./types";

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

export type SessionProjectSource = "stored-project" | "workspace-chat";

export type SessionProjectView = {
  id: string;
  label: string;
  projectRoot: string;
  pathLabel: string;
  lastUpdatedAt: number;
  sessions: SessionSummary[];
  groups: SessionGroupView[];
  isGit: boolean;
  source: SessionProjectSource;
};

type WorkspaceChatViewOptions = {
  id: string;
  path: string;
  label: string;
};

type BuildSidebarOptions = {
  sessions: SessionSummary[];
  sessionContexts?: Record<string, SessionContextSummary>;
  storedProjects?: ProjectItem[];
  availableWorktreesByProject?: Record<string, WorktreeApiInfo[]>;
  pinnedIds?: string[];
  query?: string;
  workspaceDir?: string;
  workspaceChat?: WorkspaceChatViewOptions;
};

type SessionProjectConfig = {
  id: string;
  label: string;
  path: string;
  addedAt: number;
  isGit: boolean;
  source: SessionProjectSource;
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

const resolveSessionContext = (
  session: SessionSummary,
  sessionContexts?: Record<string, SessionContextSummary>,
): SessionContextSummary => {
  const contextId = session.contextId ?? "";
  const mapped = contextId ? sessionContexts?.[contextId] : undefined;
  if (mapped) {
    return mapped;
  }

  return {
    contextId,
    cwd: session.cwd,
    projectId: session.projectId ?? "",
    projectLabel: session.projectLabel ?? "",
    projectRoot: session.projectRoot ?? "",
    worktreeRoot: session.worktreeRoot || session.cwd,
    worktreeLabel: session.worktreeLabel || session.cwd,
    branch: session.branch,
    isGit: session.isGit ?? false,
  };
};

const buildProjectView = (options: {
  project: SessionProjectConfig;
  sessions: SessionSummary[];
  availableWorktreesByProject?: Record<string, WorktreeApiInfo[]>;
  normalizedQuery: string;
  workspaceDir?: string;
  getCtx: (session: SessionSummary) => SessionContextSummary;
}): SessionProjectView | null => {
  const {
    project,
    sessions,
    availableWorktreesByProject,
    normalizedQuery,
    workspaceDir,
    getCtx,
  } = options;
  const projectRoot = normalizePath(project.path);
  const projectMatchesQuery =
    !normalizedQuery ||
    `${project.label} ${projectRoot}`.toLowerCase().includes(normalizedQuery);

  const activeSessions = sessions.filter((session) => !session.archived);
  const archivedSessions = sessions.filter((session) => session.archived);
  const projectWorktrees =
    project.source === "stored-project"
      ? availableWorktreesByProject?.[project.id] ?? []
      : [];
  const groups: SessionGroupView[] = [];

  const rootSessions = activeSessions.filter(
    (session) => normalizePath(getCtx(session).worktreeRoot) === projectRoot,
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
      const haystack = `${session.title} ${getCtx(session).cwd}`.toLowerCase();
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
    const normalizedWt = normalizePath(getCtx(session).worktreeRoot);
    if (normalizedWt === projectRoot) continue;

    const existing = worktreeMap.get(normalizedWt);
    if (existing) {
      existing.sessions.push(session);
    } else {
      worktreeMap.set(normalizedWt, { sessions: [session] });
    }
  }

  const worktreeGroups = [...worktreeMap.entries()]
    .map<SessionGroupView | null>(([worktreeRoot, { info, sessions: groupSessions }]) => {
      const sortedSessions = [...groupSessions].sort(compareSessionsByTime);
      const firstCtx = groupSessions[0] ? getCtx(groupSessions[0]) : null;
      const label =
        info?.label ||
        firstCtx?.worktreeLabel ||
        relativeLabel(worktreeRoot, workspaceDir);
      const branch = info?.branch || firstCtx?.branch;
      const groupMatchesQuery =
        !normalizedQuery ||
        `${label} ${branch || ""} ${worktreeRoot}`
          .toLowerCase()
          .includes(normalizedQuery);

      const filteredSessions = sortedSessions.filter((session) => {
        if (!normalizedQuery || projectMatchesQuery || groupMatchesQuery) {
          return true;
        }
        const haystack = `${session.title} ${getCtx(session).cwd}`.toLowerCase();
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
        sessions: groupSessions,
        tree: createTree(filteredSessions),
        lastUpdatedAt:
          groupSessions.length > 0
            ? Math.max(...groupSessions.map((session) => session.updatedAt))
            : 0,
        ...(branch ? { branch } : {}),
      };
    })
    .filter((group): group is SessionGroupView => group !== null)
    .sort((left, right) => {
      const leftActive = left.sessions.length > 0;
      const rightActive = right.sessions.length > 0;
      if (leftActive !== rightActive) return leftActive ? -1 : 1;
      if (leftActive && rightActive) {
        return right.lastUpdatedAt - left.lastUpdatedAt;
      }
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
      const haystack = `${session.title} ${getCtx(session).cwd}`.toLowerCase();
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
    sessions.length > 0
      ? Math.max(...sessions.map((session) => session.updatedAt))
      : project.addedAt;

  const isGit =
    project.isGit ||
    projectWorktrees.length > 0 ||
    sessions.some((session) => getCtx(session).isGit);

  const view = {
    id: project.id,
    label: project.label,
    projectRoot,
    pathLabel: relativeLabel(project.path, workspaceDir),
    lastUpdatedAt,
    sessions,
    groups,
    isGit,
    source: project.source,
  } satisfies SessionProjectView;

  if (!normalizedQuery) {
    return view;
  }

  if (
    `${view.label} ${view.projectRoot}`.toLowerCase().includes(normalizedQuery) ||
    view.groups.length > 0
  ) {
    return view;
  }

  return null;
};

export const buildSidebarProjects = (options: BuildSidebarOptions) => {
  const normalizedQuery = (options.query ?? "").trim().toLowerCase();
  const storedProjects = options.storedProjects ?? [];

  const contextBySid = new Map(
    options.sessions.map((session) => [
      session.id,
      resolveSessionContext(session, options.sessionContexts),
    ]),
  );
  const getCtx = (session: SessionSummary) => contextBySid.get(session.id)!;
  const normalizedWorkspaceChatPath = normalizePath(
    options.workspaceChat?.path || "",
  );
  const isWorkspaceChatSession = (session: SessionSummary) => {
    if (!options.workspaceChat) {
      return false;
    }

    const context = getCtx(session);
    return (
      context.projectId === options.workspaceChat.id ||
      normalizePath(context.projectRoot) === normalizedWorkspaceChatPath ||
      normalizePath(context.cwd) === normalizedWorkspaceChatPath ||
      normalizePath(session.cwd) === normalizedWorkspaceChatPath
    );
  };

  const workspaceChatSessions = options.workspaceChat
    ? options.sessions.filter((session) => isWorkspaceChatSession(session))
    : [];
  const workspaceChatSessionIds = new Set(workspaceChatSessions.map((session) => session.id));
  const regularSessions = options.sessions.filter(
    (session) => !workspaceChatSessionIds.has(session.id),
  );

  const sessionsByProjectId = new Map<string, SessionSummary[]>();
  for (const session of regularSessions) {
    const projectId = getCtx(session).projectId;
    const current = sessionsByProjectId.get(projectId) ?? [];
    current.push(session);
    sessionsByProjectId.set(projectId, current);
  }

  const projects = storedProjects
    .map((project) =>
      buildProjectView({
        project: {
          id: project.id,
          label: project.name,
          path: project.path,
          addedAt: project.addedAt,
          isGit: project.isGit,
          source: "stored-project",
        },
        sessions: sessionsByProjectId.get(project.id) ?? [],
        availableWorktreesByProject: options.availableWorktreesByProject,
        normalizedQuery,
        workspaceDir: options.workspaceDir,
        getCtx,
      }),
    )
    .filter((project): project is SessionProjectView => project !== null)
    .sort((left, right) => right.lastUpdatedAt - left.lastUpdatedAt);

  const workspaceChatProject = options.workspaceChat
    ? buildProjectView({
        project: {
          id: options.workspaceChat.id,
          label: options.workspaceChat.label,
          path: options.workspaceChat.path,
          addedAt: 0,
          isGit: false,
          source: "workspace-chat",
        },
        sessions: workspaceChatSessions,
        normalizedQuery,
        workspaceDir: options.workspaceDir,
        getCtx,
      })
    : null;

  return {
    workspaceChatProject,
    projects,
  };
};

export const buildSessionProjects = (options: BuildSidebarOptions) =>
  buildSidebarProjects(options).projects;

export const formatRelativeProjectPath = relativeLabel;
