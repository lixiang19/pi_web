import fs from 'node:fs/promises';
import path from 'node:path';

const METADATA_VERSION = 2;

const createDefaultState = () => ({
  version: METADATA_VERSION,
  sessions: {},
});

export function createSessionMetadataStore(workspaceDir) {
  const metadataDir = path.join(workspaceDir, '.pi-web');
  const metadataFile = path.join(metadataDir, 'session-sidebar.json');

  let cachedState = null;
  let writeQueue = Promise.resolve();

  const load = async () => {
    if (cachedState) {
      return cachedState;
    }

    try {
      const content = await fs.readFile(metadataFile, 'utf8');
      const parsed = JSON.parse(content);
      cachedState = {
        ...createDefaultState(),
        ...parsed,
        sessions: typeof parsed?.sessions === 'object' && parsed.sessions ? parsed.sessions : {},
      };
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }

      cachedState = createDefaultState();
    }

    return cachedState;
  };

  const persist = async (state) => {
    cachedState = state;

    writeQueue = writeQueue.then(async () => {
      await fs.mkdir(metadataDir, { recursive: true });
      await fs.writeFile(metadataFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    });

    await writeQueue;
    return cachedState;
  };

  const getSessionMetadata = async (sessionId) => {
    const state = await load();
    return state.sessions[sessionId] ?? {};
  };

  const upsertSession = async (sessionInput) => {
    const state = await load();
    const nextState = {
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
      ...(sessionInput.agent !== undefined ? { agent: sessionInput.agent || undefined } : {}),
      ...(sessionInput.model !== undefined ? { model: normalizeString(sessionInput.model) || undefined } : {}),
      ...(sessionInput.thinkingLevel !== undefined
        ? { thinkingLevel: normalizeString(sessionInput.thinkingLevel) || undefined }
        : {}),
    };

    await persist(nextState);
  };

  const setArchived = async (sessionIds, archived) => {
    const state = await load();
    const nextState = {
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

  const removeSessions = async (sessionIds) => {
    const state = await load();
    const nextState = {
      ...state,
      sessions: { ...state.sessions },
    };

    for (const sessionId of sessionIds) {
      delete nextState.sessions[sessionId];
    }

    await persist(nextState);
  };

  const setSelection = async (sessionId, selection) => {
    const state = await load();
    const nextState = {
      ...state,
      sessions: { ...state.sessions },
    };

    const current = nextState.sessions[sessionId] ?? {};
    nextState.sessions[sessionId] = {
      ...current,
      ...(selection.agent !== undefined ? { agent: normalizeString(selection.agent) || undefined } : {}),
      ...(selection.model !== undefined ? { model: normalizeString(selection.model) || undefined } : {}),
      ...(selection.thinkingLevel !== undefined
        ? { thinkingLevel: normalizeString(selection.thinkingLevel) || undefined }
        : {}),
    };

    await persist(nextState);
  };

  const setAgent = async (sessionId, agent) => setSelection(sessionId, { agent });

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

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}