import fs from 'node:fs/promises';
import path from 'node:path';
import type { SessionMetadata, SessionMetadataState, SessionSelection } from './types/index.js';

const METADATA_VERSION = 2;

const createDefaultState = (): SessionMetadataState => ({
  version: METADATA_VERSION,
  sessions: {},
});

export interface SessionMetadataStore {
  load(): Promise<SessionMetadataState>;
  getSessionMetadata(sessionId: string): Promise<Partial<SessionMetadata>>;
  upsertSession(sessionInput: SessionMetadata): Promise<void>;
  setArchived(sessionIds: string[], archived: boolean): Promise<void>;
  removeSessions(sessionIds: string[]): Promise<void>;
  setSelection(sessionId: string, selection: SessionSelection): Promise<void>;
  setAgent(sessionId: string, agent: string | undefined): Promise<void>;
}

export function createSessionMetadataStore(workspaceDir: string): SessionMetadataStore {
  const metadataDir = path.join(workspaceDir, '.pi-web');
  const metadataFile = path.join(metadataDir, 'session-sidebar.json');

  let cachedState: SessionMetadataState | null = null;
  let writeQueue: Promise<void> = Promise.resolve();

  const load = async (): Promise<SessionMetadataState> => {
    if (cachedState) {
      return cachedState;
    }

    try {
      const content = await fs.readFile(metadataFile, 'utf8');
      const parsed = JSON.parse(content) as Partial<SessionMetadataState>;
      cachedState = {
        ...createDefaultState(),
        ...parsed,
        sessions:
          typeof parsed?.sessions === 'object' && parsed.sessions
            ? parsed.sessions
            : {},
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }

      cachedState = createDefaultState();
    }

    return cachedState;
  };

  const persist = async (state: SessionMetadataState): Promise<void> => {
    cachedState = state;

    writeQueue = writeQueue.then(async () => {
      await fs.mkdir(metadataDir, { recursive: true });
      await fs.writeFile(
        metadataFile,
        `${JSON.stringify(state, null, 2)}\n`,
        'utf8',
      );
    });

    await writeQueue;
  };

  const getSessionMetadata = async (sessionId: string): Promise<Partial<SessionMetadata>> => {
    const state = await load();
    return state.sessions[sessionId] ?? {};
  };

  const upsertSession = async (sessionInput: SessionMetadata): Promise<void> => {
    const state = await load();
    const nextState: SessionMetadataState = {
      ...state,
      sessions: { ...state.sessions },
    };

    const current = nextState.sessions[sessionInput.id] ?? {};
    nextState.sessions[sessionInput.id] = {
      ...current,
      title: sessionInput.title,
      cwd: sessionInput.cwd,
      sessionFile: sessionInput.sessionFile,
      parentSessionPath: sessionInput.parentSessionPath,
      createdAt: sessionInput.createdAt,
      updatedAt: sessionInput.updatedAt,
      ...(sessionInput.agent !== undefined
        ? { agent: sessionInput.agent || undefined }
        : {}),
      ...(sessionInput.model !== undefined
        ? { model: normalizeString(sessionInput.model) || undefined }
        : {}),
      ...(sessionInput.thinkingLevel !== undefined
        ? {
            thinkingLevel:
              normalizeString(sessionInput.thinkingLevel) || undefined,
          }
        : {}),
    };

    await persist(nextState);
  };

  const setArchived = async (sessionIds: string[], archived: boolean): Promise<void> => {
    const state = await load();
    const nextState: SessionMetadataState = {
      ...state,
      sessions: { ...state.sessions },
    };

    for (const sessionId of sessionIds) {
      const current = nextState.sessions[sessionId] ?? {};
      nextState.sessions[sessionId] = {
        ...current,
        archived,
      };
    }

    await persist(nextState);
  };

  const removeSessions = async (sessionIds: string[]): Promise<void> => {
    const state = await load();
    const nextState: SessionMetadataState = {
      ...state,
      sessions: { ...state.sessions },
    };

    for (const sessionId of sessionIds) {
      delete nextState.sessions[sessionId];
    }

    await persist(nextState);
  };

  const setSelection = async (sessionId: string, selection: SessionSelection): Promise<void> => {
    const state = await load();
    const nextState: SessionMetadataState = {
      ...state,
      sessions: { ...state.sessions },
    };

    const current = nextState.sessions[sessionId] ?? {};
    nextState.sessions[sessionId] = {
      ...current,
      ...(selection.agent !== undefined
        ? { agent: normalizeString(selection.agent) || undefined }
        : {}),
      ...(selection.model !== undefined
        ? { model: normalizeString(selection.model) || undefined }
        : {}),
      ...(selection.thinkingLevel !== undefined
        ? {
            thinkingLevel:
              normalizeString(selection.thinkingLevel) || undefined,
          }
        : {}),
    };

    await persist(nextState);
  };

  const setAgent = async (sessionId: string, agent: string | undefined): Promise<void> =>
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

function normalizeString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}
