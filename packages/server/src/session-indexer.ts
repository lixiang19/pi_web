import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SessionManager } from '@mariozechner/pi-coding-agent';
import { getRidgeDb } from './db/index.js';
import { getProjects } from './storage/index.js';
import {
  createWorkspaceChatProject,
  type WorkspaceChatConfig,
} from './workspace-chat.js';
import type { Project, ProjectContext, SessionRecord } from './types/index.js';
import { toPosixPath } from './utils/paths.js';
import { normalizeString } from './utils/strings.js';

interface ProjectContextResolverLike {
  resolveContext(cwd: string): Promise<ProjectContext>;
  isPathInsideRoot(candidatePath: string, rootPath: string): boolean;
}

interface RefreshSessionCatalogOptions {
  projectContextResolver: ProjectContextResolverLike;
  activeSessions: Map<string, SessionRecord>;
  workspaceChatConfig: WorkspaceChatConfig;
}

interface UpsertIndexedSessionRecordOptions {
  projectContextResolver: ProjectContextResolverLike;
  workspaceChatConfig: WorkspaceChatConfig;
}

interface ManagedProjectScope {
  project: Project;
  allowedRoots: string[];
}

interface IndexedSessionRow {
  id: string;
  title: string;
  cwd: string;
  sessionFile: string;
  parentSessionPath?: string;
  createdAt: number;
  updatedAt: number;
  contextId: string;
  userRoundCount: number;
  lastModel?: string;
  lastThinkingLevel?: string;
}

interface IndexedSessionContextEntry {
  projectId: string;
  projectLabel: string;
  context: ProjectContext;
}

interface IndexedSessionStats {
  userRoundCount: number;
  lastModel?: string;
  lastThinkingLevel?: string;
}

let managedProjectScopesPromise: Promise<ManagedProjectScope[]> | null = null;

const resolveExistingRealPath = async (candidatePath: string): Promise<string> => {
  try {
    return path.resolve(await fs.realpath(candidatePath));
  } catch {
    return path.resolve(candidatePath);
  }
};

export const invalidateManagedProjectScopes = () => {
  managedProjectScopesPromise = null;
};

export interface IndexedSessionSummary {
  id: string;
  title: string;
  status: 'idle' | 'streaming' | 'error';
  cwd: string;
  updatedAt: number;
  createdAt: number;
  archived: boolean;
  sessionFile: string;
  parentSessionId?: string;
  contextId: string;
}

export interface IndexedSessionLookup {
  id: string;
  title: string;
  cwd: string;
  sessionFile: string;
  parentSessionPath?: string;
  parentSessionId?: string;
  createdAt: number;
  updatedAt: number;
  contextId: string;
  archived: boolean;
  agent?: string;
  explicitModel?: string;
  explicitThinkingLevel?: string;
  lastModel?: string;
  lastThinkingLevel?: string;
  userRoundCount: number;
}

export interface IndexedSessionContextSummary {
  contextId: string;
  cwd: string;
  projectId: string;
  projectLabel: string;
  projectRoot: string;
  worktreeRoot: string;
  worktreeLabel: string;
  branch?: string;
  isGit: boolean;
}

export interface IndexedSessionTreeNode {
  id: string;
  sessionFile: string;
}

const getFallbackTitle = (firstMessage: unknown): string =>
  normalizeString(firstMessage).slice(0, 48) || '新会话';

const buildContextId = (projectRoot: string, worktreeRoot: string) =>
  crypto
    .createHash('sha1')
    .update(`${path.resolve(projectRoot)}::${path.resolve(worktreeRoot)}`)
    .digest('hex');

const buildActiveSessionStats = (record: SessionRecord): IndexedSessionStats => {
  const messages = record.session.messages;
  let userRoundCount = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === 'user') {
      userRoundCount += 1;
    }
  }
  return {
    userRoundCount,
    lastModel: record.resolvedModelSpec,
    lastThinkingLevel: record.resolvedThinkingLevel,
  };
};

const readSessionCatalogStats = async (
  sessionFile: string,
): Promise<IndexedSessionStats> => {
  try {
    const content = await fs.readFile(sessionFile, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    let userRoundCount = 0;
    let lastModel = '';
    let lastThinkingLevel = '';

    for (const line of lines) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }

      if (parsed.type === 'message') {
        const message = parsed.message as Record<string, unknown> | undefined;
        if (message?.role === 'user') {
          userRoundCount += 1;
        }
      }

      if (parsed.type === 'model_change') {
        const provider = normalizeString(parsed.provider);
        const modelId = normalizeString(parsed.modelId);
        lastModel = provider && modelId ? `${provider}/${modelId}` : modelId || lastModel;
      }

      if (parsed.type === 'thinking_level_change') {
        lastThinkingLevel = normalizeString(parsed.thinkingLevel) || lastThinkingLevel;
      }
    }

    return {
      userRoundCount,
      lastModel: lastModel || undefined,
      lastThinkingLevel: lastThinkingLevel || undefined,
    };
  } catch {
    return {
      userRoundCount: 0,
      lastModel: undefined,
      lastThinkingLevel: undefined,
    };
  }
};

const loadManagedProjectScopes = async (
  resolver: ProjectContextResolverLike,
  workspaceChatConfig: WorkspaceChatConfig,
): Promise<ManagedProjectScope[]> => {
  const state = await getProjects();
  const projects = [
    createWorkspaceChatProject(workspaceChatConfig),
    ...state.projects,
  ];
  return Promise.all(
    projects.map(async (project) => {
      const context = await resolver.resolveContext(project.path);
      const declaredRoots = [
        path.resolve(project.path),
        path.resolve(context.projectRoot),
        ...context.worktrees.map((item) => path.resolve(item.path)),
      ];
      const allowedRoots = new Set<string>();

      for (const declaredRoot of declaredRoots) {
        allowedRoots.add(declaredRoot);
        allowedRoots.add(await resolveExistingRealPath(declaredRoot));
      }

      return {
        project,
        allowedRoots: [...allowedRoots],
      };
    }),
  );
};

const getManagedProjectScopes = async (
  resolver: ProjectContextResolverLike,
  workspaceChatConfig: WorkspaceChatConfig,
): Promise<ManagedProjectScope[]> => {
  if (!managedProjectScopesPromise) {
    managedProjectScopesPromise = loadManagedProjectScopes(
      resolver,
      workspaceChatConfig,
    );
  }

  return managedProjectScopesPromise;
};

const resolveManagedProject = (
  cwd: string,
  scopes: ManagedProjectScope[],
  resolver: ProjectContextResolverLike,
) => {
  let matchedScope: ManagedProjectScope | null = null;
  let matchedRootLength = -1;

  for (const scope of scopes) {
    for (const root of scope.allowedRoots) {
      if (!resolver.isPathInsideRoot(cwd, root)) {
        continue;
      }

      if (root.length > matchedRootLength) {
        matchedScope = scope;
        matchedRootLength = root.length;
      }
    }
  }

  return matchedScope;
};

const resolveIndexedSessionContextEntry = async (
  cwd: string,
  resolver: ProjectContextResolverLike,
  workspaceChatConfig: WorkspaceChatConfig,
): Promise<IndexedSessionContextEntry | null> => {
  const normalizedCwd = path.resolve(cwd);
  const scopes = await getManagedProjectScopes(resolver, workspaceChatConfig);
  const projectScope = resolveManagedProject(normalizedCwd, scopes, resolver);
  if (!projectScope) {
    return null;
  }

  return {
    projectId: projectScope.project.id,
    projectLabel: projectScope.project.name,
    context: await resolver.resolveContext(normalizedCwd),
  };
};

const updateParentSessionIds = async (rows: IndexedSessionRow[]) => {
  if (rows.length === 0) {
    return;
  }

  const db = await getRidgeDb();
  const updateParent = db.prepare(
    'UPDATE sessions SET parent_session_id = ? WHERE session_id = ?',
  );
  const selectSessionIdByFile = db.prepare(
    'SELECT session_id AS sessionId FROM sessions WHERE session_file = ?',
  );
  const rowsByResolvedPath = new Map(
    rows.map((row) => [path.resolve(row.sessionFile), row.id]),
  );

  db.transaction(() => {
    for (const row of rows) {
      const parentId = row.parentSessionPath
        ? rowsByResolvedPath.get(path.resolve(row.parentSessionPath)) ||
          (selectSessionIdByFile.get(path.resolve(row.parentSessionPath)) as
              | { sessionId: string }
              | undefined)?.sessionId ||
          null
        : null;
      updateParent.run(parentId, row.id);
    }
  })();
};

const upsertCatalogRows = async (
  rows: IndexedSessionRow[],
  contexts: IndexedSessionContextEntry[],
) => {
  const db = await getRidgeDb();
  const upsertSession = db.prepare(
    `INSERT INTO sessions(
      session_id,
      title,
      cwd,
      session_file,
      parent_session_path,
      created_at,
      updated_at,
      context_id,
      user_round_count,
      last_model,
      last_thinking_level
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      title = excluded.title,
      cwd = excluded.cwd,
      session_file = excluded.session_file,
      parent_session_path = excluded.parent_session_path,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      context_id = excluded.context_id,
      user_round_count = excluded.user_round_count,
      last_model = excluded.last_model,
      last_thinking_level = excluded.last_thinking_level`,
  );
  const upsertContext = db.prepare(
    `INSERT INTO session_contexts(
      context_id,
      project_id,
      project_root,
      project_label,
      worktree_root,
      worktree_label,
      branch,
      is_git,
      cwd
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(context_id) DO UPDATE SET
      project_id = excluded.project_id,
      project_root = excluded.project_root,
      project_label = excluded.project_label,
      worktree_root = excluded.worktree_root,
      worktree_label = excluded.worktree_label,
      branch = excluded.branch,
      is_git = excluded.is_git,
      cwd = excluded.cwd`,
  );
  db.transaction(() => {
    for (const row of rows) {
      upsertSession.run(
        row.id,
        row.title,
        row.cwd,
        row.sessionFile,
        row.parentSessionPath || null,
        row.createdAt,
        row.updatedAt,
        row.contextId,
        row.userRoundCount,
        row.lastModel || null,
        row.lastThinkingLevel || null,
      );
    }
    for (const { projectId, projectLabel, context } of contexts) {
      upsertContext.run(
        buildContextId(context.projectRoot, context.worktreeRoot),
        projectId,
        toPosixPath(path.resolve(context.projectRoot)),
        projectLabel,
        toPosixPath(path.resolve(context.worktreeRoot)),
        context.worktreeLabel,
        context.branch || null,
        context.isGit ? 1 : 0,
        toPosixPath(path.resolve(context.worktreeRoot)),
      );
    }
  })();
};

const refreshCatalogEntries = async (
  rows: IndexedSessionRow[],
  contexts: IndexedSessionContextEntry[],
) => {
  await upsertCatalogRows(rows, contexts);
  const db = await getRidgeDb();
  db.transaction(() => {
    db.prepare(
      "DELETE FROM session_contexts WHERE context_id NOT IN (SELECT DISTINCT context_id FROM sessions WHERE context_id IS NOT NULL AND context_id != '')",
    ).run();
    if (rows.length > 0) {
      const placeholders = rows.map(() => '?').join(', ');
      db.prepare(`DELETE FROM sessions WHERE session_id NOT IN (${placeholders})`).run(
        ...rows.map((r) => r.id),
      );
    } else {
      db.prepare('DELETE FROM sessions').run();
    }
  })();
};

export const refreshSessionCatalog = async (
  options: RefreshSessionCatalogOptions,
) => {
  const scopes = await getManagedProjectScopes(
    options.projectContextResolver,
    options.workspaceChatConfig,
  );
  const allSessions = await SessionManager.listAll();
  const rows: IndexedSessionRow[] = [];
  const contexts = new Map<string, IndexedSessionContextEntry>();
  const knownIds = new Set<string>();

  const contextCache = new Map<string, ProjectContext>();
  const appendSession = async (entry: {
    id: string;
    name: string;
    cwd?: string;
    path: string;
    created: Date;
    modified: Date;
    firstMessage?: unknown;
    parentSessionPath?: string;
  }) => {
    const cwd = normalizeString(entry.cwd);
    if (!cwd) {
      return;
    }

    const normalizedCwd = path.resolve(cwd);
    const projectScope = resolveManagedProject(
      normalizedCwd,
      scopes,
      options.projectContextResolver,
    );
    if (!projectScope) {
      return;
    }

    const scopeKey = normalizedCwd;
    let projectContext = contextCache.get(scopeKey);
    if (!projectContext) {
      projectContext = await options.projectContextResolver.resolveContext(normalizedCwd);
      contextCache.set(scopeKey, projectContext);
    }

    const contextId = buildContextId(
      projectContext.projectRoot,
      projectContext.worktreeRoot,
    );
    const activeRecord = options.activeSessions.get(entry.id);
    const resolvedSessionFile = path.resolve(entry.path);
    const stats = activeRecord
      ? buildActiveSessionStats(activeRecord)
      : await readSessionCatalogStats(resolvedSessionFile);

    rows.push({
      id: entry.id,
      title:
        normalizeString(activeRecord?.session.sessionName) ||
        normalizeString(entry.name) ||
        getFallbackTitle(entry.firstMessage),
      cwd: toPosixPath(normalizedCwd),
      sessionFile: toPosixPath(resolvedSessionFile),
      parentSessionPath: entry.parentSessionPath
        ? toPosixPath(path.resolve(entry.parentSessionPath))
        : undefined,
      createdAt: entry.created.getTime(),
      updatedAt: Math.max(entry.modified.getTime(), activeRecord?.updatedAt || 0),
      contextId,
      userRoundCount: stats.userRoundCount,
      lastModel: stats.lastModel,
      lastThinkingLevel: stats.lastThinkingLevel,
    });

    contexts.set(contextId, {
      projectId: projectScope.project.id,
      projectLabel: projectScope.project.name,
      context: projectContext,
    });
    knownIds.add(entry.id);
  };

  await Promise.all(
    allSessions.map((info) =>
      appendSession({
        id: info.id,
        name: info.name,
        cwd: info.cwd,
        path: info.path,
        created: info.created,
        modified: info.modified,
        firstMessage: info.firstMessage,
        parentSessionPath: info.parentSessionPath,
      }),
    ),
  );

  await Promise.all(
    [...options.activeSessions.values()].map(async (record) => {
      if (knownIds.has(record.id)) {
        return;
      }

      await appendSession({
        id: record.id,
        name: record.session.sessionName || '',
        cwd: record.cwd,
        path: record.sessionFile,
        created: new Date(record.createdAt),
        modified: new Date(record.updatedAt),
        firstMessage: record.session.messages[0]?.content,
        parentSessionPath: record.parentSessionPath,
      });
    }),
  );

  await refreshCatalogEntries(rows, [...contexts.values()]);
  await updateParentSessionIds(rows);
};

export const upsertIndexedSessionRecord = async (
  record: SessionRecord,
  options: UpsertIndexedSessionRecordOptions,
): Promise<void> => {
  const contextEntry = await resolveIndexedSessionContextEntry(
    record.cwd,
    options.projectContextResolver,
    options.workspaceChatConfig,
  );
  if (!contextEntry) {
    return;
  }

  const resolvedSessionFile = path.resolve(record.sessionFile);
  const stats = buildActiveSessionStats(record);
  const contextId = buildContextId(
    contextEntry.context.projectRoot,
    contextEntry.context.worktreeRoot,
  );
  const row: IndexedSessionRow = {
    id: record.id,
    title: normalizeString(record.session.sessionName) || '新会话',
    cwd: toPosixPath(path.resolve(record.cwd)),
    sessionFile: toPosixPath(resolvedSessionFile),
    parentSessionPath: record.parentSessionPath
      ? toPosixPath(path.resolve(record.parentSessionPath))
      : undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    contextId,
    userRoundCount: stats.userRoundCount,
    lastModel: stats.lastModel,
    lastThinkingLevel: stats.lastThinkingLevel,
  };

  await upsertCatalogRows([row], [contextEntry]);
  await updateParentSessionIds([row]);
};

export const listIndexedSessions = async (
  activeSessions: Map<string, SessionRecord>,
): Promise<IndexedSessionSummary[]> => {
  const db = await getRidgeDb();
  const rows = db
    .prepare(
      `SELECT
         s.session_id AS id,
         s.title,
         s.cwd,
         s.updated_at AS updatedAt,
         s.created_at AS createdAt,
         s.archived,
         s.session_file AS sessionFile,
         s.parent_session_id AS parentSessionId,
         s.context_id AS contextId
       FROM sessions s
       ORDER BY s.archived ASC, s.updated_at DESC`,
    )
    .all() as Array<{
      id: string;
      title: string;
      cwd: string;
      updatedAt: number;
      createdAt: number;
      archived: number;
      sessionFile: string;
      parentSessionId: string | null;
      contextId: string;
    }>;
  return rows.map((row) => {
    const activeRecord = activeSessions.get(row.id);
    return {
      id: row.id,
      title: normalizeString(activeRecord?.session.sessionName) || row.title,
      status: activeRecord?.status || 'idle',
      cwd: row.cwd,
      updatedAt: activeRecord
        ? Math.max(row.updatedAt, activeRecord.updatedAt)
        : row.updatedAt,
      createdAt: row.createdAt,
      archived: Boolean(row.archived),
      sessionFile: row.sessionFile,
      parentSessionId: row.parentSessionId || undefined,
      contextId: row.contextId,
    };
  });
};

export const getIndexedSessionLookup = async (
  sessionId: string,
): Promise<IndexedSessionLookup | null> => {
  const db = await getRidgeDb();
  const row = db
    .prepare(
      `SELECT
         s.session_id AS id,
         s.title,
         s.cwd,
         s.session_file AS sessionFile,
         s.parent_session_path AS parentSessionPath,
         s.parent_session_id AS parentSessionId,
         s.created_at AS createdAt,
         s.updated_at AS updatedAt,
         s.context_id AS contextId,
         s.archived,
         s.user_round_count AS userRoundCount,
         s.last_model AS lastModel,
         s.last_thinking_level AS lastThinkingLevel,
         ss.agent_name AS agent,
         ss.explicit_model AS explicitModel,
         ss.explicit_thinking_level AS explicitThinkingLevel
       FROM sessions s
       LEFT JOIN session_selections ss ON ss.session_id = s.session_id
       WHERE s.session_id = ?`,
    )
    .get(sessionId) as
    | {
        id: string;
        title: string;
        cwd: string;
        sessionFile: string;
        parentSessionPath: string | null;
        parentSessionId: string | null;
        createdAt: number;
        updatedAt: number;
        contextId: string;
        archived: number;
        userRoundCount: number;
        lastModel: string | null;
        lastThinkingLevel: string | null;
        agent: string | null;
        explicitModel: string | null;
        explicitThinkingLevel: string | null;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    cwd: row.cwd,
    sessionFile: row.sessionFile,
    parentSessionPath: row.parentSessionPath || undefined,
    parentSessionId: row.parentSessionId || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    contextId: row.contextId,
    archived: Boolean(row.archived),
    agent: row.agent || undefined,
    explicitModel: row.explicitModel || undefined,
    explicitThinkingLevel: row.explicitThinkingLevel || undefined,
    lastModel: row.lastModel || undefined,
    lastThinkingLevel: row.lastThinkingLevel || undefined,
    userRoundCount: row.userRoundCount,
  };
};

export const getIndexedSessionContext = async (
  contextId: string,
): Promise<IndexedSessionContextSummary | null> => {
  const db = await getRidgeDb();
  const row = db
    .prepare(
      `SELECT
         context_id AS contextId,
         cwd,
         project_id AS projectId,
         project_label AS projectLabel,
         project_root AS projectRoot,
         worktree_root AS worktreeRoot,
         worktree_label AS worktreeLabel,
         branch,
         is_git AS isGit
       FROM session_contexts
       WHERE context_id = ?`,
    )
    .get(contextId) as
    | {
        contextId: string;
        cwd: string;
        projectId: string;
        projectLabel: string;
        projectRoot: string;
        worktreeRoot: string;
        worktreeLabel: string;
        branch: string | null;
        isGit: number;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    contextId: row.contextId,
    cwd: row.cwd,
    projectId: row.projectId,
    projectLabel: row.projectLabel,
    projectRoot: row.projectRoot,
    worktreeRoot: row.worktreeRoot,
    worktreeLabel: row.worktreeLabel,
    branch: row.branch || undefined,
    isGit: Boolean(row.isGit),
  };
};

export const getIndexedSessionTree = async (
  sessionId: string,
): Promise<IndexedSessionTreeNode[]> => {
  const db = await getRidgeDb();
  return db
    .prepare(
      `WITH RECURSIVE session_tree(session_id, session_file) AS (
         SELECT session_id, session_file
         FROM sessions
         WHERE session_id = ?
         UNION ALL
         SELECT child.session_id, child.session_file
         FROM sessions child
         INNER JOIN session_tree parent ON child.parent_session_id = parent.session_id
       )
       SELECT session_id AS id, session_file AS sessionFile
       FROM session_tree`,
    )
    .all(sessionId) as IndexedSessionTreeNode[];
};

export const listIndexedSessionContexts = async () => {
  const db = await getRidgeDb();
  const rows = db
    .prepare(
      `SELECT
         context_id AS contextId,
         cwd,
         project_id AS projectId,
         project_label AS projectLabel,
         project_root AS projectRoot,
         worktree_root AS worktreeRoot,
         worktree_label AS worktreeLabel,
         branch,
         is_git AS isGit
       FROM session_contexts`,
    )
    .all() as Array<{
      contextId: string;
      cwd: string;
      projectId: string;
      projectLabel: string;
      projectRoot: string;
      worktreeRoot: string;
      worktreeLabel: string;
      branch: string | null;
      isGit: number;
    }>;

  return Object.fromEntries(
    rows.map((row) => [
      row.contextId,
      {
        ...row,
        branch: row.branch || undefined,
        isGit: Boolean(row.isGit),
      },
    ]),
  );
};
