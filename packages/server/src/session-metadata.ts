import type { SessionMetadata, SessionMetadataState, SessionSelection } from './types/index.js';
import { getRidgeDb } from './db/index.js';
import { normalizeString } from './utils/strings.js';

export interface SessionMetadataStore {
  load(): Promise<SessionMetadataState>;
  getSessionMetadata(sessionId: string): Promise<Partial<SessionMetadata>>;
  upsertSession(sessionInput: SessionMetadata): Promise<void>;
  setArchived(sessionIds: string[], archived: boolean): Promise<void>;
  removeSessions(sessionIds: string[]): Promise<void>;
  setSelection(sessionId: string, selection: SessionSelection): Promise<void>;
  setAgent(sessionId: string, agent: string | undefined): Promise<void>;
}

const METADATA_VERSION = 3;

const mapRowToMetadata = (row: {
  session_id: string;
  title: string;
  cwd: string;
  session_file: string;
  parent_session_path: string | null;
  created_at: number;
  updated_at: number;
  archived: number;
  agent_name: string | null;
  explicit_model: string | null;
  explicit_thinking_level: string | null;
}): SessionMetadata & { archived?: boolean } => ({
  id: row.session_id,
  title: row.title,
  cwd: row.cwd,
  sessionFile: row.session_file,
  parentSessionPath: row.parent_session_path || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  agent: row.agent_name || undefined,
  model: row.explicit_model || undefined,
  thinkingLevel: row.explicit_thinking_level || undefined,
  archived: Boolean(row.archived),
});

export function createSessionMetadataStore(): SessionMetadataStore {
  const load = async (): Promise<SessionMetadataState> => {
    const db = await getRidgeDb();
    const rows = db
      .prepare(
        `SELECT
           s.session_id,
           s.title,
           s.cwd,
           s.session_file,
           s.parent_session_path,
           s.created_at,
           s.updated_at,
           s.archived,
           ss.agent_name,
           ss.explicit_model,
           ss.explicit_thinking_level
         FROM sessions s
         LEFT JOIN session_selections ss ON ss.session_id = s.session_id`,
      )
      .all() as Array<{
      session_id: string;
      title: string;
      cwd: string;
      session_file: string;
      parent_session_path: string | null;
      created_at: number;
      updated_at: number;
      archived: number;
      agent_name: string | null;
      explicit_model: string | null;
      explicit_thinking_level: string | null;
    }>;

    return {
      version: METADATA_VERSION,
      sessions: Object.fromEntries(
        rows.map((row) => [row.session_id, mapRowToMetadata(row)]),
      ),
    };
  };

  const getSessionMetadata = async (
    sessionId: string,
  ): Promise<Partial<SessionMetadata>> => {
    const db = await getRidgeDb();
    const row = db
      .prepare(
        `SELECT
           s.session_id,
           s.title,
           s.cwd,
           s.session_file,
           s.parent_session_path,
           s.created_at,
           s.updated_at,
           s.archived,
           ss.agent_name,
           ss.explicit_model,
           ss.explicit_thinking_level
         FROM sessions s
         LEFT JOIN session_selections ss ON ss.session_id = s.session_id
         WHERE s.session_id = ?`,
      )
      .get(sessionId) as
      | {
          session_id: string;
          title: string;
          cwd: string;
          session_file: string;
          parent_session_path: string | null;
          created_at: number;
          updated_at: number;
          archived: number;
          agent_name: string | null;
          explicit_model: string | null;
          explicit_thinking_level: string | null;
        }
      | undefined;

    return row ? mapRowToMetadata(row) : {};
  };

  const upsertSession = async (sessionInput: SessionMetadata): Promise<void> => {
    const db = await getRidgeDb();
    db.prepare(
      `INSERT INTO sessions(
        session_id,
        title,
        cwd,
        session_file,
        parent_session_path,
        created_at,
        updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        title = excluded.title,
        cwd = excluded.cwd,
        session_file = excluded.session_file,
        parent_session_path = excluded.parent_session_path,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at`,
    ).run(
      sessionInput.id,
      sessionInput.title,
      sessionInput.cwd,
      sessionInput.sessionFile,
      sessionInput.parentSessionPath || null,
      sessionInput.createdAt,
      sessionInput.updatedAt,
    );

    if (
      sessionInput.agent !== undefined ||
      sessionInput.model !== undefined ||
      sessionInput.thinkingLevel !== undefined
    ) {
      await setSelection(sessionInput.id, {
        agent: sessionInput.agent,
        model: sessionInput.model,
        thinkingLevel: sessionInput.thinkingLevel as SessionSelection['thinkingLevel'],
      });
    }
  };

  const ensureSessionRow = async (sessionId: string) => {
    const db = await getRidgeDb();
    db.prepare(
      `INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at)
       VALUES(?, '', '', '', 0, 0)
       ON CONFLICT(session_id) DO NOTHING`,
    ).run(sessionId);
  };

  const setArchived = async (
    sessionIds: string[],
    archived: boolean,
  ): Promise<void> => {
    if (sessionIds.length === 0) {
      return;
    }

    const db = await getRidgeDb();
    const statement = db.prepare(
      'UPDATE sessions SET archived = ?, updated_at = ? WHERE session_id = ?',
    );
    const now = Date.now();
    db.transaction((ids: string[]) => {
      for (const sessionId of ids) {
        statement.run(archived ? 1 : 0, now, sessionId);
      }
    })(sessionIds);
  };

  const removeSessions = async (sessionIds: string[]): Promise<void> => {
    if (sessionIds.length === 0) {
      return;
    }

    const db = await getRidgeDb();
    const deleteSelection = db.prepare('DELETE FROM session_selections WHERE session_id = ?');
    const deleteSession = db.prepare('DELETE FROM sessions WHERE session_id = ?');
    db.transaction((ids: string[]) => {
      for (const sessionId of ids) {
        deleteSelection.run(sessionId);
        deleteSession.run(sessionId);
      }
    })(sessionIds);
  };

  const setSelection = async (
    sessionId: string,
    selection: SessionSelection,
  ): Promise<void> => {
    await ensureSessionRow(sessionId);
    const db = await getRidgeDb();
    const current = db
      .prepare(
        `SELECT agent_name
              , explicit_model
              , explicit_thinking_level
         FROM session_selections
         WHERE session_id = ?`,
      )
      .get(sessionId) as
      | {
          agent_name: string | null;
          explicit_model: string | null;
          explicit_thinking_level: string | null;
        }
      | undefined;
    db.prepare(
      `INSERT INTO session_selections(session_id, agent_name, explicit_model, explicit_thinking_level, updated_at)
       VALUES(?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         agent_name = excluded.agent_name,
         explicit_model = excluded.explicit_model,
         explicit_thinking_level = excluded.explicit_thinking_level,
         updated_at = excluded.updated_at`,
    ).run(
      sessionId,
      selection.agent !== undefined
        ? normalizeString(selection.agent) || null
        : (current?.agent_name ?? null),
      selection.model !== undefined
        ? normalizeString(selection.model) || null
        : (current?.explicit_model ?? null),
      selection.thinkingLevel !== undefined
        ? normalizeString(selection.thinkingLevel) || null
        : (current?.explicit_thinking_level ?? null),
      Date.now(),
    );
  };

  const setAgent = async (sessionId: string, agent: string | undefined) =>
    setSelection(sessionId, { agent });

  return {
    load,
    getSessionMetadata,
    upsertSession,
    setArchived,
    removeSessions,
    setSelection,
    setAgent,
  };
}
