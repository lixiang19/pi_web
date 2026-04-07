import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import cors from 'cors';
import {
  AuthStorage,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSession,
} from '@mariozechner/pi-coding-agent';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');
const defaultWorkspaceDir = process.env.PI_WORKSPACE_DIR
  ? path.resolve(process.env.PI_WORKSPACE_DIR)
  : rootDir;
const port = Number.parseInt(process.env.PORT || '3000', 10);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);
const sessions = new Map();

const createSessionSchema = z.object({
  cwd: z.string().optional(),
  title: z.string().optional(),
  model: z.string().optional(),
});

const messageSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
});

const normalizeString = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

const normalizeContent = (content) => {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content.map((item) => {
    if (!item || typeof item !== 'object') {
      return { type: 'unknown' };
    }

    if (item.type === 'text') {
      return { type: 'text', text: typeof item.text === 'string' ? item.text : '' };
    }

    return { type: item.type || 'unknown', text: typeof item.text === 'string' ? item.text : '' };
  });
};

const contentToText = (content) => normalizeContent(content)
  .filter((item) => item.type === 'text')
  .map((item) => item.text || '')
  .join('');

const serializeMessage = (message, index) => {
  const role = normalizeString(message?.role) || 'system';
  const text = contentToText(message?.content);
  return {
    id: `${index}-${message?.timestamp || Date.now()}`,
    role: role === 'toolResult' ? 'tool' : role,
    text,
    createdAt: typeof message?.timestamp === 'number' ? message.timestamp : Date.now(),
  };
};

const getAvailableModels = () => {
  modelRegistry.refresh();
  return [...modelRegistry.getAvailable()];
};

const findModel = (modelSpec) => {
  const normalized = normalizeString(modelSpec);
  if (!normalized) {
    return null;
  }

  return getAvailableModels().find((model) => `${model.provider}/${model.id}` === normalized) || null;
};

const listProviders = () => {
  const grouped = new Map();

  for (const model of getAvailableModels()) {
    if (!grouped.has(model.provider)) {
      grouped.set(model.provider, {
        id: model.provider,
        name: model.provider
          .split(/[-_/]+/)
          .filter(Boolean)
          .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
          .join(' '),
        models: {},
      });
    }

    grouped.get(model.provider).models[model.id] = {
      id: model.id,
      name: model.name || model.id,
      reasoning: model.reasoning === true,
    };
  }

  const firstAvailable = getAvailableModels()[0];

  return {
    providers: [...grouped.values()],
    default: {
      chat: firstAvailable ? `${firstAvailable.provider}/${firstAvailable.id}` : undefined,
    },
  };
};

const emit = (record, payload) => {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of record.clients) {
    client.write(data);
  }
};

const updateStatus = (record, nextStatus) => {
  record.status = nextStatus;
  record.updatedAt = Date.now();
  emit(record, { type: 'status', status: nextStatus });
};

const toSessionSnapshot = (record) => ({
  id: record.id,
  title: record.title,
  cwd: record.cwd,
  status: record.status,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  messages: record.session.messages.map(serializeMessage),
});

const attachSession = (record) => {
  record.unsubscribe = record.session.subscribe((event) => {
    record.updatedAt = Date.now();

    if (event.type === 'agent_start' || event.type === 'message_start' || event.type === 'message_update') {
      updateStatus(record, 'streaming');
    }

    if (event.type === 'message_end' || event.type === 'agent_end' || event.type === 'turn_end') {
      updateStatus(record, 'idle');
    }

    if (event.type === 'message_end' && normalizeString(event?.message?.role) === 'assistant') {
      record.updatedAt = Date.now();
    }

    emit(record, {
      type: event.type,
      message: event.message
        ? {
            role: event.message.role,
            content: normalizeContent(event.message.content),
          }
        : undefined,
      assistantMessageEvent: event.assistantMessageEvent
        ? {
            type: event.assistantMessageEvent.type,
            delta: typeof event.assistantMessageEvent.delta === 'string' ? event.assistantMessageEvent.delta : null,
          }
        : undefined,
    });
  });
};

const createSessionRecord = async ({ cwd, title, model }) => {
  const sessionManager = SessionManager.create(cwd);
  const settingsManager = SettingsManager.create(cwd);
  const { session } = await createAgentSession({
    cwd,
    authStorage,
    modelRegistry,
    sessionManager,
    settingsManager,
  });

  const chosenModel = findModel(model);
  if (chosenModel) {
    await session.setModel(chosenModel);
  }

  const record = {
    id: session.sessionId,
    title: normalizeString(title) || session.sessionName || 'New Pi Session',
    cwd,
    status: 'idle',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    session,
    unsubscribe: null,
    clients: new Set(),
  };

  attachSession(record);
  sessions.set(record.id, record);
  return record;
};

const getSessionRecord = (sessionId) => {
  const record = sessions.get(sessionId);
  if (!record) {
    const error = new Error('Session not found');
    error.statusCode = 404;
    throw error;
  }
  return record;
};

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/system/info', (_req, res) => {
  res.json({
    appName: 'Pi Web',
    workspaceDir: defaultWorkspaceDir,
    apiBase: `http://127.0.0.1:${port}`,
    sdkVersion: '0.65.2',
  });
});

app.get('/api/providers', (_req, res) => {
  res.json(listProviders());
});

app.get('/api/sessions', (_req, res) => {
  const summaries = [...sessions.values()]
    .map((record) => ({
      id: record.id,
      title: record.title,
      cwd: record.cwd,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }))
    .sort((left, right) => right.updatedAt - left.updatedAt);

  res.json(summaries);
});

app.get('/api/sessions/:sessionId', (req, res, next) => {
  try {
    const record = getSessionRecord(req.params.sessionId);
    res.json(toSessionSnapshot(record));
  } catch (error) {
    next(error);
  }
});

app.get('/api/sessions/:sessionId/stream', (req, res, next) => {
  try {
    const record = getSessionRecord(req.params.sessionId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    record.clients.add(res);
    emit(record, { type: 'snapshot', session: toSessionSnapshot(record) });

    req.on('close', () => {
      record.clients.delete(res);
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/sessions', async (req, res, next) => {
  try {
    const payload = createSessionSchema.parse(req.body ?? {});
    const record = await createSessionRecord({
      cwd: normalizeString(payload.cwd) || defaultWorkspaceDir,
      title: payload.title,
      model: payload.model,
    });
    res.status(201).json(toSessionSnapshot(record));
  } catch (error) {
    next(error);
  }
});

app.post('/api/sessions/:sessionId/messages', async (req, res, next) => {
  try {
    const payload = messageSchema.parse(req.body ?? {});
    const record = getSessionRecord(req.params.sessionId);

    if (record.session.messages.length === 0) {
      record.title = payload.prompt.slice(0, 24).trim() || record.title;
    }

    const chosenModel = findModel(payload.model);
    if (chosenModel) {
      await record.session.setModel(chosenModel);
    }

    updateStatus(record, 'streaming');

    void record.session.prompt(payload.prompt, { source: 'interactive' }).catch((error) => {
      record.status = 'error';
      emit(record, {
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/sessions/:sessionId/abort', async (req, res, next) => {
  try {
    const record = getSessionRecord(req.params.sessionId);
    await record.session.abort();
    updateStatus(record, 'idle');
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : 'Unknown server error';
  res.status(statusCode).send(message);
});

app.listen(port, () => {
  console.log(`Pi server listening on http://127.0.0.1:${port}`);
});