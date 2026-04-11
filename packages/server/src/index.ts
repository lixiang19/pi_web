import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { ServerResponse } from 'node:http';

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import {
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSession,
} from '@mariozechner/pi-coding-agent';
import { z } from 'zod';
import type { AgentSession, SessionEvent, ModelInfo } from '@mariozechner/pi-coding-agent';

import { createProjectContextResolver } from './project-context.js';
import {
  deleteAgent,
  discoverAgents,
  getAgentByName,
  getAgentConfigSignature,
  THINKING_LEVELS,
  normalizeThinkingLevel,
  saveAgent,
  type AgentConfigInternal,
} from './agents.js';
import {
  compileAgentPermission,
  createPermissionGateExtension,
} from './agent-permissions.js';
import { createSessionMetadataStore } from './session-metadata.js';
import {
  getSettings,
  setSettings,
  getFavorites,
  addFavorite,
  removeFavorite,
  getProjects,
  addProject,
  removeProject,
} from './storage/index.js';
import type {
  SessionRecord,
  SessionSummary,
  SessionSnapshot,
  FileTreeEntry,
  FilesystemBrowseResult,
  AgentSummary,
  ProviderInfo,
  ProvidersResponse,
  ResourceCatalogResponse,
  ThinkingLevel,
  HttpError,
  Project,
  AgentPermission,
} from './types/index.js';

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
const activeSessions = new Map<string, SessionRecord>();
const projectContextResolver = createProjectContextResolver(defaultWorkspaceDir);
const sessionMetadataStore = createSessionMetadataStore(defaultWorkspaceDir);

// ===== Zod Schemas =====
const createSessionSchema = z.object({
  cwd: z.string().optional(),
  title: z.string().optional(),
  model: z.string().optional(),
  thinkingLevel: z.enum(THINKING_LEVELS).nullable().optional(),
  parentSessionId: z.string().optional(),
  agent: z.string().nullable().optional(),
});

const messageSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  thinkingLevel: z.enum(THINKING_LEVELS).optional(),
  agent: z.string().nullable().optional(),
});

const updateSessionSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    model: z.string().nullable().optional(),
    thinkingLevel: z.enum(THINKING_LEVELS).nullable().optional(),
    agent: z.string().nullable().optional(),
  })
  .refine(
    (payload) =>
      payload.title !== undefined ||
      payload.model !== undefined ||
      payload.thinkingLevel !== undefined ||
      payload.agent !== undefined,
    {
      message: '至少要更新 title、model、thinkingLevel 或 agent 之一',
    },
  );

const resourceCatalogQuerySchema = z.object({
  cwd: z.string().optional(),
  sessionId: z.string().optional(),
});

const sessionSnapshotQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(400).optional(),
});

const agentUpsertSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    display_name: z.string().nullable().optional(),
    mode: z.enum(['primary', 'task', 'all']).optional(),
    model: z.string().nullable().optional(),
    thinking: z
      .enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'])
      .nullable()
      .optional(),
    steps: z.number().int().min(1).nullable().optional(),
    enabled: z.boolean().optional(),
    permission: z.record(z.string(), z.any()).optional(),
    prompt: z.string().optional(),
    scope: z.enum(['user', 'project']).optional(),
  })
  .strict();

const agentScopeQuerySchema = z.object({
  scope: z.enum(['user', 'project']).optional(),
  cwd: z.string().optional(),
});

const archiveSessionSchema = z.object({
  archived: z.boolean(),
});

const fileTreeQuerySchema = z.object({
  root: z.string().optional(),
  path: z.string().optional(),
});

const filesystemBrowseQuerySchema = z.object({
  path: z.string().optional(),
});

const createProjectSchema = z.object({
  path: z.string().min(1),
});

// ===== Constants =====
const ignoredDirectoryNames = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'target',
  '.next',
  '.turbo',
  'coverage',
  '.pi-web',
]);

const DEFAULT_SESSION_MESSAGE_LIMIT = 80;
const MAX_SESSION_MESSAGE_LIMIT = 400;

// ===== Utility Functions =====
const normalizeString = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const normalizeFsPath = (value: unknown): string =>
  path.resolve(normalizeString(value) || defaultWorkspaceDir);

const ensureWithinRoot = (candidatePath: string, rootPath: string): string => {
  const relative = path.relative(rootPath, candidatePath);
  if (relative === '') {
    return candidatePath;
  }

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    const error = new Error(
      'Requested path is outside the allowed workspace root',
    ) as HttpError;
    error.statusCode = 400;
    throw error;
  }

  return candidatePath;
};

const toPosixPath = (value: string): string => value.split(path.sep).join('/');

const getFallbackTitle = (firstMessage: unknown): string =>
  normalizeString(firstMessage).slice(0, 48) || '新会话';

const closeClients = (record: SessionRecord): void => {
  for (const client of record.clients) {
    try {
      client.end();
    } catch {
      // noop
    }
  }
  record.clients.clear();
};

const listDirectoryEntries = async (
  directoryPath: string,
  rootPath: string,
): Promise<FileTreeEntry[]> => {
  const dirents = await fs.readdir(directoryPath, { withFileTypes: true });
  const entries = dirents
    .filter(
      (entry) => entry.name !== '.' && !ignoredDirectoryNames.has(entry.name),
    )
    .map((entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      return {
        name: entry.name,
        path: toPosixPath(entryPath),
        kind: entry.isDirectory() ? ('directory' as const) : ('file' as const),
        relativePath: toPosixPath(path.relative(rootPath, entryPath)) || '.',
      };
    })
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'directory' ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

  return entries;
};

const serializeProject = (project: Project): Project => ({
  ...project,
  path: toPosixPath(path.resolve(project.path)),
});

const isPathInAllowedRoots = (candidatePath: string, allowedRoots: string[]): boolean =>
  allowedRoots.some((rootPath) => {
    const relative = path.relative(rootPath, candidatePath);
    return (
      relative === '' ||
      (!relative.startsWith('..') && !path.isAbsolute(relative))
    );
  });

interface ContentBlock {
  type: 'text' | 'thinking' | 'toolCall' | 'toolResult' | 'unknown';
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
}

const normalizeContent = (content: unknown): ContentBlock[] => {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content.map((item): ContentBlock => {
    if (!item || typeof item !== 'object') {
      return { type: 'unknown', text: '' };
    }
    const typedItem = item as Record<string, unknown>;
    if (typedItem.type === 'text') {
      return {
        type: 'text',
        text: typeof typedItem.text === 'string' ? typedItem.text : '',
      };
    }

    return {
      type: 'unknown',
      text: typeof typedItem.text === 'string' ? typedItem.text : '',
    };
  });
};

const extractContentBlocks = (content: unknown): ContentBlock[] => {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content.map((item) => {
    if (!item || typeof item !== 'object') {
      return { type: 'text', text: '' };
    }
    const typedItem = item as Record<string, unknown>;
    switch (typedItem.type) {
      case 'text':
        return {
          type: 'text',
          text: typeof typedItem.text === 'string' ? typedItem.text : '',
        };
      case 'thinking':
        return {
          type: 'thinking',
          thinking: typeof typedItem.thinking === 'string' ? typedItem.thinking : '',
        };
      case 'toolCall':
        return {
          type: 'toolCall',
          id: typeof typedItem.id === 'string' ? typedItem.id : '',
          name: typeof typedItem.name === 'string' ? typedItem.name : 'unknown',
          arguments:
            typeof typedItem.arguments === 'object' && typedItem.arguments
              ? (typedItem.arguments as Record<string, unknown>)
              : {},
        };
      case 'toolResult':
        return {
          type: 'toolResult',
          id: typeof typedItem.id === 'string' ? typedItem.id : '',
          name: typeof typedItem.name === 'string' ? typedItem.name : 'unknown',
          result: typedItem.result,
        };
      default:
        return { type: 'text', text: typeof typedItem.text === 'string' ? typedItem.text : '' };
    }
  });
};

interface SerializedMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  text: string;
  contentBlocks: ContentBlock[];
  createdAt: number;
}

const serializeMessage = (message: { role?: string; content?: unknown; timestamp?: number }, index: number): SerializedMessage => {
  const role = normalizeString(message?.role) || 'system';
  const contentBlocks = extractContentBlocks(message?.content);
  const text = contentBlocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return {
    id: `${index}-${message?.timestamp || Date.now()}`,
    role: role === 'toolResult' ? 'tool' : (role as 'system' | 'user' | 'assistant' | 'tool'),
    text,
    contentBlocks,
    createdAt:
      typeof message?.timestamp === 'number' ? message.timestamp : Date.now(),
  };
};

const getAvailableModels = (): ModelInfo[] => {
  modelRegistry.refresh();
  return [...modelRegistry.getAvailable()];
};

const findModel = (modelSpec: string | undefined | null): ModelInfo | null => {
  const normalized = normalizeString(modelSpec);
  if (!normalized) {
    return null;
  }

  return (
    getAvailableModels().find(
      (model) => `${model.provider}/${model.id}` === normalized,
    ) || null
  );
};

const formatModelSpec = (model: ModelInfo | null | undefined): string | undefined => {
  if (!model?.provider || !model?.id) {
    return undefined;
  }
  return `${model.provider}/${model.id}`;
};

interface SourceInfoOut {
  path: string;
  source: string;
  scope: string;
  origin?: string;
  baseDir?: string;
}

const toSourceInfo = (sourceInfo: unknown): SourceInfoOut | undefined => {
  if (!sourceInfo || typeof sourceInfo !== 'object') {
    return undefined;
  }
  const typed = sourceInfo as Record<string, unknown>;
  const result: SourceInfoOut = {
    path: toPosixPath(path.resolve(String(typed.path))),
    source: String(typed.source),
    scope: String(typed.scope),
  };
  if (typed.origin) {
    result.origin = String(typed.origin);
  }
  if (typed.baseDir) {
    result.baseDir = toPosixPath(path.resolve(String(typed.baseDir)));
  }
  return result;
};

const listProviders = (): ProvidersResponse => {
  const grouped = new Map<string, ProviderInfo>();

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

    grouped.get(model.provider)!.models[model.id] = {
      id: model.id,
      name: model.name || model.id,
      reasoning: model.reasoning === true,
    };
  }

  const firstAvailable = getAvailableModels()[0];

  return {
    providers: [...grouped.values()],
    default: {
      chat: firstAvailable
        ? `${firstAvailable.provider}/${firstAvailable.id}`
        : undefined,
    },
  };
};

const createAgentSummary = (agent: AgentConfigInternal): AgentSummary => ({
  name: agent.name,
  description: agent.description,
  displayName: agent.displayName,
  mode: agent.mode,
  model: agent.model,
  thinking: agent.thinking,
  steps: agent.steps,
  sourceScope: agent.sourceScope,
  source: toPosixPath(path.resolve(agent.source)),
});

const createSessionResourceLoader = (record: SessionRecord) =>
  new DefaultResourceLoader({
    cwd: record.cwd,
    settingsManager: record.settingsManager,
    appendSystemPromptOverride: (base: string[]) => {
      const sections = [...base];
      const systemPrompt = normalizeString(
        record.selectedAgentConfig?.systemPrompt,
      );
      if (systemPrompt) {
        sections.push(systemPrompt);
      }
      return sections;
    },
    extensionFactories: [
      createPermissionGateExtension(() => record.selectedPermissionPolicy),
    ],
  });

const isPrimarySessionAgent = (agent: AgentConfigInternal | null | undefined): boolean =>
  Boolean(agent && agent.mode !== 'task');

const ensurePrimaryAgentOrThrow = (agentName: string | null | undefined, agent: AgentConfigInternal | null | undefined): AgentConfigInternal | null => {
  if (!agentName) {
    return null;
  }

  if (!agent) {
    const error = new Error(`Agent 不存在: ${agentName}`) as HttpError;
    error.statusCode = 404;
    throw error;
  }

  if (!isPrimarySessionAgent(agent)) {
    const error = new Error(`Agent ${agentName} 仅允许 task 模式调用`) as HttpError;
    error.statusCode = 400;
    throw error;
  }

  return agent;
};

interface SessionSelectionInput {
  agentName?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel | null;
}

const applySessionAgentSelection = async (
  record: SessionRecord,
  selection: SessionSelectionInput,
): Promise<void> => {
  const selectedAgentName = normalizeString(selection.agentName) || '';
  const agents = await discoverAgents(record.cwd);
  const agent = selectedAgentName
    ? ensurePrimaryAgentOrThrow(
        selectedAgentName,
        agents.find((item) => item.name === selectedAgentName),
      )
    : null;

  const nextSignature = getAgentConfigSignature(agent);
  const shouldReload = nextSignature !== record.selectedAgentSignature;

  record.selectedAgentName = agent?.name || undefined;
  record.selectedAgentConfig = agent || null;
  record.selectedAgentSignature = nextSignature;
  record.selectedPermissionPolicy = compileAgentPermission(
    record.cwd,
    agent?.permission as AgentPermission | undefined,
    record.defaultToolNames,
  );
  if (shouldReload || record.turnBudget.maxTurns !== agent?.steps) {
    record.turnBudget = {
      maxTurns: agent?.steps,
      usedTurns: 0,
      exhausted: false,
    };
  }

  if (shouldReload) {
    await record.resourceLoader.reload();
    await record.session.reload();
  }

  await record.session.setActiveToolsByName(
    record.selectedPermissionPolicy.activeToolNames,
  );

  const nextExplicitModel =
    selection.model !== undefined
      ? normalizeString(selection.model) || undefined
      : record.explicitModelSpec;
  if (
    selection.model !== undefined &&
    nextExplicitModel &&
    !findModel(nextExplicitModel)
  ) {
    const error = new Error(`模型不存在: ${nextExplicitModel}`) as HttpError;
    error.statusCode = 400;
    throw error;
  }
  record.explicitModelSpec = nextExplicitModel;

  const chosenModel =
    findModel(record.explicitModelSpec) ||
    findModel(agent?.model) ||
    record.session.model ||
    null;
  if (chosenModel) {
    await record.session.setModel(chosenModel);
  }
  record.resolvedModelSpec = formatModelSpec(
    record.session.model || chosenModel,
  );

  const nextExplicitThinking =
    selection.thinkingLevel !== undefined
      ? normalizeThinkingLevel(selection.thinkingLevel)
      : record.explicitThinkingLevel;
  if (
    selection.thinkingLevel !== undefined &&
    selection.thinkingLevel !== null &&
    !nextExplicitThinking
  ) {
    const error = new Error(`thinkingLevel 非法: ${selection.thinkingLevel}`) as HttpError;
    error.statusCode = 400;
    throw error;
  }
  record.explicitThinkingLevel = nextExplicitThinking;

  const thinking =
    record.explicitThinkingLevel ||
    normalizeThinkingLevel(agent?.thinking) ||
    normalizeThinkingLevel(record.session.thinkingLevel);
  if (thinking) {
    await record.session.setThinkingLevel(thinking);
  }
  record.resolvedThinkingLevel =
    normalizeThinkingLevel(record.session.thinkingLevel) || thinking;

  await sessionMetadataStore.setSelection(record.id, {
    agent: record.selectedAgentName,
    model: record.explicitModelSpec,
    thinkingLevel: record.explicitThinkingLevel,
  });
};

const restoreSessionSelection = async (record: SessionRecord): Promise<void> => {
  const metadata = await sessionMetadataStore.getSessionMetadata(record.id);
  const selectedAgentName = normalizeString(metadata.agent);
  const explicitModelSpec = normalizeString(metadata.model) || undefined;
  const explicitThinkingLevel = normalizeThinkingLevel(metadata.thinkingLevel);

  record.explicitModelSpec = explicitModelSpec;
  record.explicitThinkingLevel = explicitThinkingLevel;

  try {
    await applySessionAgentSelection(record, {
      agentName: selectedAgentName,
      model: explicitModelSpec,
      thinkingLevel: explicitThinkingLevel,
    });
  } catch {
    record.explicitModelSpec = undefined;
    record.explicitThinkingLevel = undefined;
    await sessionMetadataStore.setSelection(record.id, {
      agent: undefined,
      model: undefined,
      thinkingLevel: undefined,
    });
  }
};

const emit = (record: SessionRecord, payload: unknown): void => {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of record.clients) {
    client.write(data);
  }
};

const updateStatus = (record: SessionRecord, nextStatus: SessionRecord['status']): void => {
  record.status = nextStatus;
  record.updatedAt = Date.now();
  emit(record, { type: 'status', status: nextStatus });
};

const attachSession = (record: SessionRecord): void => {
  record.unsubscribe = record.session.subscribe((event: SessionEvent) => {
    record.updatedAt = Date.now();

    if (event.type === 'turn_start' && record.turnBudget.maxTurns) {
      if (record.turnBudget.usedTurns >= record.turnBudget.maxTurns) {
        record.turnBudget.exhausted = true;
        void record.session.abort();
      }
    }

    if (
      event.type === 'agent_start' ||
      event.type === 'message_start' ||
      event.type === 'message_update'
    ) {
      updateStatus(record, 'streaming');
    }

    if (
      event.type === 'message_end' ||
      event.type === 'agent_end' ||
      event.type === 'turn_end'
    ) {
      updateStatus(record, 'idle');
    }

    if (event.type === 'turn_end' && record.turnBudget.maxTurns) {
      record.turnBudget.usedTurns += 1;
      if (record.turnBudget.usedTurns >= record.turnBudget.maxTurns) {
        record.turnBudget.exhausted = true;
      }
    }

    if (
      event.type === 'message_end' &&
      normalizeString(event?.message?.role) === 'assistant'
    ) {
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
            delta:
              typeof event.assistantMessageEvent.delta === 'string'
                ? event.assistantMessageEvent.delta
                : null,
          }
        : undefined,
    });
  });
};

interface CreateActiveSessionRecordParams {
  stateRef?: Partial<SessionRecord>;
  session: AgentSession;
  settingsManager: SettingsManager;
  resourceLoader: DefaultResourceLoader;
  createdAt: number;
  updatedAt: number;
}

const createActiveSessionRecord = ({
  stateRef,
  session,
  settingsManager,
  resourceLoader,
  createdAt,
  updatedAt,
}: CreateActiveSessionRecordParams): SessionRecord => {
  const record: SessionRecord = Object.assign(stateRef || {}, {
    id: session.sessionId,
    sessionFile: session.sessionFile,
    parentSessionPath: undefined as string | undefined,
    cwd: session.sessionManager.getCwd(),
    status: 'idle' as const,
    createdAt,
    updatedAt,
    session,
    settingsManager,
    resourceLoader,
    unsubscribe: null as (() => void) | null,
    clients: new Set<ServerResponse>(),
    defaultToolNames: [...session.getActiveToolNames()],
    selectedAgentName: undefined as string | undefined,
    selectedAgentConfig: null as AgentConfigInternal | null,
    selectedAgentSignature: '',
    explicitModelSpec: undefined as string | undefined,
    explicitThinkingLevel: undefined as ThinkingLevel | undefined,
    resolvedModelSpec: formatModelSpec(session.model),
    resolvedThinkingLevel: normalizeThinkingLevel(session.thinkingLevel),
    selectedPermissionPolicy: null as ReturnType<typeof compileAgentPermission> | null,
    turnBudget: {
      maxTurns: undefined as number | undefined,
      usedTurns: 0,
      exhausted: false,
    },
  }) as SessionRecord;

  attachSession(record);
  activeSessions.set(record.id, record);
  return record;
};

interface CreateSessionRecordParams {
  cwd: string;
  title?: string;
  model?: string;
  parentSessionPath?: string;
}

const createSessionRecord = async ({
  cwd,
  title,
  model,
  parentSessionPath,
}: CreateSessionRecordParams): Promise<SessionRecord> => {
  const sessionManager = SessionManager.create(cwd);
  if (parentSessionPath) {
    sessionManager.newSession({ parentSession: parentSessionPath });
  }

  const settingsManager = SettingsManager.create(cwd);
  const recordState: Partial<SessionRecord> = {
    cwd,
    settingsManager,
    selectedAgentConfig: null,
    selectedPermissionPolicy: null,
  };
  const resourceLoader = createSessionResourceLoader(recordState as SessionRecord);
  await resourceLoader.reload();
  const { session } = await createAgentSession({
    cwd,
    authStorage,
    modelRegistry,
    sessionManager,
    settingsManager,
    resourceLoader,
  });

  const chosenModel = findModel(model || '');
  if (chosenModel) {
    await session.setModel(chosenModel);
  }

  if (normalizeString(title)) {
    session.setSessionName(normalizeString(title));
  }

  const now = Date.now();
  const record = createActiveSessionRecord({
    stateRef: recordState,
    session,
    settingsManager,
    resourceLoader,
    createdAt: now,
    updatedAt: now,
  });
  record.parentSessionPath = parentSessionPath;
  await persistSessionRecordMetadata(record);

  return record;
};

const destroySessionRecord = (record: SessionRecord): void => {
  record.unsubscribe?.();
  closeClients(record);
  activeSessions.delete(record.id);
};

const persistSessionFileIfNeeded = async (record: SessionRecord): Promise<void> => {
  if (
    !record.sessionFile ||
    record.session.messages.some((message) => message.role === 'assistant')
  ) {
    return;
  }

  const sessionManager = record.session.sessionManager;
  if (typeof (sessionManager as { _rewriteFile?(): void })._rewriteFile !== 'function') {
    return;
  }

  await fs.mkdir(path.dirname(record.sessionFile), { recursive: true });
  (sessionManager as { _rewriteFile(): void })._rewriteFile();
  sessionManager.flushed = true;
};

const persistSessionRecordMetadata = async (record: SessionRecord): Promise<void> => {
  await persistSessionFileIfNeeded(record);
  await sessionMetadataStore.upsertSession({
    id: record.id,
    title: normalizeString(record.session.sessionName) || '新会话',
    cwd: normalizeFsPath(record.cwd || defaultWorkspaceDir),
    sessionFile: path.resolve(record.sessionFile),
    parentSessionPath: record.parentSessionPath,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    agent: record.selectedAgentName,
    model: record.explicitModelSpec,
    thinkingLevel: record.explicitThinkingLevel,
  });
};

interface SessionRegistryItem {
  info: {
    id: string;
    name: string;
    cwd: string;
    path: string;
    created: Date;
    modified: Date;
    firstMessage?: unknown;
    parentSessionPath?: string;
  };
  cwd: string;
  projectContext: Awaited<ReturnType<ReturnType<typeof createProjectContextResolver>['resolveContext']>>;
  metadata: {
    archived: boolean;
    agent?: string;
    model?: string;
    thinkingLevel?: ThinkingLevel;
  };
  parentSessionId?: string;
}

interface SessionRegistry {
  infosById: Map<string, SessionRegistryItem>;
  childrenById: Map<string, string[]>;
  items: SessionRegistryItem[];
}

const listWorkspaceSessions = async (): Promise<SessionRegistry> => {
  const [workspaceScope, allSessions, metadataState] = await Promise.all([
    projectContextResolver.resolveWorkspaceScope(),
    SessionManager.listAll(),
    sessionMetadataStore.load(),
  ]);

  const enriched: SessionRegistryItem[] = [];
  for (const info of allSessions) {
    const cwd = normalizeFsPath(info.cwd || defaultWorkspaceDir);
    const projectContext = await projectContextResolver.resolveContext(cwd);

    if (
      !isPathInAllowedRoots(cwd, workspaceScope.allowedRoots) &&
      projectContext.projectId !== workspaceScope.workspaceProjectId
    ) {
      continue;
    }

    enriched.push({
      info: {
        id: info.id,
        name: info.name,
        cwd,
        path: info.path,
        created: info.created,
        modified: info.modified,
        firstMessage: info.firstMessage,
        parentSessionPath: info.parentSessionPath,
      },
      cwd,
      projectContext,
      metadata: {
        archived: metadataState.sessions[info.id]?.archived === true,
        agent:
          normalizeString(metadataState.sessions[info.id]?.agent) || undefined,
        model:
          normalizeString(metadataState.sessions[info.id]?.model) || undefined,
        thinkingLevel: normalizeThinkingLevel(
          metadataState.sessions[info.id]?.thinkingLevel,
        ),
      },
    });
  }

  const knownSessionIds = new Set(enriched.map((item) => item.info.id));

  for (const [sessionId, metadata] of Object.entries(metadataState.sessions)) {
    if (
      knownSessionIds.has(sessionId) ||
      !normalizeString(metadata.sessionFile)
    ) {
      continue;
    }

    const sessionFile = path.resolve(metadata.sessionFile);

    try {
      await fs.stat(sessionFile);
    } catch {
      continue;
    }

    const cwd = normalizeFsPath(metadata.cwd || defaultWorkspaceDir);
    const projectContext = await projectContextResolver.resolveContext(cwd);

    if (
      !isPathInAllowedRoots(cwd, workspaceScope.allowedRoots) &&
      projectContext.projectId !== workspaceScope.workspaceProjectId
    ) {
      continue;
    }

    const createdAt = Number.isFinite(metadata.createdAt)
      ? metadata.createdAt
      : Date.now();
    const updatedAt = Number.isFinite(metadata.updatedAt)
      ? metadata.updatedAt
      : createdAt;

    enriched.push({
      info: {
        id: sessionId,
        name: metadata.title || '',
        cwd,
        path: sessionFile,
        created: new Date(createdAt),
        modified: new Date(updatedAt),
        firstMessage: undefined,
        parentSessionPath: metadata.parentSessionPath,
      },
      cwd,
      projectContext,
      metadata: {
        archived: metadata.archived === true,
        agent: normalizeString(metadata.agent) || undefined,
        model: normalizeString(metadata.model) || undefined,
        thinkingLevel: normalizeThinkingLevel(metadata.thinkingLevel),
      },
    });
    knownSessionIds.add(sessionId);
  }

  for (const record of activeSessions.values()) {
    if (knownSessionIds.has(record.id)) {
      continue;
    }

    const cwd = normalizeFsPath(record.cwd || defaultWorkspaceDir);
    const projectContext = await projectContextResolver.resolveContext(cwd);

    if (
      !isPathInAllowedRoots(cwd, workspaceScope.allowedRoots) &&
      projectContext.projectId !== workspaceScope.workspaceProjectId
    ) {
      continue;
    }

    enriched.push({
      info: {
        id: record.id,
        name: record.session.sessionName || '',
        cwd,
        path: record.sessionFile,
        created: new Date(record.createdAt),
        modified: new Date(record.updatedAt),
        firstMessage: record.session.messages[0]?.content,
        parentSessionPath: record.parentSessionPath,
      },
      cwd,
      projectContext,
      metadata: {
        archived: metadataState.sessions[record.id]?.archived === true,
        agent:
          record.selectedAgentName ||
          normalizeString(metadataState.sessions[record.id]?.agent) ||
          undefined,
        model:
          record.explicitModelSpec ||
          normalizeString(metadataState.sessions[record.id]?.model) ||
          undefined,
        thinkingLevel:
          record.explicitThinkingLevel ||
          normalizeThinkingLevel(
            metadataState.sessions[record.id]?.thinkingLevel,
          ),
      },
    });
    knownSessionIds.add(record.id);
  }

  const infosById = new Map(enriched.map((item) => [item.info.id, item]));
  const idByPath = new Map(
    enriched.map((item) => [path.resolve(item.info.path), item.info.id]),
  );
  const childrenById = new Map<string, string[]>();

  for (const item of enriched) {
    const parentId = item.info.parentSessionPath
      ? idByPath.get(path.resolve(item.info.parentSessionPath))
      : undefined;

    item.parentSessionId = parentId;

    if (parentId) {
      const current = childrenById.get(parentId) ?? [];
      current.push(item.info.id);
      childrenById.set(parentId, current);
    }
  }

  return {
    infosById,
    childrenById,
    items: enriched,
  };
};

const toSessionSummary = (item: SessionRegistryItem): SessionSummary => {
  const activeRecord = activeSessions.get(item.info.id);
  const title =
    normalizeString(activeRecord?.session.sessionName) ||
    normalizeString(item.info.name) ||
    getFallbackTitle(item.info.firstMessage);

  return {
    id: item.info.id,
    title,
    cwd: item.cwd,
    status: activeRecord?.status || 'idle',
    createdAt: item.info.created.getTime(),
    updatedAt: Math.max(
      item.info.modified.getTime(),
      activeRecord?.updatedAt || 0,
    ),
    archived: item.metadata.archived,
    agent: activeRecord?.selectedAgentName || item.metadata.agent,
    model: activeRecord?.explicitModelSpec || item.metadata.model,
    thinkingLevel:
      activeRecord?.explicitThinkingLevel || item.metadata.thinkingLevel,
    resolvedModel: activeRecord?.resolvedModelSpec || item.metadata.model,
    resolvedThinkingLevel:
      activeRecord?.resolvedThinkingLevel || item.metadata.thinkingLevel,
    sessionFile: toPosixPath(path.resolve(item.info.path)),
    parentSessionId: item.parentSessionId,
    projectId: item.projectContext.projectId,
    projectRoot: toPosixPath(item.projectContext.projectRoot),
    projectLabel: item.projectContext.projectLabel,
    branch: item.projectContext.branch,
    worktreeRoot: toPosixPath(item.projectContext.worktreeRoot),
    worktreeLabel: item.projectContext.worktreeLabel,
  };
};

interface ToSessionSnapshotOptions {
  limit?: number;
}

const toSessionSnapshot = async (
  record: SessionRecord,
  sessionRegistry: SessionRegistry | null,
  options: ToSessionSnapshotOptions = {},
): Promise<SessionSnapshot> => {
  const registry = sessionRegistry ?? (await listWorkspaceSessions());
  const item = registry.infosById.get(record.id);
  const summary = item
    ? toSessionSummary(item)
    : {
        id: record.id,
        title: normalizeString(record.session.sessionName) || '新会话',
        cwd: record.cwd,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        archived: false,
        agent: record.selectedAgentName,
        model: record.explicitModelSpec,
        thinkingLevel: record.explicitThinkingLevel,
        resolvedModel: record.resolvedModelSpec,
        resolvedThinkingLevel: record.resolvedThinkingLevel,
        sessionFile: toPosixPath(record.sessionFile || ''),
        parentSessionId: undefined as string | undefined,
        projectId: record.cwd,
        projectRoot: toPosixPath(record.cwd),
        projectLabel: path.basename(record.cwd) || record.cwd,
        branch: undefined as string | undefined,
        worktreeRoot: toPosixPath(record.cwd),
        worktreeLabel: path.basename(record.cwd) || record.cwd,
      };

  const allMessages = record.session.messages;
  const totalCount = allMessages.length;
  const requestedLimit = Number.isInteger(options.limit)
    ? Math.max(1, Math.min(options.limit!, MAX_SESSION_MESSAGE_LIMIT))
    : DEFAULT_SESSION_MESSAGE_LIMIT;
  const effectiveLimit =
    totalCount > 0 ? Math.min(totalCount, requestedLimit) : requestedLimit;
  const startIndex = Math.max(0, totalCount - effectiveLimit);
  const visibleMessages = allMessages.slice(startIndex);

  return {
    ...summary,
    messages: visibleMessages.map((message, index) =>
      serializeMessage(message, startIndex + index),
    ),
    historyMeta: {
      loadedCount: visibleMessages.length,
      totalCount,
      hasMoreAbove: startIndex > 0,
      limit: effectiveLimit,
    },
  };
};

const buildResourceCatalog = (
  session: AgentSession,
  resourceLoader: DefaultResourceLoader,
): ResourceCatalogResponse => {
  const { prompts, diagnostics: promptDiagnostics } =
    resourceLoader.getPrompts();
  const { skills, diagnostics: skillDiagnostics } = resourceLoader.getSkills();
  const commands = session.extensionRunner?.getRegisteredCommands() ?? [];

  return {
    prompts: prompts.map((prompt) => ({
      name: prompt.name,
      description: prompt.description,
      content: prompt.content,
      sourceInfo: toSourceInfo(prompt.sourceInfo),
    })),
    skills: skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      invocation: `/skill:${skill.name}`,
      disableModelInvocation: skill.disableModelInvocation,
      sourceInfo: toSourceInfo(skill.sourceInfo),
    })),
    commands: commands.map((command) => ({
      name: command.invocationName || command.name,
      description: command.description,
      source: 'extension',
      sourceInfo: toSourceInfo(command.sourceInfo),
    })),
    diagnostics: {
      prompts: promptDiagnostics.map((diagnostic) => diagnostic.message),
      skills: skillDiagnostics.map((diagnostic) => diagnostic.message),
      commands: [],
    },
  };
};

const createTransientCatalogSession = async (cwd: string) => {
  const settingsManager = SettingsManager.create(cwd);
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    settingsManager,
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd,
    authStorage,
    modelRegistry,
    settingsManager,
    resourceLoader,
    sessionManager: SessionManager.inMemory(cwd),
  });

  return {
    session,
    resourceLoader,
  };
};

const getSessionInfoOrThrow = async (
  sessionId: string,
  sessionRegistry?: SessionRegistry | null,
): Promise<SessionRegistryItem> => {
  const registry = sessionRegistry ?? (await listWorkspaceSessions());
  const item = registry.infosById.get(sessionId);
  if (!item) {
    const error = new Error('Session not found') as HttpError;
    error.statusCode = 404;
    throw error;
  }

  return item;
};

const ensureSessionRecord = async (
  sessionId: string,
  sessionRegistry?: SessionRegistry | null,
): Promise<SessionRecord> => {
  const existing = activeSessions.get(sessionId);
  if (existing) {
    return existing;
  }

  const item = await getSessionInfoOrThrow(sessionId, sessionRegistry);
  const sessionManager = SessionManager.open(item.info.path);
  const settingsManager = SettingsManager.create(item.cwd);
  const recordState: Partial<SessionRecord> = {
    cwd: item.cwd,
    settingsManager,
    selectedAgentConfig: null,
    selectedPermissionPolicy: null,
  };
  const resourceLoader = createSessionResourceLoader(recordState as SessionRecord);
  await resourceLoader.reload();
  const { session } = await createAgentSession({
    cwd: item.cwd,
    authStorage,
    modelRegistry,
    sessionManager,
    settingsManager,
    resourceLoader,
  });

  const record = createActiveSessionRecord({
    stateRef: recordState,
    session,
    settingsManager,
    resourceLoader,
    createdAt: item.info.created.getTime(),
    updatedAt: item.info.modified.getTime(),
  });
  await restoreSessionSelection(record);
  return record;
};

const collectDescendantIds = (sessionId: string, childrenById: Map<string, string[]>): string[] => {
  const collected = new Set([sessionId]);
  const queue = [sessionId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = childrenById.get(current) ?? [];
    for (const childId of children) {
      if (collected.has(childId)) {
        continue;
      }

      collected.add(childId);
      queue.push(childId);
    }
  }

  return [...collected];
};

// ===== Routes =====

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get('/api/system/info', (_req: Request, res: Response) => {
  res.json({
    appName: 'Pi Web',
    workspaceDir: defaultWorkspaceDir,
    apiBase: `http://127.0.0.1:${port}`,
    sdkVersion: '0.65.2',
  });
});

app.get('/api/providers', (_req: Request, res: Response) => {
  res.json(listProviders());
});

app.get('/api/agents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cwd = normalizeString(req.query?.cwd) || defaultWorkspaceDir;
    const agents = await discoverAgents(cwd);
    res.json(
      agents.filter((agent) => agent.mode !== 'task').map(createAgentSummary),
    );
  } catch (error) {
    next(error);
  }
});

app.get('/api/resources', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = resourceCatalogQuerySchema.parse(req.query ?? {});

    if (query.sessionId) {
      const record = await ensureSessionRecord(query.sessionId);
      res.json(buildResourceCatalog(record.session, record.resourceLoader));
      return;
    }

    const cwd = normalizeString(query.cwd) || defaultWorkspaceDir;
    const transient = await createTransientCatalogSession(cwd);

    try {
      res.json(
        buildResourceCatalog(transient.session, transient.resourceLoader),
      );
    } finally {
      transient.session.dispose();
    }
  } catch (error) {
    next(error);
  }
});

app.get('/api/config/agents/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = agentScopeQuerySchema.parse(req.query ?? {});
    const cwd = normalizeString(query.cwd) || defaultWorkspaceDir;
    const agentName = String(req.params.name);
    const agent = await getAgentByName(cwd, agentName, query.scope);
    if (!agent) {
      const error = new Error(`Agent 不存在: ${agentName}`) as HttpError;
      error.statusCode = 404;
      throw error;
    }

    res.json({
      name: agent.name,
      description: agent.description,
      display_name: agent.displayName,
      mode: agent.mode,
      model: agent.model ?? null,
      thinking: agent.thinking ?? null,
      steps: agent.steps ?? null,
      enabled: agent.enabled !== false,
      permission: agent.permission,
      prompt: agent.systemPrompt,
      scope: agent.sourceScope,
      source: toPosixPath(path.resolve(agent.source)),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/config/agents/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = agentUpsertSchema.parse(req.body ?? {});
    const cwd = normalizeString(req.query?.cwd) || defaultWorkspaceDir;
    const agentName = String(req.params.name);
    const agent = await saveAgent(cwd, agentName, payload, {
      allowCreate: true,
      requireScope: true,
    });

    res.status(201).json({
      name: agent.name,
      description: agent.description,
      display_name: agent.displayName,
      mode: agent.mode,
      model: agent.model ?? null,
      thinking: agent.thinking ?? null,
      steps: agent.steps ?? null,
      enabled: agent.enabled !== false,
      permission: agent.permission,
      prompt: agent.systemPrompt,
      scope: agent.sourceScope,
      source: toPosixPath(path.resolve(agent.source)),
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/config/agents/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = agentUpsertSchema.parse(req.body ?? {});
    const cwd = normalizeString(req.query?.cwd) || defaultWorkspaceDir;
    const agentName = String(req.params.name);
    const agent = await saveAgent(cwd, agentName, payload, {
      allowCreate: false,
      requireScope: false,
    });

    res.json({
      name: agent.name,
      description: agent.description,
      display_name: agent.displayName,
      mode: agent.mode,
      model: agent.model ?? null,
      thinking: agent.thinking ?? null,
      steps: agent.steps ?? null,
      enabled: agent.enabled !== false,
      permission: agent.permission,
      prompt: agent.systemPrompt,
      scope: agent.sourceScope,
      source: toPosixPath(path.resolve(agent.source)),
    });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/config/agents/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = agentScopeQuerySchema.parse(req.query ?? {});
    if (!query.scope) {
      const error = new Error('删除 agent 时必须显式指定 scope') as HttpError;
      error.statusCode = 400;
      throw error;
    }

    const cwd = normalizeString(query.cwd) || defaultWorkspaceDir;
    const agentName = String(req.params.name);
    const filePath = await deleteAgent(cwd, agentName, query.scope);
    res.json({ ok: true, filePath: toPosixPath(path.resolve(filePath)) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/files/tree', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = fileTreeQuerySchema.parse(req.query ?? {});
    const rootPath = normalizeFsPath(query.root || defaultWorkspaceDir);
    const targetPath = normalizeFsPath(query.path || rootPath);
    const workspaceScope = await projectContextResolver.resolveWorkspaceScope();

    if (!isPathInAllowedRoots(rootPath, workspaceScope.allowedRoots)) {
      const error = new Error(
        'Requested root is outside the allowed workspace scope',
      ) as HttpError;
      error.statusCode = 400;
      throw error;
    }

    ensureWithinRoot(targetPath, rootPath);

    const stats = await fs.stat(targetPath);
    if (!stats.isDirectory()) {
      const error = new Error('Requested path is not a directory') as HttpError;
      error.statusCode = 400;
      throw error;
    }

    const entries = await listDirectoryEntries(targetPath, rootPath);

    res.json({
      root: toPosixPath(rootPath),
      directory: toPosixPath(targetPath),
      entries,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/filesystem/browse', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = filesystemBrowseQuerySchema.parse(req.query ?? {});
    const homeDir = path.resolve(os.homedir());
    const targetPath = normalizeFsPath(query.path || homeDir);

    ensureWithinRoot(targetPath, homeDir);

    const stats = await fs.stat(targetPath);
    if (!stats.isDirectory()) {
      const error = new Error('Requested path is not a directory') as HttpError;
      error.statusCode = 400;
      throw error;
    }

    const entries = (await listDirectoryEntries(targetPath, homeDir)).filter(
      (entry) => entry.kind === 'directory',
    );

    res.json({
      homeDir: toPosixPath(homeDir),
      path: toPosixPath(targetPath),
      parent:
        targetPath === homeDir
          ? null
          : toPosixPath(path.dirname(targetPath)),
      entries,
    } as FilesystemBrowseResult);
  } catch (error) {
    next(error);
  }
});

app.get('/api/projects', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const state = await getProjects();
    res.json({
      projects: state.projects
        .map(serializeProject)
        .sort((left, right) => (right.addedAt as number) - (left.addedAt as number)),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/projects', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = createProjectSchema.parse(req.body ?? {});
    const homeDir = path.resolve(os.homedir());
    const projectPath = normalizeFsPath(payload.path);

    ensureWithinRoot(projectPath, homeDir);

    const stats = await fs.stat(projectPath);
    if (!stats.isDirectory()) {
      const error = new Error('Project path must be a directory') as HttpError;
      error.statusCode = 400;
      throw error;
    }

    const project = await addProject(projectPath);
    res.json(serializeProject(project));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/projects/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.id);
    await removeProject(projectId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/sessions', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionRegistry = await listWorkspaceSessions();
    const summaries = sessionRegistry.items
      .map((item) => toSessionSummary(item))
      .sort((left, right) => {
        if (left.archived !== right.archived) {
          return left.archived ? 1 : -1;
        }
        return right.updatedAt - left.updatedAt;
      });

    res.json(summaries);
  } catch (error) {
    next(error);
  }
});

app.get('/api/sessions/:sessionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = sessionSnapshotQuerySchema.parse(req.query ?? {});
    const sessionRegistry = await listWorkspaceSessions();
    const record = await ensureSessionRecord(
      String(req.params.sessionId),
      sessionRegistry,
    );
    res.json(await toSessionSnapshot(record, sessionRegistry, query));
  } catch (error) {
    next(error);
  }
});

app.get('/api/sessions/:sessionId/stream', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = sessionSnapshotQuerySchema.parse(req.query ?? {});
    const sessionRegistry = await listWorkspaceSessions();
    const record = await ensureSessionRecord(
      String(req.params.sessionId),
      sessionRegistry,
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    record.clients.add(res);
    emit(record, {
      type: 'snapshot',
      session: await toSessionSnapshot(record, sessionRegistry, query),
    });

    req.on('close', () => {
      record.clients.delete(res);
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = createSessionSchema.parse(req.body ?? {});
    const parentSession = payload.parentSessionId
      ? await getSessionInfoOrThrow(payload.parentSessionId)
      : null;
    const record = await createSessionRecord({
      cwd:
        normalizeString(payload.cwd) ||
        parentSession?.cwd ||
        defaultWorkspaceDir,
      title: payload.title,
      model: payload.model,
      parentSessionPath: parentSession?.info.path,
    });
    await applySessionAgentSelection(record, {
      agentName: payload.agent || undefined,
      model: payload.model,
      thinkingLevel: payload.thinkingLevel,
    });
    await persistSessionRecordMetadata(record);
    const sessionRegistry = await listWorkspaceSessions();
    res.status(201).json(await toSessionSnapshot(record, sessionRegistry, {}));
  } catch (error) {
    next(error);
  }
});

app.patch('/api/sessions/:sessionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = updateSessionSchema.parse(req.body ?? {});
    const sessionRegistry = await listWorkspaceSessions();
    const record = await ensureSessionRecord(
      String(req.params.sessionId),
      sessionRegistry,
    );

    if (payload.title !== undefined) {
      record.session.setSessionName(payload.title.trim());
    }

    if (
      payload.agent !== undefined ||
      payload.model !== undefined ||
      payload.thinkingLevel !== undefined
    ) {
      await applySessionAgentSelection(record, {
        agentName:
          payload.agent !== undefined
            ? (payload.agent || undefined)
            : record.selectedAgentName,
        model: payload.model || undefined,
        thinkingLevel: payload.thinkingLevel,
      });
    }

    record.updatedAt = Date.now();
    await persistSessionRecordMetadata(record);

    res.json(await toSessionSnapshot(record, await listWorkspaceSessions(), {}));
  } catch (error) {
    next(error);
  }
});

app.post('/api/sessions/:sessionId/archive', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = archiveSessionSchema.parse(req.body ?? {});
    const sessionRegistry = await listWorkspaceSessions();
    const sessionIds = collectDescendantIds(
      String(req.params.sessionId),
      sessionRegistry.childrenById,
    );

    await sessionMetadataStore.setArchived(sessionIds, payload.archived);

    res.json({ ok: true, sessionIds });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/sessions/:sessionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionRegistry = await listWorkspaceSessions();
    const sessionIds = collectDescendantIds(
      String(req.params.sessionId),
      sessionRegistry.childrenById,
    );

    for (const sessionId of sessionIds) {
      const item = sessionRegistry.infosById.get(sessionId);
      if (!item) {
        continue;
      }

      const activeRecord = activeSessions.get(sessionId);
      if (activeRecord) {
        destroySessionRecord(activeRecord);
      }

      await fs.rm(item.info.path, { force: true });
    }

    await sessionMetadataStore.removeSessions(sessionIds);

    res.json({ ok: true, sessionIds });
  } catch (error) {
    next(error);
  }
});

app.post('/api/sessions/:sessionId/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = messageSchema.parse(req.body ?? {});
    const sessionRegistry = await listWorkspaceSessions();
    const record = await ensureSessionRecord(
      String(req.params.sessionId),
      sessionRegistry,
    );

    if (record.turnBudget.exhausted) {
      const error = new Error(
        '当前 agent 的 steps 已耗尽，请重新选择 agent 或新建会话',
      ) as HttpError;
      error.statusCode = 400;
      throw error;
    }

    await applySessionAgentSelection(record, {
      agentName:
        payload.agent !== undefined ? (payload.agent || undefined) : record.selectedAgentName,
      model: payload.model || undefined,
      thinkingLevel: payload.thinkingLevel,
    });
    await persistSessionRecordMetadata(record);

    updateStatus(record, 'streaming');

    void record.session
      .prompt(payload.prompt, { source: 'interactive' })
      .catch((error: unknown) => {
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

app.post('/api/sessions/:sessionId/abort', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const record = await ensureSessionRecord(String(req.params.sessionId));
    await record.session.abort();
    updateStatus(record, 'idle');
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/storage/settings', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

app.post('/api/storage/settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await setSettings(req.body ?? {});
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

app.get('/api/storage/favorites', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const favorites = await getFavorites();
    res.json(favorites);
  } catch (error) {
    next(error);
  }
});

app.post('/api/storage/favorites', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, name, type, data } = req.body ?? {};
    if (!id || !name || !type) {
      const error = new Error('Missing required fields: id, name, type') as HttpError;
      error.statusCode = 400;
      throw error;
    }
    const favorites = await addFavorite({ id, name, type, data });
    res.json(favorites);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/storage/favorites/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const favoriteId = String(req.params.id);
    const favorites = await removeFavorite(favoriteId);
    res.json(favorites);
  } catch (error) {
    next(error);
  }
});

// ===== Error Handler =====
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = Number.isInteger((error as HttpError)?.statusCode)
    ? (error as HttpError).statusCode
    : 500;
  const message =
    error instanceof Error ? error.message : 'Unknown server error';
  res.status(statusCode as number).send(message);
});

// ===== Start Server =====
app.listen(port, () => {
  console.log(`Pi server listening on http://127.0.0.1:${port}`);
});
