import path from 'node:path';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import os from 'node:os';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

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
import type {
  AgentSession,
  AgentSessionEvent,
} from '@mariozechner/pi-coding-agent';
import type { Api, Model } from '@mariozechner/pi-ai';
import type { AgentMessage } from '@mariozechner/pi-agent-core';

import {
  createPiAgentScopeSettingsManager,
  getPiAgentScopeAgentDir,
} from './pi-resource-scope.js';
import { createProjectContextResolver } from './project-context.js';
import { createGitService } from './git-service.js';
import { createWorktreeService } from './worktree-service.js';
import { createNotesRouter } from './notes.js';
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
import {
  buildResolvedAskResult,
  createAskExtension,
} from './ask-extension.js';
import { createSubagentToolExtension } from './subagents.js';
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
import { initializeRidgeDb } from './db/index.js';
import { toPosixPath } from './utils/paths.js';
import { normalizeString } from './utils/strings.js';
import { atomicWriteFile } from './utils/fs.js';
import {
  createWorkspaceChatProject,
  ensureWorkspaceChatProject,
  getWorkspaceChatConfig,
  getWorkspaceChatTemplateDir,
  resolveDefaultWorkspaceDir,
} from './workspace-chat.js';
import {
  getIndexedSessionLookup,
  getIndexedSessionContext,
  getIndexedSessionTree,
  invalidateManagedProjectScopes,
  listIndexedSessionContexts,
  listIndexedSessions,
  refreshSessionCatalog,
  upsertIndexedSessionRecord,
} from './session-indexer.js';
import { createTerminalManager } from './terminal-runtime.js';
import type {
  SessionMessagesPayload,
  SessionRecord,
  SessionRuntimePayload,
  SessionSummary,
  SessionSnapshot,
  FilePreviewPayload,
  FilePreviewWindowPayload,
  FileSaveResponse,
  FileTreeEntry,
  FilesystemBrowseResult,
  AgentSummary,
  ProviderInfo,
  ProvidersResponse,
  ResourceCatalogResponse,
  ResourceSourceInfo,
  ThinkingLevel,
  HttpError,
  Project,
  AgentPermission,
  AskInteractiveRequest,
  AskQuestionAnswer,
  LogicalPermissionKey,
  PendingPermissionRecord,
  PermissionDecisionAction,
  PermissionInteractiveRequest,
  PermissionRule,
  TerminalCreateRequest,
} from './types/index.js';
import type {
  IndexedSessionContextSummary,
  IndexedSessionLookup,
} from './session-indexer.js';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');
const defaultWorkspaceDir = resolveDefaultWorkspaceDir({
  explicitWorkspaceDir: process.env.PI_WORKSPACE_DIR,
  platform: process.platform,
  homeDir: os.homedir(),
});
const port = Number.parseInt(process.env.PORT || '3000', 10);
const workspaceChatConfig = getWorkspaceChatConfig(defaultWorkspaceDir);
const workspaceChatTemplateDir = getWorkspaceChatTemplateDir(rootDir);

const app = express();
app.use(cors());
app.use(express.json({ limit: '6mb' }));

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);
const activeSessions = new Map<string, SessionRecord>();
const openingSessionRecords = new Map<string, Promise<SessionRecord>>();
const projectContextResolver = createProjectContextResolver(defaultWorkspaceDir);
const sessionMetadataStore = createSessionMetadataStore();
const gitService = createGitService();
const worktreeService = createWorktreeService(gitService);
const refreshSessionCatalogIndex = async () =>
  refreshSessionCatalog({
    projectContextResolver,
    activeSessions,
    workspaceChatConfig,
  });

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
  rounds: z.coerce.number().int().positive().optional(),
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
    max_turns: z.number().int().min(1).nullable().optional(),
    skills: z.union([z.string(), z.array(z.string())]).nullable().optional(),
    inherit_context: z.boolean().nullable().optional(),
    run_in_background: z.boolean().nullable().optional(),
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

const terminalCreateSchema = z.object({
  cwd: z.string().optional(),
  title: z.string().optional(),
  cols: z.number().int().min(40).max(300).optional(),
  rows: z.number().int().min(12).max(120).optional(),
});

const terminalUpdateSchema = z.object({
  title: z.string().min(1).max(120),
});

const terminalRestartSchema = z.object({
  cwd: z.string().min(1),
  cols: z.number().int().min(40).max(300).optional(),
  rows: z.number().int().min(12).max(120).optional(),
});


const askAnswerSchema = z.object({
  questionId: z.string().min(1),
  values: z.array(z.string().min(1)).min(1),
});

const askActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('submit'),
    answers: z.array(askAnswerSchema).min(1),
  }),
  z.object({
    action: z.literal('dismiss'),
  }),
]);

const permissionActionSchema = z.object({
  action: z.enum(['once', 'always', 'reject']),
});

const fileTreeQuerySchema = z.object({
  root: z.string().optional(),
  path: z.string().optional(),
});

const fileContentQuerySchema = z.object({
  root: z.string().optional(),
  path: z.string().optional(),
});

const fileContentWindowQuerySchema = z.object({
  root: z.string().optional(),
  path: z.string().optional(),
  startLine: z.coerce.number().int().min(1).default(1),
  lineCount: z.coerce.number().int().min(1).max(1000).default(1000),
});

const fileSaveSchema = z.object({
  root: z.string().min(1),
  path: z.string().min(1),
  content: z.string().max(5 * 1024 * 1024),
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

const DEFAULT_SESSION_ROUND_WINDOW = 3;
const MAX_FILE_PREVIEW_BYTES = 5 * 1024 * 1024;
const LARGE_FILE_PREVIEW_LINE_COUNT = 1000;
const UTF8_SNIFF_BYTES = 64 * 1024;

const markdownExtensions = new Set(['.md', '.markdown']);
const htmlExtensions = new Set(['.htm', '.html']);
const codeExtensions = new Set([
  '.astro',
  '.bash',
  '.c',
  '.cc',
  '.cpp',
  '.css',
  '.cts',
  '.cxx',
  '.go',
  '.h',
  '.hpp',
  '.ini',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.kt',
  '.less',
  '.lua',
  '.mjs',
  '.mts',
  '.php',
  '.py',
  '.rb',
  '.rs',
  '.scss',
  '.sh',
  '.sql',
  '.swift',
  '.toml',
  '.ts',
  '.tsx',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
  '.zsh',
]);
const codeFileNames = new Set([
  'dockerfile',
]);
const imageMimeTypesByExtension = new Map<string, string>([
  ['.avif', 'image/avif'],
  ['.bmp', 'image/bmp'],
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);

// ===== Utility Functions =====

const normalizeFsPath = (value: unknown): string =>
  path.resolve(normalizeString(value) || defaultWorkspaceDir);
const normalizeOptionalFsPath = (value: unknown): string => {
  const normalized = normalizeString(value);
  return normalized ? path.resolve(normalized) : '';
};

const resolveExistingRealPath = async (candidatePath: string): Promise<string> => {
  try {
    return normalizeFsPath(await fs.realpath(candidatePath));
  } catch {
    return normalizeFsPath(candidatePath);
  }
};

const resolveDiscoveryCwd = (value: unknown): string =>
  normalizeOptionalFsPath(value) || path.resolve(os.homedir());

const resolveManagedRoot = async (value: unknown): Promise<string> => {
  const rootPath = normalizeOptionalFsPath(value);
  if (!rootPath) {
    const error = new Error('File root is required') as HttpError;
    error.statusCode = 400;
    throw error;
  }

  const [resolvedRootPath, resolvedDefaultWorkspaceDir] = await Promise.all([
    resolveExistingRealPath(rootPath),
    resolveExistingRealPath(defaultWorkspaceDir),
  ]);

  if (!isPathInsideRoot(resolvedRootPath, resolvedDefaultWorkspaceDir)) {
    await ensureManagedProjectScope(resolvedRootPath);
  }

  return rootPath;
};

const ensureResolvedPathWithinRoot = async (
  candidatePath: string,
  rootPath: string,
): Promise<void> => {
  const [resolvedRootPath, resolvedCandidatePath] = await Promise.all([
    fs.realpath(rootPath),
    fs.realpath(candidatePath),
  ]);

  ensureWithinRoot(resolvedCandidatePath, resolvedRootPath);
};

const resolveManagedFileLocation = async (
  options: { root?: unknown; path?: unknown; fallbackToRoot?: boolean },
): Promise<{ rootPath: string; targetPath: string }> => {
  const rootPath = await resolveManagedRoot(options.root);
  const requestedPath = normalizeOptionalFsPath(options.path);

  if (!requestedPath && !options.fallbackToRoot) {
    const error = new Error('File path is required') as HttpError;
    error.statusCode = 400;
    throw error;
  }

  const targetPath = requestedPath || rootPath;
  ensureWithinRoot(targetPath, rootPath);
  await ensureResolvedPathWithinRoot(targetPath, rootPath);

  return {
    rootPath,
    targetPath,
  };
};

const ensureFileForPreview = async (
  options: { root?: unknown; path?: unknown },
): Promise<{ rootPath: string; targetPath: string; stats: Awaited<ReturnType<typeof fs.stat>> }> => {
  const { rootPath, targetPath } = await resolveManagedFileLocation(options);
  const stats = await fs.stat(targetPath);

  if (!stats.isFile()) {
    const error = new Error('Requested path is not a file') as HttpError;
    error.statusCode = 400;
    throw error;
  }

  return {
    rootPath,
    targetPath,
    stats,
  };
};

const toFileSize = (value: number | bigint): number => Number(value);

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

const isPathInsideRoot = (candidatePath: string, rootPath: string): boolean => {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const decodeUtf8File = (buffer: Buffer): string | null => {
  if (buffer.includes(0)) {
    return null;
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
};

const readUtf8Head = async (
  targetPath: string,
  maxBytes = UTF8_SNIFF_BYTES,
): Promise<string | null> => {
  const handle = await fs.open(targetPath, 'r');

  try {
    const stats = await handle.stat();
    const bufferSize = Math.max(1, Math.min(toFileSize(stats.size), maxBytes));
    const buffer = Buffer.allocUnsafe(bufferSize);
    const { bytesRead } = await handle.read(buffer, 0, bufferSize, 0);
    return decodeUtf8File(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
};

const readTextWindow = async (
  targetPath: string,
  startLine: number,
  lineCount: number,
): Promise<{
  content: string;
  lineCount: number;
  hasMore: boolean;
  nextStartLine?: number;
}> => {
  const lines: string[] = [];
  const stream = createReadStream(targetPath, { encoding: 'utf8' });
  const reader = createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let currentLine = 0;
  let hasMore = false;

  try {
    for await (const line of reader) {
      currentLine += 1;

      if (currentLine < startLine) {
        continue;
      }

      if (lines.length < lineCount) {
        lines.push(line);
        continue;
      }

      hasMore = true;
      reader.close();
      stream.destroy();
      break;
    }
  } finally {
    reader.close();
    stream.destroy();
  }

  const nextStartLine = hasMore ? startLine + lines.length : undefined;

  return {
    content: lines.join('\n'),
    lineCount: lines.length,
    hasMore,
    nextStartLine,
  };
};

const resolvePreviewKind = (
  fileName: string,
  extension: string,
  isTextReadable: boolean,
): FilePreviewPayload['previewKind'] => {
  if (imageMimeTypesByExtension.has(extension)) {
    return 'image';
  }

  if (!isTextReadable) {
    return 'unsupported';
  }

  if (markdownExtensions.has(extension)) {
    return 'markdown';
  }

  if (htmlExtensions.has(extension)) {
    return 'html';
  }

  if (codeExtensions.has(extension)) {
    return 'code';
  }

  const normalizedFileName = fileName.trim().toLowerCase();
  if (
    codeFileNames.has(normalizedFileName)
    || normalizedFileName.startsWith('dockerfile.')
  ) {
    return 'code';
  }

  return 'text';
};

const resolvePreviewMimeType = (
  extension: string,
  previewKind: FilePreviewPayload['previewKind'],
): string => {
  if (previewKind === 'image') {
    return imageMimeTypesByExtension.get(extension) || 'application/octet-stream';
  }

  if (previewKind === 'markdown') {
    return 'text/markdown; charset=utf-8';
  }

  if (extension === '.json') {
    return 'application/json; charset=utf-8';
  }

  if (htmlExtensions.has(extension)) {
    return 'text/html; charset=utf-8';
  }

  if (extension === '.css') {
    return 'text/css; charset=utf-8';
  }

  if (extension === '.xml') {
    return 'application/xml; charset=utf-8';
  }

  if (previewKind === 'unsupported') {
    return 'application/octet-stream';
  }

  return 'text/plain; charset=utf-8';
};

const buildFilePreviewWindowPayload = async (
  rootPath: string,
  targetPath: string,
  stats: Awaited<ReturnType<typeof fs.stat>>,
  startLine: number,
  lineCount: number,
): Promise<FilePreviewWindowPayload> => {
  const extension = path.extname(targetPath).toLowerCase();
  const name = path.basename(targetPath);
  const previewHead = await readUtf8Head(targetPath);
  const previewKind = resolvePreviewKind(name, extension, previewHead !== null);

  if (previewKind !== 'code' && previewKind !== 'text') {
    const error = new Error('Windowed preview is only available for code or text files') as HttpError;
    error.statusCode = 400;
    throw error;
  }

  if (toFileSize(stats.size) <= MAX_FILE_PREVIEW_BYTES) {
    const error = new Error('Windowed preview is only available for large files') as HttpError;
    error.statusCode = 400;
    throw error;
  }

  const windowPayload = await readTextWindow(targetPath, startLine, lineCount);

  return {
    root: toPosixPath(rootPath),
    path: toPosixPath(targetPath),
    startLine,
    lineCount: windowPayload.lineCount,
    content: windowPayload.content,
    hasMore: windowPayload.hasMore,
    nextStartLine: windowPayload.nextStartLine,
  };
};

const buildFilePreviewPayload = async (
  rootPath: string,
  targetPath: string,
  stats: Awaited<ReturnType<typeof fs.stat>>,
): Promise<FilePreviewPayload> => {
  const extension = path.extname(targetPath).toLowerCase();
  const name = path.basename(targetPath);
  const imageMimeType = imageMimeTypesByExtension.get(extension);
  const size = toFileSize(stats.size);

  if (imageMimeType) {
    return {
      root: toPosixPath(rootPath),
      path: toPosixPath(targetPath),
      name,
      extension,
      mimeType: imageMimeType,
      size,
      previewKind: 'image',
      readOnly: true,
    };
  }

  const previewHead = size > MAX_FILE_PREVIEW_BYTES ? await readUtf8Head(targetPath) : null;
  const previewKind =
    previewHead === null && size <= MAX_FILE_PREVIEW_BYTES
      ? 'unsupported'
      : resolvePreviewKind(name, extension, previewHead !== null || size <= MAX_FILE_PREVIEW_BYTES);

  if (size > MAX_FILE_PREVIEW_BYTES) {
    if (previewKind !== 'code' && previewKind !== 'text') {
      return {
        root: toPosixPath(rootPath),
        path: toPosixPath(targetPath),
        name,
        extension,
        mimeType: resolvePreviewMimeType(extension, 'unsupported'),
        size,
        previewKind: 'unsupported',
        readOnly: true,
      };
    }

    const windowPayload = await buildFilePreviewWindowPayload(
      rootPath,
      targetPath,
      stats,
      1,
      LARGE_FILE_PREVIEW_LINE_COUNT,
    );

    return {
      root: toPosixPath(rootPath),
      path: toPosixPath(targetPath),
      name,
      extension,
      mimeType: resolvePreviewMimeType(extension, previewKind),
      size,
      previewKind,
      content: windowPayload.content,
      isLargeFile: true,
      previewLineCount: windowPayload.lineCount,
      nextStartLine: windowPayload.nextStartLine,
      readOnly: true,
    };
  }

  const buffer = await fs.readFile(targetPath);
  const content = decodeUtf8File(buffer);
  const resolvedPreviewKind = resolvePreviewKind(name, extension, content !== null);

  return {
    root: toPosixPath(rootPath),
    path: toPosixPath(targetPath),
    name,
    extension,
    mimeType: resolvePreviewMimeType(extension, resolvedPreviewKind),
    size,
    previewKind: resolvedPreviewKind,
    content: content ?? undefined,
    readOnly: resolvedPreviewKind !== 'markdown',
  };
};

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

const getInteractiveRequests = (record: SessionRecord): AskInteractiveRequest[] =>
  [...record.pendingAskRecords.values()].map((pendingAsk) => ({
    id: pendingAsk.id,
    toolCallId: pendingAsk.toolCallId,
    title: pendingAsk.title,
    message: pendingAsk.message,
    questions: pendingAsk.questions,
    createdAt: pendingAsk.createdAt,
  }));


const getPermissionRequests = (
  record: SessionRecord,
): PermissionInteractiveRequest[] =>
  [...record.pendingPermissionRecords.values()].map((pendingRequest) => ({
    id: pendingRequest.id,
    toolCallId: pendingRequest.toolCallId,
    toolName: pendingRequest.toolName,
    permissionKey: pendingRequest.permissionKey,
    title: pendingRequest.title,
    message: pendingRequest.message,
    subject: pendingRequest.subject,
    suggestedPattern: pendingRequest.suggestedPattern,
    createdAt: pendingRequest.createdAt,
  }));

const appendRuntimePermissionRule = (
  record: SessionRecord,
  permissionKey: LogicalPermissionKey,
  rule: PermissionRule,
): void => {
  record.runtimePermissionRules = {
    ...record.runtimePermissionRules,
    [permissionKey]: [
      ...(record.runtimePermissionRules[permissionKey] || []),
      rule,
    ],
  };
};

const requestPendingPermission = async (
  record: SessionRecord,
  request: PermissionInteractiveRequest,
): Promise<PermissionDecisionAction> =>
  await new Promise<PermissionDecisionAction>((resolve, reject) => {
    const pendingRequest: PendingPermissionRecord = {
      ...request,
      resolve,
      reject,
    };
    record.pendingPermissionRecords.set(request.id, pendingRequest);
    void emitSessionSnapshot(record);
  });

const emitSessionSnapshot = async (
  record: SessionRecord,
): Promise<void> => {
  const messagesPayload = toSessionMessagesPayload(record, {});
  emit(record, {
    type: 'snapshot',
    sessionId: record.id,
    status: record.status,
    messages: messagesPayload.messages,
    historyMeta: messagesPayload.historyMeta,
    interactiveRequests: messagesPayload.interactiveRequests,
    permissionRequests: messagesPayload.permissionRequests,
  });
};


const normalizeAskAnswers = (
  record: SessionRecord,
  askId: string,
  answers: AskQuestionAnswer[],
): AskQuestionAnswer[] => {
  const pendingAsk = record.pendingAskRecords.get(askId);
  if (!pendingAsk) {
    const error = new Error(`Ask 不存在: ${askId}`) as HttpError;
    error.statusCode = 404;
    throw error;
  }

  const providedAnswers = new Map<string, string[]>();
  for (const answer of answers) {
    const questionId = normalizeString(answer.questionId);
    const values = [...new Set(answer.values.map((value) => normalizeString(value)).filter(Boolean))];
    if (!questionId || values.length === 0) {
      continue;
    }
    providedAnswers.set(questionId, values);
  }

  const normalizedAnswers: AskQuestionAnswer[] = [];
  for (const question of pendingAsk.questions) {
    const values = providedAnswers.get(question.id) || [];
    if (values.length === 0) {
      const error = new Error(`问题未回答: ${question.question}`) as HttpError;
      error.statusCode = 400;
      throw error;
    }

    if (!question.multiple && values.length > 1) {
      const error = new Error(`问题不允许多选: ${question.question}`) as HttpError;
      error.statusCode = 400;
      throw error;
    }

    const optionLabels = new Set((question.options || []).map((option) => option.label));
    const normalizedValues = values.filter((value) => {
      if (optionLabels.size === 0) {
        return true;
      }
      if (optionLabels.has(value)) {
        return true;
      }
      return question.allowCustom === true;
    });

    if (normalizedValues.length === 0) {
      const error = new Error(`问题答案非法: ${question.question}`) as HttpError;
      error.statusCode = 400;
      throw error;
    }

    normalizedAnswers.push({
      questionId: question.id,
      values: normalizedValues,
    });
  }

  return normalizedAnswers;
};

const settlePendingAsk = async (
  record: SessionRecord,
  askId: string,
  answers: AskQuestionAnswer[],
  dismissed: boolean,
): Promise<void> => {
  const pendingAsk = record.pendingAskRecords.get(askId);
  if (!pendingAsk) {
    const error = new Error(`Ask 不存在: ${askId}`) as HttpError;
    error.statusCode = 404;
    throw error;
  }

  record.pendingAskRecords.delete(askId);
  await emitSessionSnapshot(record);
  pendingAsk.resolve(buildResolvedAskResult(pendingAsk, answers, dismissed));
};

const cancelPendingAsks = (record: SessionRecord, reason: string): void => {
  const pendingAsks = [...record.pendingAskRecords.values()];
  record.pendingAskRecords.clear();
  for (const pendingAsk of pendingAsks) {
    pendingAsk.reject(new Error(reason));
  }
};


const settlePendingPermission = async (
  record: SessionRecord,
  requestId: string,
  action: PermissionDecisionAction,
): Promise<void> => {
  const pendingRequest = record.pendingPermissionRecords.get(requestId);
  if (!pendingRequest) {
    const error = new Error(`Permission request 不存在: ${requestId}`) as HttpError;
    error.statusCode = 404;
    throw error;
  }

  if (action === 'always' && !pendingRequest.suggestedPattern) {
    const error = new Error(`Permission request 缺少 suggestedPattern: ${requestId}`) as HttpError;
    error.statusCode = 400;
    throw error;
  }

  record.pendingPermissionRecords.delete(requestId);

  await emitSessionSnapshot(record);
  pendingRequest.resolve(action);
};

const cancelPendingPermissions = (record: SessionRecord, reason: string): void => {
  const pendingRequests = [...record.pendingPermissionRecords.values()];
  record.pendingPermissionRecords.clear();
  for (const pendingRequest of pendingRequests) {
    pendingRequest.reject(new Error(reason));
  }
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

type RawMessageContent = string | Array<Record<string, unknown>>;

const passthroughContent = (content: unknown): RawMessageContent => {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content.map((item) =>
    item && typeof item === 'object' ? (item as Record<string, unknown>) : {},
  );
};

const serializeMessage = (message: {
  role?: string;
  content?: unknown;
  timestamp?: number;
  toolCallId?: unknown;
  toolName?: unknown;
  details?: unknown;
  isError?: unknown;
} | undefined): SessionMessagesPayload['messages'][number] => ({
  role:
    (normalizeString(message?.role) || 'system') as SessionMessagesPayload['messages'][number]['role'],
  content: passthroughContent(message?.content),
  timestamp:
    typeof message?.timestamp === 'number' ? message.timestamp : undefined,
  toolCallId: normalizeString(message?.toolCallId) || undefined,
  toolName: normalizeString(message?.toolName) || undefined,
  details: message?.details,
  isError: message?.isError === true ? true : undefined,
}) as SessionMessagesPayload['messages'][number];

const getAvailableModels = (): Model<Api>[] => {
  modelRegistry.refresh();
  return [...modelRegistry.getAvailable()];
};

const findModel = (modelSpec: string | undefined | null): Model<Api> | null => {
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

const formatModelSpec = (model: Model<Api> | null | undefined): string | undefined => {
  if (!model?.provider || !model?.id) {
    return undefined;
  }
  return `${model.provider}/${model.id}`;
};


interface SourceInfoOut {
  path: string;
  source: string;
  scope: ResourceSourceInfo['scope'];
  origin: ResourceSourceInfo['origin'];
  baseDir?: string;
}

const toSourceInfo = (sourceInfo: unknown): SourceInfoOut | undefined => {
  if (!sourceInfo || typeof sourceInfo !== 'object') {
    return undefined;
  }
  const typed = sourceInfo as Record<string, unknown>;
  const scope = normalizeString(typed.scope);
  if (scope !== 'user' && scope !== 'project' && scope !== 'temporary') {
    return undefined;
  }
  const origin = normalizeString(typed.origin);
  if (origin !== 'package' && origin !== 'top-level') {
    return undefined;
  }
  const result: SourceInfoOut = {
    path: toPosixPath(path.resolve(String(typed.path))),
    source: String(typed.source),
    scope,
    origin,
  };
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

const serializeAgentSource = (agent: AgentConfigInternal): string =>
  agent.sourceScope === 'default'
    ? agent.source
    : toPosixPath(path.resolve(agent.source));
const createAgentSummary = (agent: AgentConfigInternal): AgentSummary => ({
  name: agent.name,
  description: agent.description,
  displayName: agent.displayName,
  mode: agent.mode,
  model: agent.model,
  thinking: agent.thinking,
  maxTurns: agent.maxTurns,
  skills: agent.skills,
  inheritContext: agent.inheritContext,
  runInBackground: agent.runInBackground,
  enabled: agent.enabled !== false,
  permission: agent.permission as Record<string, unknown> | undefined,
  sourceScope: agent.sourceScope,
  source: serializeAgentSource(agent),
});

const createAgentConfigResponse = (agent: AgentConfigInternal) => ({
  name: agent.name,
  description: agent.description,
  display_name: agent.displayName,
  mode: agent.mode,
  model: agent.model ?? null,
  thinking: agent.thinking ?? null,
  max_turns: agent.maxTurns ?? null,
  skills: agent.skills ?? null,
  inherit_context: agent.inheritContext ?? null,
  run_in_background: agent.runInBackground ?? null,
  enabled: agent.enabled !== false,
  permission: agent.permission,
  prompt: agent.systemPrompt,
  scope: agent.sourceScope,
  source: serializeAgentSource(agent),
});

const createSessionResourceLoader = (record: SessionRecord) =>
  new DefaultResourceLoader({
    cwd: record.cwd,
    agentDir: getPiAgentScopeAgentDir(),
    settingsManager: createPiAgentScopeSettingsManager(record.cwd),
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
      createPermissionGateExtension(() => record.selectedPermissionPolicy, {
        getRuntimeRules: () => record.runtimePermissionRules,
        onGrantAlways: (permissionKey, pattern) => {
          appendRuntimePermissionRule(record, permissionKey, {
            pattern,
            action: 'allow',
          });
        },
        requestPermission: async (request) => {
          updateStatus(record, 'streaming');
          return await requestPendingPermission(record, request);
        },
      }),
      createAskExtension(record, {
        onPendingAskChange: async (sessionRecord) => {
          updateStatus(sessionRecord, 'streaming');
          await emitSessionSnapshot(sessionRecord);
        },
      }),
      createSubagentToolExtension(record, { authStorage, modelRegistry, resolveModel: findModel }),
    ],
  });

const isEnabledAgent = (agent: AgentConfigInternal | null | undefined): boolean =>
  Boolean(agent && agent.enabled !== false);
const isPrimarySessionAgent = (agent: AgentConfigInternal | null | undefined): boolean =>
  Boolean(isEnabledAgent(agent) && agent!.mode !== 'task');
const ensurePrimaryAgentOrThrow = (agentName: string | null | undefined, agent: AgentConfigInternal | null | undefined): AgentConfigInternal | null => {
  if (!agentName) {
    return null;
  }
  if (!agent) {
    const error = new Error(`Agent 不存在: ${agentName}`) as HttpError;
    error.statusCode = 404;
    throw error;
  }

  if (!isEnabledAgent(agent)) {
    const error = new Error(`Agent 已禁用: ${agentName}`) as HttpError;
    error.statusCode = 400;
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
  if (shouldReload || record.turnBudget.maxTurns !== agent?.maxTurns) {
    record.turnBudget = {
      maxTurns: agent?.maxTurns,
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
  const hasPendingInteractive =
    record.pendingAskRecords.size > 0 || record.pendingPermissionRecords.size > 0;
  const resolvedStatus =
    nextStatus === 'idle' && hasPendingInteractive ? 'streaming' : nextStatus;
  record.status = resolvedStatus;
  record.updatedAt = Date.now();
  emit(record, { type: 'status', status: resolvedStatus });
};

const shouldForwardSessionEvent = (event: AgentSessionEvent): boolean => {
  if (
    (event.type === 'message_start' || event.type === 'message_end') &&
    event.message?.role === 'user'
  ) {
    return false;
  }

  return true;
};

const bindSessionRuntime = (record: SessionRecord): (() => void) =>
  record.session.subscribe((event) => {
    if (shouldForwardSessionEvent(event)) {
      emit(record, event);
    }

    if (event.type === 'message_end') {
      record.updatedAt = event.message?.timestamp ?? Date.now();
    }

    if (event.type !== 'turn_end') {
      return;
    }

    updateStatus(record, 'idle');
    void emitSessionSnapshot(record);
  });

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
    pendingAskRecords: stateRef?.pendingAskRecords || new Map(),
    pendingPermissionRecords: stateRef?.pendingPermissionRecords || new Map(),
    runtimePermissionRules: stateRef?.runtimePermissionRules || {},
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
  activeSessions.set(record.id, record);
  record.unsubscribe = bindSessionRuntime(record);
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

  const settingsManager = createPiAgentScopeSettingsManager(cwd);
  const recordState: Partial<SessionRecord> = {
    cwd,
    settingsManager,
    pendingAskRecords: new Map(),
    pendingPermissionRecords: new Map(),
    runtimePermissionRules: {},
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
  cancelPendingAsks(record, 'Session closed');
  cancelPendingPermissions(record, 'Session closed');
  record.unsubscribe?.();
  closeClients(record);
  activeSessions.delete(record.id);
  openingSessionRecords.delete(record.id);
};

const persistSessionRecordMetadata = async (record: SessionRecord): Promise<void> => {
  if (!record.sessionFile) {
    return;
  }
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

type ProjectContextInfo = Awaited<
  ReturnType<ReturnType<typeof createProjectContextResolver>['resolveContext']>
>;

interface ManagedProjectScope {
  project: Project;
  allowedRoots: string[];
  projectContext: ProjectContextInfo;
}

const buildManagedProjectScopes = async (): Promise<ManagedProjectScope[]> => {
  const state = await getProjects();
  const managedProjects = [
    createWorkspaceChatProject(workspaceChatConfig),
    ...state.projects,
  ];
  return Promise.all(
    managedProjects.map(async (project) => {
      const normalizedPath = normalizeFsPath(project.path);
      const projectContext = await projectContextResolver.resolveContext(normalizedPath);
      const declaredRoots = [
        normalizedPath,
        normalizeFsPath(projectContext.projectRoot),
      ];

      for (const worktree of projectContext.worktrees) {
        declaredRoots.push(normalizeFsPath(worktree.path));
      }

      const allowedRoots = new Set<string>();
      for (const declaredRoot of declaredRoots) {
        allowedRoots.add(declaredRoot);
        allowedRoots.add(await resolveExistingRealPath(declaredRoot));
      }

      return {
        project: {
          ...project,
          path: normalizedPath,
        },
        allowedRoots: [...allowedRoots],
        projectContext,
      };
    }),
  );
};

const resolveManagedProjectScope = (
  candidatePath: string,
  scopes: ManagedProjectScope[],
): ManagedProjectScope | null => {
  let matchedScope: ManagedProjectScope | null = null;
  let matchedRootLength = -1;

  for (const scope of scopes) {
    for (const root of scope.allowedRoots) {
      if (!isPathInsideRoot(candidatePath, root)) {
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

const ensureManagedProjectScope = async (
  candidatePath: string,
  scopes?: ManagedProjectScope[],
): Promise<ManagedProjectScope> => {
  const resolvedScopes = scopes ?? await buildManagedProjectScopes();
  const scope = resolveManagedProjectScope(candidatePath, resolvedScopes);
  if (scope) {
    return scope;
  }

  const error = new Error('Requested path is outside managed project scopes') as HttpError;
  error.statusCode = 400;
  throw error;
};

const resolveTerminalCwd = async (value: unknown): Promise<string> => {
  const candidatePath = normalizeOptionalFsPath(value) || defaultWorkspaceDir;
  const resolvedCandidatePath = await resolveExistingRealPath(candidatePath);
  const stats = await fs.stat(resolvedCandidatePath).catch(() => null);

  if (!stats?.isDirectory()) {
    const error = new Error('Terminal cwd must be an existing directory') as HttpError;
    error.statusCode = 400;
    throw error;
  }

  const resolvedDefaultWorkspaceDir = await resolveExistingRealPath(defaultWorkspaceDir);
  if (!isPathInsideRoot(resolvedCandidatePath, resolvedDefaultWorkspaceDir)) {
    await ensureManagedProjectScope(resolvedCandidatePath);
  }

  return resolvedCandidatePath;
};

const terminalManager = createTerminalManager({
  defaultCwd: defaultWorkspaceDir,
  resolveCwd: resolveTerminalCwd,
});

interface ToSessionSnapshotOptions {
  rounds?: number;
}

const getUserMessageIndexes = (messages: AgentMessage[]): number[] => {
  const indexes: number[] = [];
  for (const [index, message] of messages.entries()) {
    if (message && message.role === "user") {
      indexes.push(index);
    }
  }
  return indexes;
};

const buildSessionMessagesPayload = (
  sessionId: string,
  allMessages: AgentMessage[],
  options: ToSessionSnapshotOptions = {},
  interactiveRequests: AskInteractiveRequest[] = [],
  permissionRequests: PermissionInteractiveRequest[] = [],
): SessionMessagesPayload => {
  const userMessageIndexes = getUserMessageIndexes(allMessages);
  const totalRounds = userMessageIndexes.length;
  const requestedRounds = Number.isInteger(options.rounds)
    ? Math.max(1, options.rounds!)
    : DEFAULT_SESSION_ROUND_WINDOW;
  let visibleMessages = allMessages;
  let loadedRounds = totalRounds;
  let hasMoreAbove = false;
  if (totalRounds > 0) {
    const startRoundIndex = Math.max(0, totalRounds - requestedRounds);
    const startMessageIndex = startRoundIndex === 0 ? 0 : userMessageIndexes[startRoundIndex]!;
    visibleMessages = allMessages.slice(startMessageIndex);
    loadedRounds = totalRounds - startRoundIndex;
    hasMoreAbove = startRoundIndex > 0;
  }
  return {
    sessionId,
    messages: visibleMessages.map((message) => serializeMessage(message)),
    historyMeta: {
      loadedRounds,
      totalRounds,
      hasMoreAbove,
      roundWindow: Math.max(requestedRounds, loadedRounds || requestedRounds),
    },
    interactiveRequests,
    permissionRequests,
  };
};

const getRequestedRoundCount = (options: ToSessionSnapshotOptions = {}) =>
  Number.isInteger(options.rounds)
    ? Math.max(1, options.rounds!)
    : DEFAULT_SESSION_ROUND_WINDOW;

const parseStoredSessionMessageLine = (
  line: string,
): AgentMessage | null => {
  const trimmedLine = line.trim();
  if (!trimmedLine) {
    return null;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmedLine) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (parsed.type !== 'message') {
    return null;
  }

  const message = parsed.message;
  return message && typeof message === 'object'
    ? (message as AgentMessage)
    : null;
};

const buildSessionSummaryFromIndex = (
  record: SessionRecord,
  lookup: IndexedSessionLookup,
  context: IndexedSessionContextSummary | null,
): SessionSummary => ({
  id: record.id,
  title: normalizeString(record.session.sessionName) || lookup.title || '新会话',
  cwd: record.cwd,
  status: record.status,
  createdAt: lookup.createdAt,
  updatedAt: Math.max(lookup.updatedAt, record.updatedAt),
  archived: lookup.archived,
  agent: record.selectedAgentName,
  model: record.explicitModelSpec,
  thinkingLevel: record.explicitThinkingLevel,
  resolvedModel: record.resolvedModelSpec,
  resolvedThinkingLevel: record.resolvedThinkingLevel,
  sessionFile: toPosixPath(record.sessionFile || ''),
  parentSessionId: lookup.parentSessionId,
  contextId: lookup.contextId,
  projectId: context?.projectId || '',
  projectRoot: context?.projectRoot || '',
  projectLabel: context?.projectLabel || '',
  isGit: context?.isGit || false,
  branch: context?.branch,
  worktreeRoot: context?.worktreeRoot || '',
  worktreeLabel: context?.worktreeLabel || '',
});

const resolveSessionSummary = async (
  record: SessionRecord,
): Promise<SessionSummary> => {
  const lookup = await getIndexedSessionLookup(record.id);
  if (lookup) {
    const context = lookup.contextId
      ? await getIndexedSessionContext(lookup.contextId)
      : null;
    return buildSessionSummaryFromIndex(record, lookup, context);
  }

  const fallbackProjectScope = await ensureManagedProjectScope(record.cwd);
  const fallbackProjectContext = await projectContextResolver.resolveContext(record.cwd);
  return {
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
    parentSessionId: undefined,
    contextId: undefined,
    projectId: fallbackProjectScope.project.id,
    projectRoot: toPosixPath(path.resolve(fallbackProjectScope.project.path)),
    projectLabel: fallbackProjectScope.project.name,
    isGit: fallbackProjectContext.isGit,
    branch: fallbackProjectContext.branch,
    worktreeRoot: toPosixPath(fallbackProjectContext.worktreeRoot),
    worktreeLabel: fallbackProjectContext.worktreeLabel,
  };
};
const toSessionMessagesPayload = (
  record: SessionRecord,
  options: ToSessionSnapshotOptions = {},
): SessionMessagesPayload => {
  return buildSessionMessagesPayload(
    record.id,
    record.session.messages,
    options,
    getInteractiveRequests(record),
    getPermissionRequests(record),
  );
};

const readAllStoredSessionMessages = async (
  sessionFile: string,
): Promise<AgentMessage[]> => {
  const content = await fs.readFile(sessionFile, 'utf8');
  const messages: AgentMessage[] = [];
  for (const line of content.split(/\r?\n/)) {
    const message = parseStoredSessionMessageLine(line);
    if (message) {
      messages.push(message);
    }
  }
  return messages;
};

const readStoredSessionMessagesTail = async (
  sessionFile: string,
  requestedRounds: number,
): Promise<AgentMessage[]> => {
  const handle = await fs.open(sessionFile, 'r');
  const collectedMessages: AgentMessage[] = [];
  let position = 0;
  let remainder = Buffer.alloc(0);
  let foundUserRounds = 0;

  try {
    const stats = await handle.stat();
    position = stats.size;

    while (position > 0 && foundUserRounds < requestedRounds) {
      const chunkSize = Math.min(64 * 1024, position);
      position -= chunkSize;

      const buffer = Buffer.allocUnsafe(chunkSize);
      const { bytesRead } = await handle.read(buffer, 0, chunkSize, position);
      const combined = remainder.length
        ? Buffer.concat([buffer.subarray(0, bytesRead), remainder])
        : buffer.subarray(0, bytesRead);
      let lineEnd = combined.length;

      for (let index = combined.length - 1; index >= 0; index -= 1) {
        if (combined[index] !== 0x0a) {
          continue;
        }

        const message = parseStoredSessionMessageLine(
          combined.subarray(index + 1, lineEnd).toString('utf8').replace(/\r$/, ''),
        );
        lineEnd = index;
        if (!message) {
          continue;
        }

        collectedMessages.push(message);
        if (message.role === 'user') {
          foundUserRounds += 1;
          if (foundUserRounds >= requestedRounds) {
            return collectedMessages.reverse();
          }
        }
      }

      if (position > 0) {
        remainder = combined.subarray(0, lineEnd);
        continue;
      }

      const message = parseStoredSessionMessageLine(
        combined.subarray(0, lineEnd).toString('utf8').replace(/\r$/, ''),
      );
      if (message) {
        collectedMessages.push(message);
      }
    }

    return collectedMessages.reverse();
  } finally {
    await handle.close();
  }
};

const buildStoredSessionMessagesPayload = (
  sessionId: string,
  messages: AgentMessage[],
  totalRounds: number,
  requestedRounds: number,
): SessionMessagesPayload => {
  const loadedRounds = totalRounds > 0 ? Math.min(totalRounds, requestedRounds) : 0;

  return {
    sessionId,
    messages: messages.map((message) => serializeMessage(message)),
    historyMeta: {
      loadedRounds,
      totalRounds,
      hasMoreAbove: totalRounds > requestedRounds,
      roundWindow: Math.max(requestedRounds, loadedRounds || requestedRounds),
    },
    interactiveRequests: [],
    permissionRequests: [],
  };
};

const getIndexedSessionLookupOrThrow = async (
  sessionId: string,
): Promise<IndexedSessionLookup> => {
  const lookup = await getIndexedSessionLookup(sessionId);
  if (lookup) {
    return lookup;
  }

  const error = new Error('Session not found') as HttpError;
  error.statusCode = 404;
  throw error;
};

const getStoredSessionMessagesPayload = async (
  sessionId: string,
  options: ToSessionSnapshotOptions = {},
): Promise<SessionMessagesPayload> => {
  const lookup = await getIndexedSessionLookupOrThrow(sessionId);
  const requestedRounds = getRequestedRoundCount(options);
  const messages =
    lookup.userRoundCount > 0 && lookup.userRoundCount > requestedRounds
      ? await readStoredSessionMessagesTail(lookup.sessionFile, requestedRounds)
      : await readAllStoredSessionMessages(lookup.sessionFile);

  return buildStoredSessionMessagesPayload(
    sessionId,
    messages,
    lookup.userRoundCount,
    requestedRounds,
  );
};

const toSessionRuntimePayload = (
  record: SessionRecord,
): SessionRuntimePayload => ({
  sessionId: record.id,
  agent: record.selectedAgentName,
  model: record.explicitModelSpec || formatModelSpec(record.session.model),
  thinkingLevel:
    record.explicitThinkingLevel ||
    normalizeThinkingLevel(record.session.thinkingLevel),
  resolvedModel: record.resolvedModelSpec || formatModelSpec(record.session.model),
  resolvedThinkingLevel:
    record.resolvedThinkingLevel ||
    normalizeThinkingLevel(record.session.thinkingLevel),
});

const getStoredSessionRuntimePayload = async (
  sessionId: string,
): Promise<SessionRuntimePayload> => {
  const lookup = await getIndexedSessionLookupOrThrow(sessionId);
  const thinkingLevel =
    normalizeThinkingLevel(lookup.explicitThinkingLevel) ||
    normalizeThinkingLevel(lookup.lastThinkingLevel);
  const model = lookup.explicitModel || lookup.lastModel;

  return {
    sessionId,
    agent: lookup.agent,
    model,
    thinkingLevel,
    resolvedModel: lookup.lastModel || model,
    resolvedThinkingLevel:
      normalizeThinkingLevel(lookup.lastThinkingLevel) || thinkingLevel,
  };
};
const toSessionSnapshot = async (
  record: SessionRecord,
  options: ToSessionSnapshotOptions = {},
): Promise<SessionSnapshot> => {
  const summary = await resolveSessionSummary(record);
  const messagesPayload = toSessionMessagesPayload(record, options);

  return {
    ...summary,
    messages: messagesPayload.messages,
    historyMeta: messagesPayload.historyMeta,
    interactiveRequests: messagesPayload.interactiveRequests,
    permissionRequests: messagesPayload.permissionRequests,
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
      disableModelInvocation: skill.disableModelInvocation === true,
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
  const settingsManager = createPiAgentScopeSettingsManager(cwd);
  const agentDir = getPiAgentScopeAgentDir();
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
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

const ensureSessionRecord = async (
  sessionId: string,
): Promise<SessionRecord> => {
  const existing = activeSessions.get(sessionId);
  if (existing) {
    return existing;
  }

  const opening = openingSessionRecords.get(sessionId);
  if (opening) {
    return opening;
  }

  const pendingRecord = (async (): Promise<SessionRecord> => {
    const lookup = await getIndexedSessionLookupOrThrow(sessionId);
    const sessionManager = SessionManager.open(lookup.sessionFile);
    const settingsManager = createPiAgentScopeSettingsManager(lookup.cwd);
    const recordState: Partial<SessionRecord> = {
      cwd: lookup.cwd,
      pendingAskRecords: new Map(),
      pendingPermissionRecords: new Map(),
      runtimePermissionRules: {},
      settingsManager,
      selectedAgentConfig: null,
      selectedPermissionPolicy: null,
    };
    const resourceLoader = createSessionResourceLoader(recordState as SessionRecord);
    await resourceLoader.reload();
    const { session } = await createAgentSession({
      cwd: lookup.cwd,
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
      createdAt: lookup.createdAt,
      updatedAt: lookup.updatedAt,
    });
    await restoreSessionSelection(record);
    return record;
  })().finally(() => {
    if (openingSessionRecords.get(sessionId) === pendingRecord) {
      openingSessionRecords.delete(sessionId);
    }
  });

  openingSessionRecords.set(sessionId, pendingRecord);
  return pendingRecord;
};

// ===== Routes =====

// ===== Notes API =====
const notesRouter = createNotesRouter(workspaceChatConfig);

app.get('/api/notes', notesRouter.listNotes);
app.get('/api/notes/content', notesRouter.getNoteContent);
app.put('/api/notes/content', notesRouter.saveNoteContent);
app.post('/api/notes', notesRouter.createNote);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get('/api/system/info', (_req: Request, res: Response) => {
  res.json({
    appName: 'Pi Web',
    workspaceDir: defaultWorkspaceDir,
    chatProjectId: workspaceChatConfig.chatProjectId,
    chatProjectPath: workspaceChatConfig.chatProjectPath,
    chatProjectLabel: workspaceChatConfig.chatProjectLabel,
    apiBase: `http://127.0.0.1:${port}`,
    sdkVersion: '0.65.2',
  });
});

app.get('/api/terminals', (_req: Request, res: Response) => {
  res.json({ terminals: terminalManager.listTerminals() });
});

app.post('/api/terminals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = terminalCreateSchema.parse(req.body ?? {}) as TerminalCreateRequest;
    const terminal = await terminalManager.createTerminal(payload);
    res.status(201).json(terminal);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/terminals/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = terminalUpdateSchema.parse(req.body ?? {});
    const terminal = terminalManager.updateTerminal(String(req.params.id), payload.title);
    res.json(terminal);
  } catch (error) {
    next(error);
  }
});

app.post('/api/terminals/:id/restart', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = terminalRestartSchema.parse(req.body ?? {});
    const terminal = await terminalManager.restartTerminal(String(req.params.id), payload);
    res.json(terminal);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/terminals/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const terminalId = String(req.params.id);
    terminalManager.deleteTerminal(terminalId);
    res.json({ ok: true, terminalId });
  } catch (error) {
    next(error);
  }
});

app.get('/api/providers', (_req: Request, res: Response) => {
  res.json(listProviders());
});

app.get('/api/agents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cwd = resolveDiscoveryCwd(req.query?.cwd);
    const agents = await discoverAgents(cwd);
    res.json(
      agents
        .filter((agent) => agent.enabled !== false && agent.mode !== 'task')
        .map(createAgentSummary),
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

    const cwd = resolveDiscoveryCwd(query.cwd);
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

    res.json(createAgentConfigResponse(agent));
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

    res.status(201).json(createAgentConfigResponse(agent));
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

    res.json(createAgentConfigResponse(agent));
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
    const { rootPath, targetPath } = await resolveManagedFileLocation({
      root: query.root,
      path: query.path,
      fallbackToRoot: true,
    });

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

app.get('/api/files/content', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = fileContentQuerySchema.parse(req.query ?? {});
    const { rootPath, targetPath, stats } = await ensureFileForPreview(query);
    const payload = await buildFilePreviewPayload(rootPath, targetPath, stats);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get('/api/files/content-window', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = fileContentWindowQuerySchema.parse(req.query ?? {});
    const { rootPath, targetPath, stats } = await ensureFileForPreview(query);
    const payload = await buildFilePreviewWindowPayload(
      rootPath,
      targetPath,
      stats,
      query.startLine,
      query.lineCount,
    );
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get('/api/files/blob', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = fileContentQuerySchema.parse(req.query ?? {});
    const { targetPath } = await ensureFileForPreview(query);
    const extension = path.extname(targetPath).toLowerCase();
    const mimeType = imageMimeTypesByExtension.get(extension);

    if (!mimeType) {
      const error = new Error('Only image previews are available through this endpoint') as HttpError;
      error.statusCode = 400;
      throw error;
    }

    res.type(mimeType);
    res.sendFile(targetPath);
  } catch (error) {
    next(error);
  }
});

app.put('/api/files/content', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = fileSaveSchema.parse(req.body ?? {});
    const { rootPath, targetPath, stats } = await ensureFileForPreview(payload);
    const extension = path.extname(targetPath).toLowerCase();

    if (!markdownExtensions.has(extension)) {
      const error = new Error('Only Markdown files can be edited') as HttpError;
      error.statusCode = 400;
      throw error;
    }

    await atomicWriteFile(targetPath, payload.content);
    const nextStats = await fs.stat(targetPath);

    const response: FileSaveResponse = {
      root: toPosixPath(rootPath),
      path: toPosixPath(targetPath),
      size: toFileSize(nextStats.size || stats.size),
      savedAt: Date.now(),
    };

    res.json(response);
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
      (entry) => entry.kind === 'directory' && !entry.name.startsWith('.'),
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

app.get('/api/session-contexts', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listIndexedSessionContexts());
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

    const isGit = await gitService.isGitRepository(projectPath);
    const project = await addProject(projectPath, isGit);
    projectContextResolver.invalidateContext();
    invalidateManagedProjectScopes();
    await refreshSessionCatalogIndex();
    res.json(serializeProject(project));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/projects/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.id);
    await removeProject(projectId);
    projectContextResolver.invalidateContext();
    invalidateManagedProjectScopes();
    await refreshSessionCatalogIndex();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/sessions', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sessions = await listIndexedSessions(activeSessions);

    const summaries = sessions.map((session) => ({
        id: session.id,
        title: session.title,
        cwd: String(session.cwd || ""),
        status: session.status,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        archived: session.archived,
        sessionFile: session.sessionFile,
        parentSessionId: session.parentSessionId,
        contextId: session.contextId,
      }));
    res.json(summaries);
  } catch (error) {
    next(error);
  }
});

app.get('/api/sessions/:sessionId/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = sessionSnapshotQuerySchema.parse(req.query ?? {});
    const sessionId = String(req.params.sessionId);
    const record = activeSessions.get(sessionId);
    if (record) {
      res.json(toSessionMessagesPayload(record, query));
      return;
    }

    res.json(await getStoredSessionMessagesPayload(sessionId, query));
  } catch (error) {
    next(error);
  }
});

app.get('/api/sessions/:sessionId/runtime', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = String(req.params.sessionId);
    const record = activeSessions.get(sessionId);
    if (record) {
      res.json(toSessionRuntimePayload(record));
      return;
    }

    res.json(await getStoredSessionRuntimePayload(sessionId));
  } catch (error) {
    next(error);
  }
});

app.get('/api/sessions/:sessionId/hydrate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = sessionSnapshotQuerySchema.parse(req.query ?? {});
    const sessionId = String(req.params.sessionId);
    const record = activeSessions.get(sessionId);
    if (record) {
      res.json({
        ...toSessionMessagesPayload(record, query),
        ...toSessionRuntimePayload(record),
      });
      return;
    }

    const [messagesPayload, runtimePayload] = await Promise.all([
      getStoredSessionMessagesPayload(sessionId, query),
      getStoredSessionRuntimePayload(sessionId),
    ]);
    res.json({ ...messagesPayload, ...runtimePayload });
  } catch (error) {
    next(error);
  }
});


app.get('/api/sessions/:sessionId/stream', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = sessionSnapshotQuerySchema.parse(req.query ?? {});
    const record = await ensureSessionRecord(String(req.params.sessionId));

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    record.clients.add(res);
    const messagesPayload = toSessionMessagesPayload(record, query);
    emit(record, {
      type: 'snapshot',
      sessionId: record.id,
      status: record.status,
      messages: messagesPayload.messages,
      historyMeta: messagesPayload.historyMeta,
      interactiveRequests: messagesPayload.interactiveRequests,
      permissionRequests: messagesPayload.permissionRequests,
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
      ? await getIndexedSessionLookupOrThrow(payload.parentSessionId)
      : null;
    const sessionCwd = normalizeOptionalFsPath(payload.cwd) || parentSession?.cwd || '';
    if (!sessionCwd) {
      const error = new Error('Session project is required') as HttpError;
      error.statusCode = 400;
      throw error;
    }

    await ensureManagedProjectScope(sessionCwd);
    const record = await createSessionRecord({
      cwd: sessionCwd,
      title: payload.title,
      model: payload.model,
      parentSessionPath: parentSession?.sessionFile,
    });
    await applySessionAgentSelection(record, {
      agentName: payload.agent || undefined,
      model: payload.model,
      thinkingLevel: payload.thinkingLevel,
    });
    await persistSessionRecordMetadata(record);
    await upsertIndexedSessionRecord(record, {
      projectContextResolver,
      workspaceChatConfig,
    });
    res.status(201).json(await toSessionSnapshot(record, {}));
  } catch (error) {
    next(error);
  }
});

app.patch('/api/sessions/:sessionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = updateSessionSchema.parse(req.body ?? {});
    const record = await ensureSessionRecord(String(req.params.sessionId));

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
    await upsertIndexedSessionRecord(record, {
      projectContextResolver,
      workspaceChatConfig,
    });

    res.json(await toSessionSnapshot(record, {}));
  } catch (error) {
    next(error);
  }
});

app.post('/api/sessions/:sessionId/archive', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = archiveSessionSchema.parse(req.body ?? {});
    const sessionIds = (await getIndexedSessionTree(String(req.params.sessionId))).map(
      (item) => item.id,
    );

    if (sessionIds.length === 0) {
      const error = new Error('Session not found') as HttpError;
      error.statusCode = 404;
      throw error;
    }

    await sessionMetadataStore.setArchived(sessionIds, payload.archived);

    res.json({ ok: true, sessionIds });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/sessions/:sessionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionTree = await getIndexedSessionTree(String(req.params.sessionId));
    if (sessionTree.length === 0) {
      const error = new Error('Session not found') as HttpError;
      error.statusCode = 404;
      throw error;
    }

    const sessionIds = sessionTree.map((item) => item.id);

    for (const item of sessionTree) {
      const sessionId = item.id;

      const activeRecord = activeSessions.get(sessionId);
      if (activeRecord) {
        destroySessionRecord(activeRecord);
      }

      await fs.rm(item.sessionFile, { force: true });
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
    const record = await ensureSessionRecord(String(req.params.sessionId));

    if (record.turnBudget.exhausted) {
      const error = new Error(
        '当前 agent 的最大轮次已耗尽，请重新选择 agent 或新建会话',
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


app.post('/api/sessions/:sessionId/asks/:askId/respond', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = askActionSchema.parse(req.body ?? {});
    const record = await ensureSessionRecord(String(req.params.sessionId));
    const askId = String(req.params.askId);

    if (payload.action === 'dismiss') {
      await settlePendingAsk(record, askId, [], true);
      res.json({ ok: true });
      return;
    }

    const answers = normalizeAskAnswers(record, askId, payload.answers);
    await settlePendingAsk(record, askId, answers, false);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});


app.post('/api/sessions/:sessionId/permissions/:requestId/respond', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = permissionActionSchema.parse(req.body ?? {});
    const record = await ensureSessionRecord(String(req.params.sessionId));
    const requestId = String(req.params.requestId);

    await settlePendingPermission(record, requestId, payload.action);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/sessions/:sessionId/abort', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const record = await ensureSessionRecord(String(req.params.sessionId));
    await record.session.abort();
    cancelPendingPermissions(record, 'Session aborted');
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

// ===== Worktree API =====

const worktreeValidateSchema = z.object({
  mode: z.enum(['new', 'existing']),
  branchName: z.string().optional(),
  existingBranch: z.string().optional(),
  worktreeName: z.string().optional(),
});

const worktreeCreateSchema = z.object({
  mode: z.enum(['new', 'existing']),
  branchName: z.string().optional(),
  existingBranch: z.string().optional(),
  worktreeName: z.string().optional(),
  startRef: z.string().optional(),
});

const worktreeDeleteSchema = z.object({
  worktreePath: z.string(),
  deleteLocalBranch: z.boolean().optional(),
  deleteRemoteBranch: z.boolean().optional(),
});

const resolveProjectRoot = async (projectId: string): Promise<string> => {
  const projects = await getProjects();
  const project = projects.projects.find((p) => p.id === projectId);
  if (!project) {
    const error = new Error(`Project not found: ${projectId}`) as HttpError;
    error.statusCode = 404;
    throw error;
  }
  return path.resolve(project.path);
};

app.get('/api/projects/:id/worktrees', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectRoot = await resolveProjectRoot(String(req.params.id));
    const isGit = await gitService.isGitRepository(projectRoot);
    if (!isGit) {
      res.json({ worktrees: [] });
      return;
    }
    const worktrees = await worktreeService.list(projectRoot);
    res.json({ worktrees });
  } catch (error) {
    next(error);
  }
});

app.post('/api/projects/:id/worktrees/validate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectRoot = await resolveProjectRoot(String(req.params.id));
    const payload = worktreeValidateSchema.parse(req.body ?? {});
    const result = await worktreeService.validate(projectRoot, payload);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/projects/:id/worktrees', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectRoot = await resolveProjectRoot(String(req.params.id));
    const payload = worktreeCreateSchema.parse(req.body ?? {});
    const metadata = await worktreeService.create(projectRoot, payload);
    projectContextResolver.invalidateContext();
    invalidateManagedProjectScopes();
    res.status(201).json(metadata);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/projects/:id/worktrees', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectRoot = await resolveProjectRoot(String(req.params.id));
    const payload = worktreeDeleteSchema.parse(req.body ?? {});
    const result = await worktreeService.remove(projectRoot, payload);
    projectContextResolver.invalidateContext();
    invalidateManagedProjectScopes();
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

// ===== Git API =====

const gitCwdQuerySchema = z.object({ cwd: z.string().optional() });

const resolveGitCwd = (rawCwd?: string): string => {
  return path.resolve(rawCwd || defaultWorkspaceDir);
};

app.get('/api/git/is-repo', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = gitCwdQuerySchema.parse(req.query ?? {});
    const cwd = resolveGitCwd(query.cwd);
    const isGitRepo = await gitService.isGitRepository(cwd);
    res.json({ isGitRepo });
  } catch (error) {
    next(error);
  }
});

app.get('/api/git/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = gitCwdQuerySchema.parse(req.query ?? {});
    const cwd = resolveGitCwd(query.cwd);
    const status = await gitService.getStatus(cwd);
    res.json(status);
  } catch (error) {
    next(error);
  }
});

app.get('/api/git/branches', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = gitCwdQuerySchema.parse(req.query ?? {});
    const cwd = resolveGitCwd(query.cwd);
    const branches = await gitService.getBranches(cwd);
    res.json(branches);
  } catch (error) {
    next(error);
  }
});

app.get('/api/git/remotes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = gitCwdQuerySchema.parse(req.query ?? {});
    const cwd = resolveGitCwd(query.cwd);
    const remotes = await gitService.getRemotes(cwd);
    res.json(remotes);
  } catch (error) {
    next(error);
  }
});

app.post('/api/git/fetch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cwd, remote, branch } = z.object({
      cwd: z.string(),
      remote: z.string().optional(),
      branch: z.string().optional(),
    }).parse(req.body ?? {});
    await gitService.fetch(resolveGitCwd(cwd), { remote, branch });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/git/pull', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cwd, remote } = z.object({
      cwd: z.string(),
      remote: z.string().optional(),
    }).parse(req.body ?? {});
    await gitService.pull(resolveGitCwd(cwd), { remote });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/git/push', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cwd, remote, branch, force } = z.object({
      cwd: z.string(),
      remote: z.string().optional(),
      branch: z.string().optional(),
      force: z.boolean().optional(),
    }).parse(req.body ?? {});
    await gitService.push(resolveGitCwd(cwd), { remote, branch, force });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/git/commit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cwd, message, files } = z.object({
      cwd: z.string(),
      message: z.string(),
      files: z.array(z.string()),
    }).parse(req.body ?? {});
    const result = await gitService.commit(resolveGitCwd(cwd), message, files);
    res.json({ ok: true, hash: result.hash });
  } catch (error) {
    next(error);
  }
});

app.post('/api/git/create-branch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cwd, branchName, fromRef } = z.object({
      cwd: z.string(),
      branchName: z.string(),
      fromRef: z.string().optional(),
    }).parse(req.body ?? {});
    await gitService.createBranch(resolveGitCwd(cwd), branchName, fromRef);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/git/checkout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cwd, branchName } = z.object({
      cwd: z.string(),
      branchName: z.string(),
    }).parse(req.body ?? {});
    await gitService.checkoutBranch(resolveGitCwd(cwd), branchName);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/git/rename-branch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cwd, oldName, newName } = z.object({
      cwd: z.string(),
      oldName: z.string(),
      newName: z.string(),
    }).parse(req.body ?? {});
    await gitService.renameBranch(resolveGitCwd(cwd), oldName, newName);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/git/merge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cwd, branchName } = z.object({
      cwd: z.string(),
      branchName: z.string(),
    }).parse(req.body ?? {});
    await gitService.merge(resolveGitCwd(cwd), branchName);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/git/rebase', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cwd, branchName } = z.object({
      cwd: z.string(),
      branchName: z.string(),
    }).parse(req.body ?? {});
    await gitService.rebase(resolveGitCwd(cwd), branchName);
    res.json({ ok: true });
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

const httpServer = createServer(app);
const terminalWebSocketServer = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (request, socket, head) => {
  const host = request.headers.host || `127.0.0.1:${port}`;
  const url = new URL(request.url || '/', `http://${host}`);
  const match = url.pathname.match(/^\/api\/terminals\/([^/]+)\/stream$/);

  if (!match) {
    socket.destroy();
    return;
  }

  const terminalId = decodeURIComponent(match[1]);
  if (!terminalManager.hasTerminal(terminalId)) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  terminalWebSocketServer.handleUpgrade(request, socket, head, (ws) => {
    terminalManager.attachSocket(terminalId, ws);
    terminalWebSocketServer.emit('connection', ws, request);
  });
});

// ===== Start Server =====
void ensureWorkspaceChatProject({
  workspaceDir: defaultWorkspaceDir,
  templateDir: workspaceChatTemplateDir,
})
  .then(() => initializeRidgeDb(defaultWorkspaceDir))
  .then(async () => {
    await refreshSessionCatalogIndex();
    httpServer.listen(port, () => {
      console.warn(`Pi server listening on http://127.0.0.1:${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize ridge.db', error);
    process.exit(1);
  });
