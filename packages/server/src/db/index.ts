import fs from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getRidgeDbPath } from '../utils/paths.js';
import { normalizeString } from '../utils/strings.js';
import { RIDGE_DB_BOOTSTRAP_SQL, RIDGE_DB_SCHEMA_VERSION } from './migrations.js';
import { type SessionMetadataState } from '../types/index.js';

type RidgeDatabase = InstanceType<typeof Database>;

let dbPromise: Promise<RidgeDatabase> | null = null;
const CURRENT_WORKSPACE_META_KEY = 'current_workspace_dir';

const openDatabase = async (): Promise<RidgeDatabase> => {
  const dbPath = await getRidgeDbPath();
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(RIDGE_DB_BOOTSTRAP_SQL);
  ensureSchemaVersion(db);
  return db;
};

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
      const db = await openDatabase();
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
