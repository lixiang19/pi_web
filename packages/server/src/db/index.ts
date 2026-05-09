import fs from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getRidgeDbPath } from '../utils/paths.js';
import { normalizeString } from '../utils/strings.js';
import { RIDGE_DB_BOOTSTRAP_SQL, RIDGE_DB_SCHEMA_VERSION } from './migrations.js';
import { type SessionMetadataState } from '../types/index.js';

type RidgeDatabase = InstanceType<typeof Database>;
type WorkspaceTableName = 'workspace_milestones' | 'workspace_tasks';
type ColumnDefinition = {
  name: string;
  definition: string;
};

let dbPromise: Promise<RidgeDatabase> | null = null;
const CURRENT_WORKSPACE_META_KEY = 'current_workspace_dir';
const DEFAULT_MILESTONE_ID = 'milestone-legacy';
const DEFAULT_MILESTONE_TITLE = '未归属';
const DEFAULT_MILESTONE_COLOR = '#64748b';
const WORKSPACE_MILESTONE_COLUMNS: ColumnDefinition[] = [
  { name: 'workspace_path', definition: "TEXT NOT NULL DEFAULT ''" },
  { name: 'title', definition: "TEXT NOT NULL DEFAULT ''" },
  { name: 'goal', definition: "TEXT NOT NULL DEFAULT ''" },
  { name: 'acceptance_criteria', definition: "TEXT NOT NULL DEFAULT ''" },
  { name: 'status', definition: "TEXT NOT NULL DEFAULT 'pending'" },
  { name: 'due_date', definition: 'INTEGER' },
  { name: 'is_system', definition: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'color', definition: `TEXT NOT NULL DEFAULT '${DEFAULT_MILESTONE_COLOR}'` },
  { name: 'sort_order', definition: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'created_at', definition: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'updated_at', definition: 'INTEGER NOT NULL DEFAULT 0' },
];
const WORKSPACE_TASK_COLUMNS: ColumnDefinition[] = [
  { name: 'workspace_path', definition: "TEXT NOT NULL DEFAULT ''" },
  { name: 'milestone_id', definition: "TEXT NOT NULL DEFAULT ''" },
  { name: 'title', definition: "TEXT NOT NULL DEFAULT ''" },
  { name: 'status', definition: "TEXT NOT NULL DEFAULT 'pending'" },
  { name: 'priority', definition: "TEXT NOT NULL DEFAULT 'normal'" },
  { name: 'acceptance_criteria', definition: "TEXT NOT NULL DEFAULT ''" },
  { name: 'due_date', definition: 'INTEGER' },
  { name: 'blocked_reason', definition: 'TEXT' },
  { name: 'processing_session_id', definition: 'TEXT' },
  { name: 'sort_order', definition: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'created_at', definition: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'updated_at', definition: 'INTEGER NOT NULL DEFAULT 0' },
];

const openDatabase = async (workspaceDir?: string): Promise<RidgeDatabase> => {
  const dbPath = await getRidgeDbPath();
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runPreBootstrapMigrations(db, workspaceDir);
  db.exec(RIDGE_DB_BOOTSTRAP_SQL);
  ensureSchemaVersion(db);
  return db;
};

const runPreBootstrapMigrations = (
  db: RidgeDatabase,
  workspaceDir?: string,
) => {
  const workspacePath = workspaceDir ? path.resolve(workspaceDir) : null;

  ensureColumns(db, 'workspace_milestones', WORKSPACE_MILESTONE_COLUMNS);
  ensureColumns(db, 'workspace_tasks', WORKSPACE_TASK_COLUMNS);
  ensureLegacyWorkspacePath(db, 'workspace_milestones', workspacePath);
  ensureLegacyWorkspacePath(db, 'workspace_tasks', workspacePath);
  ensureLegacyTaskMilestone(db, workspacePath);
};

const ensureColumns = (
  db: RidgeDatabase,
  tableName: WorkspaceTableName,
  definitions: ColumnDefinition[],
) => {
  const columns = getColumnNames(db, tableName);
  if (columns.length === 0) {
    return;
  }

  for (const column of definitions) {
    if (!columns.includes(column.name)) {
      db.prepare(
        `ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${column.definition}`,
      ).run();
    }
  }
};

const ensureLegacyWorkspacePath = (
  db: RidgeDatabase,
  tableName: WorkspaceTableName,
  workspacePath: string | null,
) => {
  if (!workspacePath || !hasColumn(db, tableName, 'workspace_path')) {
    return;
  }

  db.prepare(
    `UPDATE ${tableName} SET workspace_path = ? WHERE workspace_path = ''`,
  ).run(workspacePath);
};

const ensureLegacyTaskMilestone = (
  db: RidgeDatabase,
  workspacePath: string | null,
) => {
  if (
    !workspacePath ||
    !hasColumn(db, 'workspace_tasks', 'milestone_id') ||
    !hasColumn(db, 'workspace_milestones', 'milestone_id')
  ) {
    return;
  }

  const orphanCount = db
    .prepare(`SELECT COUNT(*) AS count FROM workspace_tasks WHERE milestone_id = ''`)
    .get() as { count: number };
  if (orphanCount.count === 0) {
    return;
  }

  ensureLegacyDefaultMilestone(db, workspacePath);
  db.prepare(
    `UPDATE workspace_tasks SET milestone_id = ? WHERE milestone_id = ''`,
  ).run(DEFAULT_MILESTONE_ID);
};

const ensureLegacyDefaultMilestone = (
  db: RidgeDatabase,
  workspacePath: string,
) => {
  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO workspace_milestones(
      milestone_id, workspace_path, title, goal, acceptance_criteria, status,
      due_date, is_system, color, sort_order, created_at, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    DEFAULT_MILESTONE_ID,
    workspacePath,
    DEFAULT_MILESTONE_TITLE,
    '系统默认里程碑，用于承载旧库未手动归属的任务',
    '系统里程碑不允许完成',
    'pending',
    null,
    1,
    DEFAULT_MILESTONE_COLOR,
    0,
    now,
    now,
  );
};

const getColumnNames = (
  db: RidgeDatabase,
  tableName: WorkspaceTableName,
): string[] =>
  (db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]).map(
    (column) => column.name,
  );

const hasColumn = (
  db: RidgeDatabase,
  tableName: WorkspaceTableName,
  columnName: string,
): boolean => getColumnNames(db, tableName).includes(columnName);

const ensureSchemaVersion = (db: RidgeDatabase) => {
  const currentVersion = db
    .prepare(`SELECT value FROM ridge_meta WHERE key = 'schema_version'`)
    .get() as { value?: string } | undefined;

  if (Number(currentVersion?.value || '0') === RIDGE_DB_SCHEMA_VERSION) {
    return;
  }

  db.prepare(
    `INSERT INTO ridge_meta(key, value) VALUES('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(String(RIDGE_DB_SCHEMA_VERSION));
};

const migrateLegacySessionMetadata = async (
  db: RidgeDatabase,
  workspaceDir?: string,
) => {
  if (!workspaceDir) {
    return;
  }

  const legacyPath = path.join(workspaceDir, '.pi-web', 'session-sidebar.json');
  const exists = await pathExists(legacyPath);
  if (!exists) {
    return;
  }

  const raw = await fs.readFile(legacyPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<SessionMetadataState>;
  const sessions = parsed.sessions ?? {};

  const upsertSession = db.prepare(
    `INSERT INTO sessions(
      session_id,
      title,
      cwd,
      session_file,
      parent_session_path,
      created_at,
      updated_at,
      archived
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      title = excluded.title,
      cwd = excluded.cwd,
      session_file = excluded.session_file,
      parent_session_path = excluded.parent_session_path,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      archived = excluded.archived`,
  );
  const upsertSelection = db.prepare(
    `INSERT INTO session_selections(session_id, agent_name, explicit_model, explicit_thinking_level, updated_at)
     VALUES(?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       agent_name = excluded.agent_name,
       explicit_model = excluded.explicit_model,
       explicit_thinking_level = excluded.explicit_thinking_level,
       updated_at = excluded.updated_at`,
  );

  const migrate = db.transaction(() => {
    for (const [sessionId, metadata] of Object.entries(sessions)) {
      const updatedAt = Number.isFinite(metadata.updatedAt) ? metadata.updatedAt : Date.now();
      const createdAt = Number.isFinite(metadata.createdAt) ? metadata.createdAt : updatedAt;
      upsertSession.run(
        sessionId,
        metadata.title || '',
        metadata.cwd || '',
        metadata.sessionFile || '',
        metadata.parentSessionPath || null,
        createdAt,
        updatedAt,
        metadata.archived ? 1 : 0,
      );
      upsertSelection.run(
        sessionId,
        normalizeString(metadata.agent) || null,
        null,
        null,
        updatedAt,
      );
    }
  });

  migrate();
  await fs.rm(legacyPath, { force: true });
  await fs.rmdir(path.dirname(legacyPath)).catch(() => undefined);
};

const pathExists = async (targetPath: string) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

export async function initializeRidgeDb(workspaceDir?: string): Promise<RidgeDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await openDatabase(workspaceDir);
      await migrateLegacySessionMetadata(db, workspaceDir);
      return db;
    })();
  }

  return dbPromise;
}

export async function getRidgeDb(): Promise<RidgeDatabase> {
  return initializeRidgeDb();
}

export async function getStoredWorkspaceDir(): Promise<string | null> {
  const db = await getRidgeDb();
  const row = db
    .prepare('SELECT value FROM ridge_meta WHERE key = ?')
    .get(CURRENT_WORKSPACE_META_KEY) as { value: string } | undefined;
  return row?.value || null;
}

export async function ensureStoredWorkspaceDir(workspaceDir: string): Promise<void> {
  const db = await getRidgeDb();
  db.prepare(
    `INSERT INTO ridge_meta(key, value)
     VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(CURRENT_WORKSPACE_META_KEY, workspaceDir);
}
