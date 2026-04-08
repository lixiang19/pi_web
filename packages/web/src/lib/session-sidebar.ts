import type { SessionSummary } from "./types";

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

export const compareSessionsByPinnedAndTime = (
  left: SessionSummary,
  right: SessionSummary,
  pinnedIds: Set<string>,
) => {
  const leftPinned = pinnedIds.has(left.id);
  const rightPinned = pinnedIds.has(right.id);

  if (leftPinned !== rightPinned) {
    return leftPinned ? -1 : 1;
  }

  return right.updatedAt - left.updatedAt;
};

const buildSessionTree = (
  sessions: SessionSummary[],
  pinnedIds: Set<string>,
) => {
  const nodesById = new Map<string, SessionTreeNode>();
  const rootNodes: SessionTreeNode[] = [];

  for (const session of sessions) {
    nodesById.set(session.id, {
      session,
      children: [],
    });
  }

  for (const session of sessions) {
    const node = nodesById.get(session.id);
    if (!node) {
      continue;
    }

    if (!session.parentSessionId) {
      rootNodes.push(node);
      continue;
    }

    const parentNode = nodesById.get(session.parentSessionId);
    if (!parentNode) {
      rootNodes.push(node);
      continue;
    }

    parentNode.children.push(node);
  }

  const sortNodes = (nodes: SessionTreeNode[]) => {
    nodes.sort((left, right) =>
      compareSessionsByPinnedAndTime(left.session, right.session, pinnedIds),
    );
    for (const node of nodes) {
      sortNodes(node.children);
    }
  };

  sortNodes(rootNodes);
  return rootNodes;
};

const filterTreeByQuery = (
  nodes: SessionTreeNode[],
  normalizedQuery: string,
): SessionTreeNode[] => {
  if (!normalizedQuery) {
    return nodes;
  }

  const filtered: SessionTreeNode[] = [];

  for (const node of nodes) {
    const haystack = `${node.session.title} ${node.session.cwd}`.toLowerCase();
    const children = filterTreeByQuery(node.children, normalizedQuery);

    if (haystack.includes(normalizedQuery) || children.length > 0) {
      filtered.push({
        session: node.session,
        children,
      });
    }
  }

  return filtered;
};

export const buildSessionProjects = (options: {
  sessions: SessionSummary[];
  pinnedIds: string[];
  query?: string;
  workspaceDir?: string;
}) => {
  const pinnedIdSet = new Set(options.pinnedIds);
  const normalizedQuery = (options.query ?? "").trim().toLowerCase();
  const projectsById = new Map<string, SessionProjectView>();

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

      const rootSessions = activeSessions.filter(
        (session) => session.worktreeRoot === session.projectRoot,
      );
      if (rootSessions.length > 0) {
        const fullTree = buildSessionTree(rootSessions, pinnedIdSet);
        const groupMatchesQuery =
          !normalizedQuery ||
          `project root ${rootSessions[0]?.branch || ""} ${project.projectRoot}`
            .toLowerCase()
            .includes(normalizedQuery);
        const tree =
          projectMatchesQuery || groupMatchesQuery
            ? fullTree
            : filterTreeByQuery(fullTree, normalizedQuery);
        if (tree.length > 0) {
          groups.push({
            key: `${project.id}:project-root:${project.projectRoot}`,
            kind: "project-root",
            label: "project root",
            worktreeRoot: project.projectRoot,
            sessions: rootSessions,
            tree,
            lastUpdatedAt: Math.max(
              ...rootSessions.map((session) => session.updatedAt),
            ),
            ...(rootSessions[0]?.branch
              ? { branch: rootSessions[0].branch }
              : {}),
          });
        }
      }

      const worktreeMap = new Map<string, SessionSummary[]>();
      for (const session of activeSessions) {
        if (session.worktreeRoot === session.projectRoot) {
          continue;
        }

        const bucket = worktreeMap.get(session.worktreeRoot) ?? [];
        bucket.push(session);
        worktreeMap.set(session.worktreeRoot, bucket);
      }

      const worktreeGroups = [...worktreeMap.entries()]
        .map<SessionGroupView | null>(([worktreeRoot, sessions]) => {
          const fullTree = buildSessionTree(sessions, pinnedIdSet);
          const groupMatchesQuery =
            !normalizedQuery ||
            `${sessions[0]?.worktreeLabel || ""} ${sessions[0]?.branch || ""} ${worktreeRoot}`
              .toLowerCase()
              .includes(normalizedQuery);
          const tree =
            projectMatchesQuery || groupMatchesQuery
              ? fullTree
              : filterTreeByQuery(fullTree, normalizedQuery);
          if (tree.length === 0) {
            return null;
          }

          return {
            key: `${project.id}:worktree:${worktreeRoot}`,
            kind: "worktree" as const,
            label:
              sessions[0]?.worktreeLabel ||
              relativeLabel(worktreeRoot, options.workspaceDir),
            worktreeRoot,
            sessions,
            tree,
            lastUpdatedAt: Math.max(
              ...sessions.map((session) => session.updatedAt),
            ),
            ...(sessions[0]?.branch ? { branch: sessions[0].branch } : {}),
          };
        })
        .filter((group): group is SessionGroupView => group !== null)
        .sort((left, right) => right.lastUpdatedAt - left.lastUpdatedAt);

      groups.push(...worktreeGroups);

      if (archivedSessions.length > 0) {
        const fullTree = buildSessionTree(archivedSessions, pinnedIdSet);
        const groupMatchesQuery =
          !normalizedQuery || "archived".includes(normalizedQuery);
        const tree =
          projectMatchesQuery || groupMatchesQuery
            ? fullTree
            : filterTreeByQuery(fullTree, normalizedQuery);
        if (tree.length > 0) {
          groups.push({
            key: `${project.id}:archived:${project.projectRoot}`,
            kind: "archived",
            label: "archived",
            worktreeRoot: project.projectRoot,
            sessions: archivedSessions,
            tree,
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
    .filter((project) => project.groups.length > 0)
    .sort((left, right) => right.lastUpdatedAt - left.lastUpdatedAt);
};

export const formatRelativeProjectPath = relativeLabel;
